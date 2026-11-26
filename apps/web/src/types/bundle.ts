import type {
  ConceptCardConfig,
  GeminiSproutResponse,
  KnowledgeGraphEdge,
  KnowledgeGraphNode,
  KnowledgeLens,
  L2FoldRange,
  SemanticTokenLink,
  SuggestedSpark,
  SymbolBlueprint,
  TraceFrame,
  TraceRecording,
} from "@langgraph-xray/schema";
import rawBundle from "../generated/kernel_bundle.json";

export type ViewGear = "workbench" | "canvas" | "atlas";

export interface TutorialSection {
  block_id: string;
  spine_node_id: string;
  heading: string;
  paragraphs: string[];
  margin_note?: {
    q: string;
    a: string;
  };
}

export interface ChapterCurriculum {
  chapter_id: string;
  number: string;
  title: string;
  subtitle: string;
  core_question: string;
  default_slice_id: string;
  available_slice_ids: string[];
  default_pinned_symbols: string[];
  sections: TutorialSection[];
}

export interface ProbeBundle {
  trace: TraceRecording & {
    frames: Array<TraceFrame & { phase_label?: string }>;
  };
  l0_view: {
    probe_code: string;
    input_state: Record<string, unknown>;
    output_state: Record<string, unknown>;
  };
}

export interface SourceBlock {
  qualname: string;
  file_path: string;
  start_line: number;
  end_line: number;
  lines: string[];
  l2_folds: L2FoldRange[];
  token_links: SemanticTokenLink[];
}

export interface SourceSlice {
  slice_id: string;
  chapter_ids: string[];
  title: string;
  primary_file: string;
  l1_skeleton_code: string;
  blocks: SourceBlock[];
}

export interface ExtendedGraphNode extends KnowledgeGraphNode {
  suggested_sparks?: SuggestedSpark[];
  log_id?: string;
  endorsed?: boolean;
}

export interface KernelBundle {
  meta: {
    langgraph_version: string;
    vendor_commit: string;
    chapter_count: number;
    symbol_count: number;
    concept_count: number;
  };
  chapters: ChapterCurriculum[];
  probes: Record<string, ProbeBundle>;
  source_slices: Record<string, SourceSlice>;
  symbols: Record<
    string,
    SymbolBlueprint & {
      fields: Array<{
        name: string;
        type_repr: string;
        duty_cn: string;
        live_key?: string;
      }>;
    }
  >;
  concepts: Record<string, ConceptCardConfig>;
  public_graph: {
    nodes: ExtendedGraphNode[];
    edges: KnowledgeGraphEdge[];
  };
}

export const KERNEL_BUNDLE = rawBundle as unknown as KernelBundle;

export type {
  ConceptCardConfig,
  GeminiSproutResponse,
  KnowledgeGraphEdge,
  KnowledgeLens,
  SuggestedSpark,
  SymbolBlueprint,
  TraceFrame,
};
