import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Unified Typed Knowledge Graph Nodes (Cloudflare D1 / Local SQLite)
 * Stores candidate & crystallized nodes grown from reader explorations.
 */
export const kgNodes = sqliteTable("kg_nodes", {
  id: text("id").primaryKey(),
  kind: text("kind", {
    enum: ["spine", "symbol", "theory", "syntax", "insight"],
  }).notNull(),
  visibility: text("visibility", {
    enum: ["local_personal", "candidate_cluster", "crystallized_public"],
  })
    .notNull()
    .default("candidate_cluster"),
  chapterId: text("chapter_id").notNull(),
  originAnchor: text("origin_anchor"),
  title: text("title").notNull(),
  conciseMarkdown: text("concise_markdown").notNull(),
  heatScore: integer("heat_score").notNull().default(1),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

/**
 * Directed Semantic Edges (Tree Growth + Cross-Node Graph Closure)
 */
export const kgEdges = sqliteTable("kg_edges", {
  id: text("id").primaryKey(),
  source: text("source").notNull(),
  target: text("target").notNull(),
  relation: text("relation", {
    enum: [
      "evolves_to",
      "references_symbol",
      "grounds_in_theory",
      "uses_syntax",
      "contrasts_with",
    ],
  }).notNull(),
  style: text("style", { enum: ["solid", "dashed"] }).notNull().default("solid"),
});

/**
 * Confusion Signals & Sprout Logs (PRD v1.2 §4.7 & §5.5)
 * Feeds L1 Cron Clustering & L2 GitHub Actions Maintainer Agent PRs.
 */
export const confusionLogs = sqliteTable("confusion_logs", {
  id: text("id").primaryKey(),
  chapterId: text("chapter_id").notNull(),
  anchorType: text("anchor_type", { enum: ["tutorial_mdx", "source_code", "graph_node"] }).notNull(),
  targetRef: text("target_ref").notNull(),
  zoomLevel: text("zoom_level", { enum: ["L0", "L1", "L2", "L3"] }).notNull(),
  superstepFrameId: integer("superstep_frame_id"),
  activeLensesJson: text("active_lenses_json").notNull().default("[]"),
  selectedText: text("selected_text").notNull(),
  userQuestion: text("user_question").notNull(),
  sproutResponseJson: text("sprout_response_json").notNull(),
  confusionType: text("confusion_type", {
    enum: ["langgraph_logic", "prerequisite_python", "prerequisite_theory", "edge_case"],
  }).notNull(),
  endorsedForGraph: integer("endorsed_for_graph", { mode: "boolean" }).notNull().default(false),
  evolutionStatus: text("evolution_status", {
    enum: ["logged", "clustered_l1", "pr_submitted_l2", "crystallized"],
  })
    .notNull()
    .default("logged"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});
