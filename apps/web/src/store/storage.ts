import { get, set } from "idb-keyval";
import type {
  ExtendedGraphNode,
  GeminiSproutResponse,
  KnowledgeGraphEdge,
  KnowledgeLens,
} from "../types/bundle";

const PERSONAL_GRAPH_IDB_KEY = "langgraph_xray_personal_graph_v1";
const LENS_STORAGE_KEY = "langgraph_xray_lenses_v1";
const SETTINGS_STORAGE_KEY = "langgraph_xray_settings_v1";

export interface PersonalGraphStore {
  nodes: ExtendedGraphNode[];
  edges: KnowledgeGraphEdge[];
}

export interface UserEngineSettings {
  geminiApiKey: string;
  edgeApiBaseUrl: string;
}

export async function loadPersonalGraph(): Promise<PersonalGraphStore> {
  try {
    const saved = await get<PersonalGraphStore>(PERSONAL_GRAPH_IDB_KEY);
    return saved ?? { nodes: [], edges: [] };
  } catch {
    return { nodes: [], edges: [] };
  }
}

export async function savePersonalGraph(store: PersonalGraphStore): Promise<void> {
  try {
    await set(PERSONAL_GRAPH_IDB_KEY, store);
  } catch {
    // Ignore private-browsing IndexedDB quota restrictions gracefully
  }
}

export function loadActiveLenses(): KnowledgeLens[] {
  try {
    const raw = localStorage.getItem(LENS_STORAGE_KEY);
    if (!raw) return ["python_syntax", "pregel_paper", "runnable_contract"];
    return JSON.parse(raw) as KnowledgeLens[];
  } catch {
    return ["python_syntax", "pregel_paper", "runnable_contract"];
  }
}

export function saveActiveLenses(lenses: KnowledgeLens[]): void {
  try {
    localStorage.setItem(LENS_STORAGE_KEY, JSON.stringify(lenses));
  } catch {
    // Ignore storage errors
  }
}

export function loadEngineSettings(): UserEngineSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { geminiApiKey: "", edgeApiBaseUrl: "" };
    return JSON.parse(raw) as UserEngineSettings;
  } catch {
    return { geminiApiKey: "", edgeApiBaseUrl: "" };
  }
}

export function saveEngineSettings(s: UserEngineSettings): void {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Ignore storage errors
  }
}

export interface SproutInput {
  chapter_id: string;
  anchor_type: "tutorial_mdx" | "source_code" | "graph_node";
  target_ref: string;
  zoom_level: "L0" | "L1" | "L2" | "L3";
  superstep_frame_id: number;
  active_lenses: KnowledgeLens[];
  selected_text: string;
  user_question: string;
  memory_summary: string;
}

export async function requestSproutBranch(
  input: SproutInput
): Promise<{ sprout: GeminiSproutResponse; log_id?: string; mode: string }> {
  const settings = loadEngineSettings();
  const apiBase = settings.edgeApiBaseUrl.trim().replace(/\/$/, "");
  const endpoint = `${apiBase}/api/sprout`;

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (settings.geminiApiKey.trim()) {
      headers["x-gemini-api-key"] = settings.geminiApiKey.trim();
    }

    const resp = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(input),
    });
    if (resp.ok) {
      const data = (await resp.json()) as {
        sprout: GeminiSproutResponse;
        log_id?: string;
        mode: string;
      };
      return data;
    }
  } catch {
    // Static export mode fallback when Cloudflare Worker dev server isn't reachable
  }

  return {
    sprout: clientSideGroundedFallback(input),
    mode: "static_local_engine",
  };
}

export async function endorseBranchToCommunity(
  logId: string | undefined,
  parentNodeId: string
): Promise<boolean> {
  if (!logId) return false;
  const settings = loadEngineSettings();
  const apiBase = settings.edgeApiBaseUrl.trim().replace(/\/$/, "");
  try {
    const resp = await fetch(`${apiBase}/api/endorse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ log_id: logId, parent_node_id: parentNodeId }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

function clientSideGroundedFallback(input: SproutInput): GeminiSproutResponse {
  const q = `${input.selected_text} ${input.user_question}`.toLowerCase();
  if (q.includes("interrupt") || q.includes("resume") || q.includes("重放")) {
    return {
      title: "GraphInterrupt 冒泡与序号对表",
      concise_markdown:
        "`types.py:interrupt()` 通过 `PregelScratchpad.interrupt_counter()` 生成调用序号：首次未命中恢复值时抛出 `GraphInterrupt` 终止超步并写入 `pending_writes`；`Command(resume=...)` 重跑节点函数时直接按序号返回缓存值。",
      confusion_type: "langgraph_logic",
      referenced_symbols: [
        "langgraph.errors.GraphInterrupt",
        "langgraph._internal._scratchpad.PregelScratchpad",
      ],
      referenced_concepts: ["py-exception-control-flow"],
      suggested_sparks: [
        { label: "节点内多个 interrupt() 如何防止错位？", dimension: "mechanism" },
        { label: "为什么 interrupt() 前严禁写非幂等副作用？", dimension: "edge_case" },
      ],
    };
  }
  if (q.includes("barrier") || q.includes("汇聚") || q.includes("seen")) {
    return {
      title: "NamedBarrierValue 集合门闩机制",
      concise_markdown:
        "多源汇聚边编译为 `NamedBarrierValue`（`channels/named_barrier_value.py`）：每轮屏障 `update()` 将到达节点并入 `self.seen`，集齐 `self.names` 后 `is_available()` 翻真，下游消费时 `consume()` 清空重置。",
      confusion_type: "langgraph_logic",
      referenced_symbols: ["langgraph.channels.named_barrier_value.NamedBarrierValue"],
      referenced_concepts: ["pregel-superstep-barrier"],
      suggested_sparks: [
        { label: "如果其中一个前置分支永远未被路由执行怎么办？", dimension: "edge_case" },
      ],
    };
  }
  return {
    title: `源码剖析：${(input.selected_text || input.user_question).slice(0, 12)}`,
    concise_markdown: `锚定 \`${input.target_ref}\`：在超步状态机中，节点仅在 \`channel_versions[c] > versions_seen[node][c]\` 时由 \`_proc_input\` 注入只读快照唤醒，产出暂存任务私有 \`deque\`，直至 \`apply_writes\` 屏障才全局可见。`,
    confusion_type: "langgraph_logic",
    referenced_symbols: [
      "langgraph.pregel._read.PregelNode",
      "langgraph.checkpoint.base.Checkpoint",
    ],
    referenced_concepts: ["pregel-vote-to-halt"],
    suggested_sparks: [
      { label: "如果在 Execute 半途发生异常，Channel 会被污染吗？", dimension: "edge_case" },
      { label: "对比 Google Pregel 原版论文设计有何差异？", dimension: "theory" },
    ],
  };
}
