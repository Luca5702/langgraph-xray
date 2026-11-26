import { Hono } from "hono";
import { cors } from "hono/cors";
import { drizzle } from "drizzle-orm/d1";
import { eq, sql } from "drizzle-orm";
import { confusionLogs, kgEdges, kgNodes } from "./db/schema";
import { generateStructuredSprout, type SproutRequestPayload } from "./gemini";
import sourceContextData from "./generated/source_context.json";

export interface Env {
  DB: D1Database;
  GEMINI_API_KEY?: string;
  AI_GATEWAY_BASE_URL?: string;
}

const app = new Hono<{ Bindings: Env }>();

app.use("*", cors());

let schemaInitialized = false;

async function ensureSchema(d1: D1Database): Promise<void> {
  if (schemaInitialized) return;
  await d1.batch([
    d1.prepare(`CREATE TABLE IF NOT EXISTS kg_nodes (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      visibility TEXT NOT NULL DEFAULT 'candidate_cluster',
      chapter_id TEXT NOT NULL,
      origin_anchor TEXT,
      title TEXT NOT NULL,
      concise_markdown TEXT NOT NULL,
      heat_score INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS kg_edges (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      target TEXT NOT NULL,
      relation TEXT NOT NULL,
      style TEXT NOT NULL DEFAULT 'solid'
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS confusion_logs (
      id TEXT PRIMARY KEY,
      chapter_id TEXT NOT NULL,
      anchor_type TEXT NOT NULL,
      target_ref TEXT NOT NULL,
      zoom_level TEXT NOT NULL,
      superstep_frame_id INTEGER,
      active_lenses_json TEXT NOT NULL DEFAULT '[]',
      selected_text TEXT NOT NULL,
      user_question TEXT NOT NULL,
      sprout_response_json TEXT NOT NULL,
      confusion_type TEXT NOT NULL,
      endorsed_for_graph INTEGER NOT NULL DEFAULT 0,
      evolution_status TEXT NOT NULL DEFAULT 'logged',
      created_at INTEGER NOT NULL
    )`),
  ]);
  schemaInitialized = true;
}

app.get("/api/health", async (c) => {
  await ensureSchema(c.env.DB);
  return c.json({
    ok: true,
    service: "langgraph-xray-edge-api",
    langgraph_version: sourceContextData.langgraph_version,
    vendor_commit: sourceContextData.vendor_commit,
    gemini_configured: Boolean(c.env.GEMINI_API_KEY),
  });
});

app.get("/api/graph/:chapterId", async (c) => {
  await ensureSchema(c.env.DB);
  const chapterId = c.req.param("chapterId");
  const db = drizzle(c.env.DB);

  const nodes = await db
    .select()
    .from(kgNodes)
    .where(eq(kgNodes.chapterId, chapterId));
  const allEdges = await db.select().from(kgEdges);
  const nodeIdSet = new Set(nodes.map((n) => n.id));
  const edges = allEdges.filter((e) => nodeIdSet.has(e.source) || nodeIdSet.has(e.target));

  return c.json({ nodes, edges });
});

app.post("/api/sprout", async (c) => {
  await ensureSchema(c.env.DB);
  const body = (await c.req.json()) as SproutRequestPayload;
  const headerApiKey = c.req.header("x-gemini-api-key");

  const { response, mode } = await generateStructuredSprout(body, {
    apiKey: headerApiKey || c.env.GEMINI_API_KEY,
    aiGatewayBaseUrl: c.env.AI_GATEWAY_BASE_URL,
  });

  const logId = crypto.randomUUID();
  const db = drizzle(c.env.DB);
  await db.insert(confusionLogs).values({
    id: logId,
    chapterId: body.chapter_id,
    anchorType: body.anchor_type,
    targetRef: body.target_ref,
    zoomLevel: body.zoom_level,
    superstepFrameId: body.superstep_frame_id ?? null,
    activeLensesJson: JSON.stringify(body.active_lenses ?? []),
    selectedText: body.selected_text,
    userQuestion: body.user_question,
    sproutResponseJson: JSON.stringify(response),
    confusionType: response.confusion_type,
    endorsedForGraph: false,
    evolutionStatus: "logged",
    createdAt: new Date(),
  });

  return c.json({
    log_id: logId,
    mode,
    sprout: response,
  });
});

app.post("/api/endorse", async (c) => {
  await ensureSchema(c.env.DB);
  const { log_id, parent_node_id } = (await c.req.json()) as {
    log_id: string;
    parent_node_id?: string;
  };
  const db = drizzle(c.env.DB);

  const existingLogs = await db
    .select()
    .from(confusionLogs)
    .where(eq(confusionLogs.id, log_id));
  if (existingLogs.length === 0) {
    return c.json({ ok: false, error: "log_id not found" }, 404);
  }
  const logRow = existingLogs[0];

  await db
    .update(confusionLogs)
    .set({ endorsedForGraph: true, evolutionStatus: "clustered_l1" })
    .where(eq(confusionLogs.id, log_id));

  const parsed = JSON.parse(logRow.sproutResponseJson) as {
    title: string;
    concise_markdown: string;
    referenced_symbols?: string[];
  };
  const candidateNodeId = `candidate_${log_id.slice(0, 8)}`;

  await db
    .insert(kgNodes)
    .values({
      id: candidateNodeId,
      kind: "insight",
      visibility: "candidate_cluster",
      chapterId: logRow.chapterId,
      originAnchor: logRow.targetRef,
      title: parsed.title,
      conciseMarkdown: parsed.concise_markdown,
      heatScore: 5,
      createdAt: new Date(),
    })
    .onConflictDoUpdate({
      target: kgNodes.id,
      set: { heatScore: sql`${kgNodes.heatScore} + 1` },
    });

  if (parent_node_id) {
    await db
      .insert(kgEdges)
      .values({
        id: `edge_${parent_node_id}_${candidateNodeId}`,
        source: parent_node_id,
        target: candidateNodeId,
        relation: "evolves_to",
        style: "solid",
      })
      .onConflictDoNothing();
  }

  return c.json({ ok: true, candidate_node_id: candidateNodeId });
});

async function runL1Clustering(d1: D1Database) {
  await ensureSchema(d1);
  const grouped = await d1
    .prepare(
      `SELECT chapter_id, target_ref, confusion_type, selected_text, sprout_response_json,
              COUNT(*) as cnt, MAX(endorsed_for_graph) as endorsed
       FROM confusion_logs
       GROUP BY chapter_id, target_ref, confusion_type
       HAVING cnt >= 3 OR endorsed = 1`
    )
    .all<{
      chapter_id: string;
      target_ref: string;
      confusion_type: string;
      selected_text: string;
      sprout_response_json: string;
      cnt: number;
      endorsed: number;
    }>();

  const clusters = [];
  for (const row of grouped.results ?? []) {
    const parsed = JSON.parse(row.sprout_response_json) as {
      title: string;
      concise_markdown: string;
      referenced_symbols?: string[];
    };
    const cid = `cluster_${row.chapter_id}_${btoa(encodeURIComponent(row.target_ref)).slice(0, 10).replace(/[^a-zA-Z0-9]/g, "")}`;
    await d1
      .prepare(
        `INSERT INTO kg_nodes (id, kind, visibility, chapter_id, origin_anchor, title, concise_markdown, heat_score, created_at)
         VALUES (?, 'insight', 'candidate_cluster', ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET heat_score = excluded.heat_score`
      )
      .bind(
        cid,
        row.chapter_id,
        row.target_ref,
        parsed.title,
        parsed.concise_markdown,
        row.cnt,
        Date.now()
      )
      .run();

    clusters.push({
      count: row.cnt,
      endorsed_for_graph: Boolean(row.endorsed),
      chapter_id: row.chapter_id,
      target_ref: row.target_ref,
      confusion_type: row.confusion_type,
      selected_text: row.selected_text,
      title: parsed.title,
      distilled_answer: parsed.concise_markdown,
      referenced_symbols: parsed.referenced_symbols ?? [],
    });
  }
  return clusters;
}

app.post("/api/admin/cluster", async (c) => {
  const clusters = await runL1Clustering(c.env.DB);
  return c.json({ ok: true, promoted_count: clusters.length, clusters });
});

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runL1Clustering(env.DB));
  },
};
