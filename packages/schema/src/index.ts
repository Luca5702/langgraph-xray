/**
 * Single Source of Truth Data Contracts for LangGraph X-Ray (PRD v1.2 §5)
 * Shared across `apps/web` (Workbench & Semantic Canvas) and `apps/edge-api` (Cloudflare Workers + D1 + Gemini).
 */

export type ZoomLevel = "L0" | "L1" | "L2" | "L3";

export type KnowledgeLens = "python_syntax" | "pregel_paper" | "runnable_contract";

export type LifecyclePhase =
  | "build"
  | "compile"
  | "superstep_plan"
  | "superstep_execute"
  | "superstep_apply_writes"
  | "checkpoint_save"
  | "stream_or_interrupt";

export type NodeRuntimeStatus = "idle" | "planned" | "active" | "committed" | "interrupted";

// ============================================================================
// 5.1 Deterministic Kernel Trace Protocol (TraceRecording)
// ============================================================================

export interface SourceAnchor {
  file: string;
  function: string;
  highlight_lines: [number, number];
}

export interface TaskSnapshot {
  name: string;
  triggers: string[];
  input: Record<string, unknown>;
}

export interface MemorySnapshot {
  channel_values: Record<string, unknown>;
  channel_versions: Record<string, number>;
  versions_seen: Record<string, Record<string, number>>;
  pending_writes: Array<{ task_name: string; channel: string; value: unknown }>;
  tasks_queue: TaskSnapshot[];
  scratchpad?: Record<string, unknown>;
}

export interface TraceFrame {
  frame_id: number;
  superstep: number;
  lifecycle_phase: LifecyclePhase;
  source_anchor: SourceAnchor;
  node_statuses: Record<string, NodeRuntimeStatus>;
  memory_snapshot: MemorySnapshot;
}

export interface TraceRecording {
  chapter_id: string;
  langgraph_version: string;
  topology: {
    nodes: string[];
    edges: Array<[string, string]>;
  };
  frames: TraceFrame[];
}

// ============================================================================
// 5.2 Progressive Complexity Fold Protocol (SourceFoldConfig)
// ============================================================================

export type FoldCategory = "telemetry" | "async_compat" | "retry_policy" | "type_validation" | "boilerplate";

export interface L2FoldRange {
  start_line: number;
  end_line: number;
  category: FoldCategory;
  summary_label: string;
}

export interface SourceFoldConfig {
  file_path: string;
  l1_skeleton_code: string;
  l2_folds: L2FoldRange[];
}

// ============================================================================
// 5.3 Orthogonal Prerequisite Concept Card Protocol (ConceptCardConfig)
// ============================================================================

export interface PaperBridgeSlice {
  type: "paper_bridge";
  citation: string;
  original_quote: string;
  langgraph_adaptation: string;
}

export interface PythonSandboxSlice {
  type: "python_sandbox";
  minimal_code: string;
  expected_stdout: string;
}

export interface ConceptCardConfig {
  concept_id: string;
  node_kind: "theory" | "syntax" | "contract";
  lens: KnowledgeLens;
  title: string;
  tier1_tldr: string;
  tier1_analogy: string;
  tier2_slice: PaperBridgeSlice | PythonSandboxSlice;
  ast_matchers: string[];
}

// ============================================================================
// 5.4 At-Hand Static Blueprint & Jedi Local-Var Resolution (SymbolBlueprint)
// ============================================================================

export interface SymbolFieldSpec {
  name: string;
  type_repr: string;
  duty_cn: string;
  live_binding_path?: string;
}

export interface SymbolBlueprint {
  symbol_id: string;
  name: string;
  kind: "class" | "TypedDict" | "NamedTuple" | "ABC" | "function";
  defined_in: {
    file: string;
    start_line: number;
    end_line: number;
  };
  fields: SymbolFieldSpec[];
  subclasses_summary?: Array<{ name: string; behavior_diff_cn: string }>;
  raw_excerpt: string;
}

export interface SemanticTokenLink {
  line: number;
  col_start: number;
  col_end: number;
  token: string;
  target_symbol: string;
  inferred_local: boolean;
}

// ============================================================================
// 5.5 Unified Typed Knowledge Graph & Gemini Structured Sprout Protocol
// ============================================================================

export type KnowledgeNodeKind = "spine" | "symbol" | "theory" | "syntax" | "insight";

export type KnowledgeNodeVisibility = "local_personal" | "candidate_cluster" | "crystallized_public";

export type KnowledgeEdgeRelation =
  | "evolves_to"
  | "references_symbol"
  | "grounds_in_theory"
  | "uses_syntax"
  | "contrasts_with";

export interface KnowledgeGraphNode {
  id: string;
  kind: KnowledgeNodeKind;
  visibility: KnowledgeNodeVisibility;
  chapter_id: string;
  origin_anchor?: string;
  title: string;
  concise_markdown: string;
  heat_score?: number;
}

export interface KnowledgeGraphEdge {
  id: string;
  source: string;
  target: string;
  relation: KnowledgeEdgeRelation;
  style: "solid" | "dashed";
}

export type ConfusionType =
  | "langgraph_logic"
  | "prerequisite_python"
  | "prerequisite_theory"
  | "edge_case";

export interface SuggestedSpark {
  label: string;
  dimension: "mechanism" | "edge_case" | "theory" | "python";
}

export interface GeminiSproutResponse {
  title: string;
  concise_markdown: string;
  confusion_type: ConfusionType;
  referenced_symbols: string[];
  referenced_concepts: string[];
  suggested_sparks: SuggestedSpark[];
}

/**
 * JSON Schema passed directly to Google Gemini 2.5 Flash `responseSchema`
 * to guarantee atomic graph cards instead of unstructured chat walls.
 */
export const GEMINI_SPROUT_RESPONSE_JSON_SCHEMA = {
  type: "OBJECT",
  required: [
    "title",
    "concise_markdown",
    "confusion_type",
    "referenced_symbols",
    "referenced_concepts",
    "suggested_sparks",
  ],
  properties: {
    title: {
      type: "STRING",
      description: "Concise atomic card title (<= 18 Chinese chars).",
    },
    concise_markdown: {
      type: "STRING",
      description:
        "Grounded explanation (<= 180 words) strictly citing exact LangGraph source file and line numbers.",
    },
    confusion_type: {
      type: "STRING",
      enum: ["langgraph_logic", "prerequisite_python", "prerequisite_theory", "edge_case"],
    },
    referenced_symbols: {
      type: "ARRAY",
      items: { type: "STRING" },
      description: "Fully qualified LangGraph symbol IDs mentioned in this answer for auto-linking on canvas.",
    },
    referenced_concepts: {
      type: "ARRAY",
      items: { type: "STRING" },
      description: "ConceptCard IDs (Pregel paper or Python syntax) connected to this answer.",
    },
    suggested_sparks: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        required: ["label", "dimension"],
        properties: {
          label: { type: "STRING" },
          dimension: {
            type: "STRING",
            enum: ["mechanism", "edge_case", "theory", "python"],
          },
        },
      },
    },
  },
} as const;
