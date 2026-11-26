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

const KIND_META: Record<string, { label: string; dotColor: string }> = {
  spine: { label: "章节主线", dotColor: "var(--clay)" },
  insight: { label: "延伸思考", dotColor: "var(--ink-sage)" },
  symbol: { label: "核心结构", dotColor: "var(--ink-blue)" },
  theory: { label: "论文溯源", dotColor: "var(--ink-amber)" },
  syntax: { label: "Python 机制", dotColor: "var(--ink-amber)" },
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
    label: "知识卡片",
    dotColor: "var(--ink-muted)",
  };

  return (
    <div className={`kg-card ${kgNode.kind === "spine" ? "spine" : ""}`}>
      <Handle
        type="target"
        position={Position.Left}
        style={{
          background: "var(--bg-sand)",
          border: "1.5px solid var(--edge-solid)",
          width: 7,
          height: 7,
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
        <span className="kg-badge">
          <span className="dot" style={{ background: meta.dotColor }} />
          {kgNode.visibility === "local_personal" ? "我的追问笔记" : meta.label}
        </span>

        {kgNode.heat_score !== undefined && kgNode.kind === "insight" && (
          <span style={{ fontSize: 11, color: "var(--ink-muted)" }}>
            {kgNode.heat_score} 人觉得有启发
          </span>
        )}
      </div>

      <div className="kg-card-title">{kgNode.title}</div>
      <div className="kg-card-body">
        <InlineMarkdown text={kgNode.concise_markdown} />
      </div>

      {!collapsed &&
        kgNode.suggested_sparks &&
        kgNode.suggested_sparks.length > 0 && (
          <div className="nodrag" style={{ marginTop: 10 }}>
            {kgNode.suggested_sparks.slice(0, 2).map((sp, i) => (
              <button
                key={i}
                type="button"
                className="spark-link"
                onClick={() => onSparkClick(kgNode.id, sp)}
              >
                <CornerDownRight
                  size={12}
                  strokeWidth={1.6}
                  color="var(--clay)"
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
          marginTop: 12,
          paddingTop: 8,
          borderTop: "1px solid var(--border-soft)",
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
              fontSize: 11.5,
              fontWeight: 500,
              color: "var(--ink-blue)",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              cursor: "pointer",
            }}
          >
            <Pin size={12} strokeWidth={1.6} /> 固定到手边卡
          </button>
        ) : kgNode.kind === "insight" ? (
          <button
            type="button"
            onClick={() => onEndorseNode(kgNode)}
            style={{
              border: "none",
              background: "transparent",
              padding: 0,
              fontSize: 11.5,
              fontWeight: 500,
              color: kgNode.endorsed ? "var(--ink-sage)" : "var(--ink-muted)",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              cursor: "pointer",
            }}
          >
            <ThumbsUp size={12} strokeWidth={1.6} />
            {kgNode.endorsed ? "已标记有启发" : "很有启发"}
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
              fontSize: 11.5,
              color: "var(--ink-muted)",
              cursor: "pointer",
            }}
          >
            {collapsed ? "展开分支" : "收起分支"}
          </button>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        style={{
          background: "var(--bg-sand)",
          border: "1.5px solid var(--edge-solid)",
          width: 7,
          height: 7,
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
              .map((f) => `${f.name.split(":")[0]}：${f.duty_cn}`)
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
          "elk.layered.spacing.nodeNodeBetweenLayers": "116",
          "elk.spacing.nodeNode": "42",
          "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
        },
        children: graphNodes.map((n) => {
          const bodyLines = Math.max(2, Math.ceil(n.concise_markdown.length / 20));
          const sparkCount = collapsedIds.has(n.id)
            ? 0
            : Math.min(2, n.suggested_sparks?.length ?? 0);
          return {
            id: n.id,
            width: n.kind === "spine" ? 304 : 288,
            height: 116 + bodyLines * 21 + sparkCount * 54,
          };
        }),
        edges: graphEdges.map((e) => ({
          id: e.id,
          sources: [e.source],
          targets: [e.target],
        })),
      };

      const laidOut = await elk.layout(elkGraph);
      if (cancelled) return;

      const nextNodes: Array<Node<CanvasCardData>> = (
        laidOut.children ?? []
      ).map((c) => {
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
      });

      const nextEdges: Edge[] = graphEdges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        style: {
          stroke:
            e.style === "solid" ? "var(--edge-solid)" : "var(--edge-dashed)",
          strokeWidth: 1.4,
          strokeDasharray: e.style === "dashed" ? "5 5" : undefined,
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
    "如果两个并行分支里有一个报错了，另一个已算完的结果会保留吗？",
    "对比 Google Pregel 原版论文，LangGraph 在工程上做了什么取舍？",
    "局部快照和底层 Channel 是怎么配合做到不加锁也不串味的？",
  ];

  const chapterPersonalCount = personalNodes.filter(
    (n) => n.chapter_id === chapter.chapter_id
  ).length;

  return (
    <div className="canvas-stage" aria-label="思维生长画布">
      <aside className="canvas-sidebar">
        <div className="col-bar">
          <button
            type="button"
            onClick={onBackToWorkbench}
            style={{
              border: "none",
              background: "transparent",
              padding: 0,
              color: "var(--ink-body)",
              fontSize: 12.5,
              fontWeight: 600,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              cursor: "pointer",
            }}
          >
            <ArrowLeft size={14} strokeWidth={1.8} />
            回到伴读工作台
          </button>
          <span className="chapter-num-badge" style={{ fontSize: 11 }}>
            自动整理排版
          </span>
        </div>

        <div className="pane-scroll" style={{ padding: 18 }}>
          <div
            style={{
              paddingBottom: 14,
              marginBottom: 16,
              borderBottom: "1px solid var(--border-soft)",
            }}
          >
            <div className="eyebrow">当前探讨起点</div>
            <div
              style={{
                fontFamily: "var(--font-serif)",
                fontSize: 15,
                fontWeight: 600,
                marginTop: 5,
                color: "var(--ink)",
                lineHeight: 1.4,
              }}
            >
              {chapter.title}
            </div>
            <div
              style={{
                fontSize: 11.8,
                color: "var(--ink-muted)",
                marginTop: 4,
              }}
            >
              对应第 {currentFrame.superstep} 轮超步 · 第 {currentFrame.frame_id}{" "}
              幕
            </div>
            {pendingAnchorContext && (
              <div
                style={{
                  marginTop: 9,
                  padding: "8px 10px",
                  borderRadius: 9,
                  background: "var(--bg-callout)",
                  borderLeft: "3px solid var(--clay)",
                  fontSize: 11.8,
                  color: "var(--ink-body)",
                }}
              >
                “{pendingAnchorContext.selectedText.slice(0, 76)}”
              </div>
            )}
          </div>

          <form onSubmit={handleSubmitSprout} style={{ marginBottom: 18 }}>
            <div className="eyebrow" style={{ marginBottom: 7 }}>
              顺着这里继续追问
            </div>
            <textarea
              id="canvas-sprout-input"
              value={questionInput}
              onChange={(e) => setQuestionInput(e.target.value)}
              placeholder="写下你的好奇或疑惑，AI 会结合当前源码长出一张新卡片并自动排版…"
              rows={3}
              style={{
                width: "100%",
                background: "var(--bg-card)",
                color: "var(--ink)",
                border: "1px solid var(--border-medium)",
                borderRadius: 10,
                padding: "9px 11px",
                fontSize: 12.5,
                lineHeight: 1.55,
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
                marginTop: 9,
                height: 34,
              }}
            >
              <Plus size={14} strokeWidth={2} />
              {isSprouting ? "正在为你梳理卡片…" : "生成思考卡片"}
            </button>
          </form>

          <div style={{ marginBottom: 18 }}>
            <div className="eyebrow" style={{ marginBottom: 6 }}>
              或者试试这几个好问题：
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
                    pendingAnchorContext?.targetRef ||
                      currentFrame.source_anchor.file
                  )
                }
              >
                <CornerDownRight
                  size={12}
                  strokeWidth={1.6}
                  color="var(--clay)"
                  style={{ flexShrink: 0, marginTop: 2 }}
                />
                <span>{qp}</span>
              </button>
            ))}
          </div>

          <div
            style={{
              paddingTop: 14,
              borderTop: "1px solid var(--border-soft)",
              fontSize: 12,
              color: "var(--ink-muted)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="mono" style={{ color: "var(--edge-solid)" }}>
                ───
              </span>
              <span>顺着问题一步步深入的脉络</span>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginTop: 5,
              }}
            >
              <span className="mono" style={{ color: "var(--edge-dashed)" }}>
                - - -
              </span>
              <span>自动串联的相关结构卡与背景知识</span>
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
                <span>我的本关笔记：{chapterPersonalCount} 张</span>
                <button
                  type="button"
                  className="subtle-btn"
                  onClick={onClearPersonalChapterBranches}
                >
                  <Trash2 size={12} strokeWidth={1.6} /> 清空笔记
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      <div className="canvas-board-wrap">
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={NODE_TYPES}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.4}
          maxZoom={1.35}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={24} size={1.2} color="var(--canvas-dots)" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  );
};
