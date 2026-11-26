import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import ELK from "elkjs/lib/elk.bundled.js";
import {
  ArrowLeft,
  CornerDownRight,
  Pin,
  Plus,
  ThumbsUp,
  Trash2,
} from "lucide-react";
import type {
  ChapterCurriculum,
  ConceptCardConfig,
  ExtendedGraphNode,
  KernelBundle,
  KnowledgeGraphEdge,
  SuggestedSpark,
  TraceFrame,
} from "../types/bundle";
import { InlineMarkdown } from "./InlineMarkdown";

const elk = new ELK();

interface CanvasCardData extends Record<string, unknown> {
  kgNode: ExtendedGraphNode;
  collapsed: boolean;
  hasChildren: boolean;
  onToggleCollapse: (nodeId: string) => void;
  onSparkClick: (parentNodeId: string, spark: SuggestedSpark) => void;
  onPinSymbol: (symId: string) => void;
  onEndorseNode: (node: ExtendedGraphNode) => void;
}

const KIND_META: Record<string, { eyebrow: string; dotColor: string }> = {
  spine: { eyebrow: "SPINE ANCHOR", dotColor: "var(--sig-blue)" },
  insight: { eyebrow: "INSIGHT", dotColor: "var(--sig-green)" },
  symbol: { eyebrow: "SYMBOL CONTRACT", dotColor: "var(--ink-muted)" },
  theory: { eyebrow: "PAPER · SIGMOD '10", dotColor: "var(--sig-amber)" },
  syntax: { eyebrow: "PYTHON RUNTIME", dotColor: "var(--sig-amber)" },
};

const SemanticGraphCardNode: React.FC<NodeProps<Node<CanvasCardData>>> = ({
  data,
}) => {
  const {
    kgNode,
    collapsed,
    hasChildren,
    onToggleCollapse,
    onSparkClick,
    onPinSymbol,
    onEndorseNode,
  } = data;

  const meta = KIND_META[kgNode.kind] ?? {
    eyebrow: kgNode.kind.toUpperCase(),
    dotColor: "var(--ink-muted)",
  };

  return (
    <div className={`kg-card ${kgNode.kind === "spine" ? "spine" : ""}`}>
      <Handle
        type="target"
        position={Position.Left}
        style={{
          background: "var(--bg-surface-3)",
          border: "1px solid var(--ink-muted)",
          width: 6,
          height: 6,
        }}
      />

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span
          className="eyebrow"
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <span className="dot" style={{ background: meta.dotColor }} />
          {kgNode.visibility === "local_personal" ? "PERSONAL DRAFT" : meta.eyebrow}
        </span>

        {kgNode.heat_score !== undefined && kgNode.kind === "insight" && (
          <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-faint)" }}>
            +{kgNode.heat_score}
          </span>
        )}
      </div>

      <div className="kg-card-title">{kgNode.title}</div>
      <div className="kg-card-body">
        <InlineMarkdown text={kgNode.concise_markdown} />
      </div>

      {!collapsed && kgNode.suggested_sparks && kgNode.suggested_sparks.length > 0 && (
        <div className="nodrag" style={{ marginTop: 8 }}>
          {kgNode.suggested_sparks.slice(0, 2).map((sp, i) => (
            <button
              key={i}
              type="button"
              className="spark-link"
              onClick={() => onSparkClick(kgNode.id, sp)}
            >
              <CornerDownRight
                size={11}
                strokeWidth={1.5}
                style={{ flexShrink: 0, marginTop: 2 }}
              />
              <span>{sp.label}</span>
            </button>
          ))}
        </div>
      )}

      <div
        className="nodrag"
        style={{
          marginTop: 10,
          paddingTop: 7,
          borderTop: "1px solid var(--hairline)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 6,
        }}
      >
        {kgNode.kind === "symbol" ? (
          <button
            type="button"
            onClick={() => onPinSymbol(kgNode.id)}
            style={{
              border: "none",
              background: "transparent",
              padding: 0,
              fontSize: 11,
              color: "var(--ink-muted)",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              cursor: "pointer",
            }}
          >
            <Pin size={11} strokeWidth={1.5} /> Pin to Tray
          </button>
        ) : kgNode.kind === "insight" ? (
          <button
            type="button"
            onClick={() => onEndorseNode(kgNode)}
            style={{
              border: "none",
              background: "transparent",
              padding: 0,
              fontSize: 11,
              color: kgNode.endorsed ? "var(--sig-green)" : "var(--ink-muted)",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              cursor: "pointer",
            }}
          >
            <ThumbsUp size={11} strokeWidth={1.5} />
            {kgNode.endorsed ? "Endorsed" : "Endorse"}
          </button>
        ) : (
          <span />
        )}

        {hasChildren && (
          <button
            type="button"
            onClick={() => onToggleCollapse(kgNode.id)}
            style={{
              border: "none",
              background: "transparent",
              padding: 0,
              fontSize: 11,
              color: "var(--ink-muted)",
              cursor: "pointer",
            }}
          >
            {collapsed ? "Expand" : "Collapse"}
          </button>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        style={{
          background: "var(--bg-surface-3)",
          border: "1px solid var(--ink-muted)",
          width: 6,
          height: 6,
        }}
      />
    </div>
  );
};

const NODE_TYPES = { semanticCard: SemanticGraphCardNode };

interface SemanticCanvasViewProps {
  chapter: ChapterCurriculum;
  currentFrame: TraceFrame & { phase_label?: string };
  publicNodes: ExtendedGraphNode[];
  publicEdges: KnowledgeGraphEdge[];
  personalNodes: ExtendedGraphNode[];
  personalEdges: KnowledgeGraphEdge[];
  symbols: KernelBundle["symbols"];
  concepts: Record<string, ConceptCardConfig>;
  pendingAnchorContext: { selectedText: string; targetRef: string } | null;
  isSprouting: boolean;
  onSproutQuestion: (
    parentNodeId: string,
    question: string,
    selectedText: string,
    targetRef: string
  ) => Promise<void>;
  onEndorseNode: (node: ExtendedGraphNode) => void;
  onClearPersonalChapterBranches: () => void;
  onPinSymbolAndReturn: (symId: string) => void;
  onBackToWorkbench: () => void;
}

export const SemanticCanvasView: React.FC<SemanticCanvasViewProps> = ({
  chapter,
  currentFrame,
  publicNodes,
  publicEdges,
  personalNodes,
  personalEdges,
  symbols,
  concepts,
  pendingAnchorContext,
  isSprouting,
  onSproutQuestion,
  onEndorseNode,
  onClearPersonalChapterBranches,
  onPinSymbolAndReturn,
  onBackToWorkbench,
}) => {
  const [questionInput, setQuestionInput] = useState("");
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [rfNodes, setRfNodes] = useState<Array<Node<CanvasCardData>>>([]);
  const [rfEdges, setRfEdges] = useState<Edge[]>([]);

  const primarySpineId =
    publicNodes.find(
      (n) => n.chapter_id === chapter.chapter_id && n.kind === "spine"
    )?.id ?? `spine_${chapter.chapter_id}`;

  const toggleCollapse = useCallback((nid: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(nid)) next.delete(nid);
      else next.add(nid);
      return next;
    });
  }, []);

  const handleSparkClick = useCallback(
    (parentNodeId: string, spark: SuggestedSpark) => {
      void onSproutQuestion(
        parentNodeId,
        spark.label,
        spark.label,
        `${chapter.chapter_id}#spark`
      );
    },
    [chapter.chapter_id, onSproutQuestion]
  );

  const { graphNodes, graphEdges } = useMemo(() => {
    const chNodes = [
      ...publicNodes.filter((n) => n.chapter_id === chapter.chapter_id),
      ...personalNodes.filter((n) => n.chapter_id === chapter.chapter_id),
    ];
    const nodeMap = new Map<string, ExtendedGraphNode>();
    chNodes.forEach((n) => nodeMap.set(n.id, n));

    const rawEdges = [...publicEdges, ...personalEdges].filter((e) =>
      nodeMap.has(e.source)
    );

    rawEdges.forEach((e) => {
      if (!nodeMap.has(e.target)) {
        const sym = symbols[e.target];
        if (sym) {
          nodeMap.set(e.target, {
            id: sym.symbol_id,
            kind: "symbol",
            visibility: "crystallized_public",
            chapter_id: chapter.chapter_id,
            title: sym.name,
            concise_markdown: sym.fields
              .slice(0, 2)
              .map((f) => `${f.name.split(":")[0]}: ${f.duty_cn}`)
              .join(" · "),
          });
        } else {
          const conc = concepts[e.target];
          if (conc) {
            nodeMap.set(e.target, {
              id: conc.concept_id,
              kind: conc.node_kind === "theory" ? "theory" : "syntax",
              visibility: "crystallized_public",
              chapter_id: chapter.chapter_id,
              title: conc.title,
              concise_markdown: conc.tier1_tldr,
            });
          }
        }
      }
    });

    const hiddenSet = new Set<string>();
    const solidChildren = new Map<string, string[]>();
    rawEdges.forEach((e) => {
      if (e.style === "solid") {
        const arr = solidChildren.get(e.source) ?? [];
        arr.push(e.target);
        solidChildren.set(e.source, arr);
      }
    });

    const markDescendantsHidden = (startId: string) => {
      for (const childId of solidChildren.get(startId) ?? []) {
        hiddenSet.add(childId);
        markDescendantsHidden(childId);
      }
    };
    collapsedIds.forEach((cid) => markDescendantsHidden(cid));

    const visibleNodes = Array.from(nodeMap.values()).filter(
      (n) => !hiddenSet.has(n.id)
    );
    const visibleIds = new Set(visibleNodes.map((n) => n.id));
    const visibleEdges = rawEdges.filter(
      (e) => visibleIds.has(e.source) && visibleIds.has(e.target)
    );

    return { graphNodes: visibleNodes, graphEdges: visibleEdges };
  }, [
    chapter.chapter_id,
    publicNodes,
    publicEdges,
    personalNodes,
    personalEdges,
    symbols,
    concepts,
    collapsedIds,
  ]);

  useEffect(() => {
    let cancelled = false;
    const parentHasSolidChild = new Set(
      [...publicEdges, ...personalEdges]
        .filter((e) => e.style === "solid")
        .map((e) => e.source)
    );

    async function layoutWithElk() {
      const elkGraph = {
        id: "root",
        layoutOptions: {
          "elk.algorithm": "layered",
          "elk.direction": "RIGHT",
          "elk.layered.spacing.nodeNodeBetweenLayers": "104",
          "elk.spacing.nodeNode": "34",
          "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
        },
        children: graphNodes.map((n) => ({
          id: n.id,
          width: n.kind === "spine" ? 298 : 284,
          height: n.suggested_sparks?.length ? 220 : 162,
        })),
        edges: graphEdges.map((e) => ({
          id: e.id,
          sources: [e.source],
          targets: [e.target],
        })),
      };

      const laidOut = await elk.layout(elkGraph);
      if (cancelled) return;

      const nextNodes: Array<Node<CanvasCardData>> = (laidOut.children ?? []).map(
        (c) => {
          const kgNode = graphNodes.find((n) => n.id === c.id)!;
          return {
            id: c.id,
            type: "semanticCard",
            position: { x: c.x ?? 0, y: c.y ?? 0 },
            data: {
              kgNode,
              collapsed: collapsedIds.has(c.id),
              hasChildren: parentHasSolidChild.has(c.id),
              onToggleCollapse: toggleCollapse,
              onSparkClick: handleSparkClick,
              onPinSymbol: onPinSymbolAndReturn,
              onEndorseNode,
            },
          };
        }
      );

      const nextEdges: Edge[] = graphEdges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        style: {
          stroke:
            e.style === "solid" ? "var(--edge-solid)" : "var(--edge-dashed)",
          strokeWidth: 1.25,
          strokeDasharray: e.style === "dashed" ? "4 4" : undefined,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 14,
          height: 14,
          color:
            e.style === "solid" ? "var(--edge-solid)" : "var(--edge-dashed)",
        },
      }));

      setRfNodes(nextNodes);
      setRfEdges(nextEdges);
    }

    void layoutWithElk();
    return () => {
      cancelled = true;
    };
  }, [
    graphNodes,
    graphEdges,
    collapsedIds,
    publicEdges,
    personalEdges,
    toggleCollapse,
    handleSparkClick,
    onPinSymbolAndReturn,
    onEndorseNode,
  ]);

  const handleSubmitSprout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!questionInput.trim()) return;
    const q = questionInput.trim();
    setQuestionInput("");
    await onSproutQuestion(
      primarySpineId,
      q,
      pendingAnchorContext?.selectedText || chapter.title,
      pendingAnchorContext?.targetRef || currentFrame.source_anchor.file
    );
  };

  const quickPrompts = [
    "如果并行分支其中一个抛异常，另一个已写入的结果会回滚吗？",
    "对比 Google Pregel 2010 原版论文，这里做了什么工程演进？",
    "局部变量与底层 Channel 如何配合做到无锁读写隔离？",
  ];

  const chapterPersonalCount = personalNodes.filter(
    (n) => n.chapter_id === chapter.chapter_id
  ).length;

  return (
    <div className="canvas-stage" aria-label="受控自动生长语义画布">
      <aside className="canvas-sidebar">
        <div className="col-bar">
          <button
            type="button"
            onClick={onBackToWorkbench}
            style={{
              border: "none",
              background: "transparent",
              padding: 0,
              color: "var(--ink-secondary)",
              fontSize: 12,
              fontWeight: 500,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              cursor: "pointer",
            }}
          >
            <ArrowLeft size={13} strokeWidth={1.6} />
            Workbench
          </button>
          <span className="eyebrow">AUTO-DAG</span>
        </div>

        <div className="pane-scroll" style={{ padding: 16 }}>
          <div
            style={{
              paddingBottom: 14,
              marginBottom: 16,
              borderBottom: "1px solid var(--hairline)",
            }}
          >
            <div className="eyebrow">ORIGIN ANCHOR · {chapter.number}</div>
            <div
              style={{
                fontSize: 13.5,
                fontWeight: 600,
                marginTop: 5,
                color: "var(--ink)",
              }}
            >
              {chapter.title}
            </div>
            <div
              className="mono"
              style={{ fontSize: 11, color: "var(--ink-muted)", marginTop: 4 }}
            >
              Frame #{currentFrame.frame_id} · Step {currentFrame.superstep}
            </div>
            {pendingAnchorContext && (
              <div
                className="mono"
                style={{
                  marginTop: 8,
                  padding: "6px 8px",
                  borderRadius: 6,
                  background: "var(--bg-surface-1)",
                  border: "1px solid var(--hairline)",
                  fontSize: 11,
                  color: "var(--ink-secondary)",
                }}
              >
                “{pendingAnchorContext.selectedText.slice(0, 76)}”
              </div>
            )}
          </div>

          <form onSubmit={handleSubmitSprout} style={{ marginBottom: 18 }}>
            <div className="eyebrow" style={{ marginBottom: 6 }}>
              SPROUT NEW BRANCH
            </div>
            <textarea
              id="canvas-sprout-input"
              value={questionInput}
              onChange={(e) => setQuestionInput(e.target.value)}
              placeholder="围绕当前源码提出追问，自动向右排布卡片并关联静态类契约..."
              rows={3}
              style={{
                width: "100%",
                background: "var(--bg-surface-1)",
                color: "var(--ink)",
                border: "1px solid var(--hairline-strong)",
                borderRadius: 7,
                padding: "8px 10px",
                fontSize: 12.2,
                lineHeight: 1.5,
                resize: "vertical",
                outline: "none",
              }}
            />
            <button
              id="btn-submit-sprout"
              type="submit"
              disabled={isSprouting}
              className="primary-cta"
              style={{
                width: "100%",
                justifyContent: "center",
                marginTop: 8,
                height: 30,
              }}
            >
              <Plus size={13} strokeWidth={1.8} />
              {isSprouting ? "Synthesizing Node..." : "Sprout Branch"}
            </button>
          </form>

          <div style={{ marginBottom: 18 }}>
            <div className="eyebrow" style={{ marginBottom: 4 }}>
              SUGGESTED DIRECTIONS
            </div>
            {quickPrompts.map((qp, idx) => (
              <button
                key={idx}
                type="button"
                className="spark-link"
                disabled={isSprouting}
                onClick={() =>
                  void onSproutQuestion(
                    primarySpineId,
                    qp,
                    pendingAnchorContext?.selectedText || qp,
                    pendingAnchorContext?.targetRef || currentFrame.source_anchor.file
                  )
                }
              >
                <CornerDownRight
                  size={11}
                  strokeWidth={1.5}
                  style={{ flexShrink: 0, marginTop: 2 }}
                />
                <span>{qp}</span>
              </button>
            ))}
          </div>

          <div
            style={{
              paddingTop: 14,
              borderTop: "1px solid var(--hairline)",
              fontSize: 11.5,
              color: "var(--ink-muted)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="mono" style={{ color: "var(--ink-faint)" }}>
                ───
              </span>
              <span>演化追问树 (Tree Lineage)</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
              <span className="mono" style={{ color: "var(--ink-faint)" }}>
                - - -
              </span>
              <span>跨概念结构闭合 (Graph Closure)</span>
            </div>

            {chapterPersonalCount > 0 && (
              <div
                style={{
                  marginTop: 12,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span>Local drafts: {chapterPersonalCount}</span>
                <button
                  type="button"
                  className="subtle-btn"
                  onClick={onClearPersonalChapterBranches}
                >
                  <Trash2 size={11} strokeWidth={1.5} /> Reset
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      <div style={{ flex: 1, height: "100%" }}>
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={NODE_TYPES}
          fitView
          fitViewOptions={{ padding: 0.22 }}
          minZoom={0.4}
          maxZoom={1.35}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={24} size={1} color="var(--canvas-dots)" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  );
};
