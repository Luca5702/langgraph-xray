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
  FolderTree,
  Pin,
  Send,
  Sparkles,
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

const SemanticGraphCardNode: React.FC<NodeProps<Node<CanvasCardData>>> = ({ data }) => {
  const { kgNode, collapsed, hasChildren, onToggleCollapse, onSparkClick, onPinSymbol, onEndorseNode } =
    data;

  const badgeMap: Record<string, string> = {
    spine: "⚓ 主脊柱锚点",
    insight:
      kgNode.visibility === "local_personal"
        ? "🌱 个人探索分支 (IndexedDB)"
        : "🌿 社区结晶支线",
    symbol: "📌 自动互链静态契约",
    theory: "📄 Pregel 论文节点",
    syntax: "🐍 Python 语法节点",
  };

  return (
    <div className={`rf-node-card ${kgNode.kind}`}>
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: "var(--accent-teal)", width: 7, height: 7 }}
      />

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 4,
          gap: 6,
        }}
      >
        <span style={{ fontSize: 10.5, fontWeight: 600, color: "var(--text-muted)" }}>
          {badgeMap[kgNode.kind] ?? kgNode.kind}
        </span>
        {kgNode.heat_score !== undefined && kgNode.kind === "insight" && (
          <span
            className="mono"
            style={{
              fontSize: 10,
              padding: "1px 5px",
              borderRadius: 8,
              background: "var(--accent-emerald-soft)",
              color: "var(--accent-emerald)",
            }}
          >
            🔥 {kgNode.heat_score}
          </span>
        )}
      </div>

      <div
        style={{
          fontWeight: 700,
          fontSize: 12.5,
          marginBottom: 5,
          color: "var(--text-primary)",
        }}
      >
        {kgNode.title}
      </div>

      <div
        style={{
          fontSize: 11.5,
          color: "var(--text-secondary)",
          lineHeight: 1.55,
        }}
      >
        {kgNode.concise_markdown}
      </div>

      {/* Follow-up 2nd/3rd-order Spark Branches */}
      {!collapsed && kgNode.suggested_sparks && kgNode.suggested_sparks.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {kgNode.suggested_sparks.slice(0, 2).map((sp, i) => (
            <button
              key={i}
              type="button"
              className="spark-btn nodrag"
              onClick={() => onSparkClick(kgNode.id, sp)}
            >
              🌱 追问：{sp.label}
            </button>
          ))}
        </div>
      )}

      {/* Node Footer Actions */}
      <div
        className="nodrag"
        style={{
          marginTop: 8,
          paddingTop: 6,
          borderTop: "1px solid var(--border-subtle)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 6,
        }}
      >
        {kgNode.kind === "symbol" ? (
          <button
            type="button"
            className="icon-btn"
            style={{ padding: "2px 6px", fontSize: 10.5 }}
            onClick={() => onPinSymbol(kgNode.id)}
          >
            <Pin size={10} /> 钉回手边器械盘
          </button>
        ) : kgNode.kind === "insight" ? (
          <button
            type="button"
            className="icon-btn"
            style={{
              padding: "2px 6px",
              fontSize: 10.5,
              color: kgNode.endorsed ? "var(--accent-emerald)" : undefined,
            }}
            onClick={() => onEndorseNode(kgNode)}
          >
            <ThumbsUp size={10} />
            {kgNode.endorsed ? "已推荐结晶" : "推荐共享至公共图谱"}
          </button>
        ) : (
          <span />
        )}

        {hasChildren && (
          <button
            type="button"
            className="icon-btn"
            style={{ padding: "2px 6px", fontSize: 10.5 }}
            onClick={() => onToggleCollapse(kgNode.id)}
          >
            <FolderTree size={10} />
            {collapsed ? "展开子树" : "折叠子树"}
          </button>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        style={{ background: "var(--accent-teal)", width: 7, height: 7 }}
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

  // Assemble chapter subgraph + materialize cross-linked SymbolNodes & ConceptNodes automatically
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

    // Materialize referenced SymbolBlueprints & ConceptCards so dashed cross-links close into a true Graph
    rawEdges.forEach((e) => {
      if (!nodeMap.has(e.target)) {
        const sym = symbols[e.target];
        if (sym) {
          nodeMap.set(e.target, {
            id: sym.symbol_id,
            kind: "symbol",
            visibility: "crystallized_public",
            chapter_id: chapter.chapter_id,
            title: `${sym.kind} ${sym.name}`,
            concise_markdown: sym.fields
              .slice(0, 2)
              .map((f) => `• ${f.name}: ${f.duty_cn}`)
              .join(" "),
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

    // Respect collapsed subtrees along solid `evolves_to` edges
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

    return {
      graphNodes: visibleNodes,
      graphEdges: visibleEdges,
      solidChildrenMap: solidChildren,
    };
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

  // Run ELK layered left-to-right auto-layout whenever graphNodes/graphEdges change
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
          "elk.layered.spacing.nodeNodeBetweenLayers": "95",
          "elk.spacing.nodeNode": "36",
          "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
        },
        children: graphNodes.map((n) => ({
          id: n.id,
          width: n.kind === "spine" ? 295 : 280,
          height: n.suggested_sparks?.length ? 215 : 155,
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
        animated: e.style === "solid",
        style: {
          stroke:
            e.style === "solid" ? "var(--accent-teal)" : "var(--accent-amber)",
          strokeWidth: e.style === "solid" ? 1.8 : 1.3,
          strokeDasharray: e.style === "dashed" ? "5 4" : undefined,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color:
            e.style === "solid" ? "var(--accent-teal)" : "var(--accent-amber)",
        },
        label:
          e.relation === "references_symbol"
            ? "引用结构"
            : e.relation === "grounds_in_theory"
              ? "论文根源"
              : e.relation === "uses_syntax"
                ? "语法机制"
                : undefined,
        labelStyle: { fill: "var(--text-muted)", fontSize: 10 },
        labelBgStyle: { fill: "var(--bg-canvas)", fillOpacity: 0.85 },
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
    "对比 Google Pregel 2010 原版论文，这里做了什么工程改造？",
    "这里的局部变量与底层 Channel 是如何配合实现零锁隔离的？",
  ];

  const chapterPersonalCount = personalNodes.filter(
    (n) => n.chapter_id === chapter.chapter_id
  ).length;

  return (
    <div className="canvas-stage" aria-label="受控自动生长语义画布">
      {/* Left Docked Origin Spine Control Panel */}
      <div
        style={{
          width: 310,
          flexShrink: 0,
          background: "var(--bg-panel)",
          borderRight: "1px solid var(--border-subtle)",
          display: "flex",
          flexDirection: "column",
          zIndex: 5,
        }}
      >
        <div className="pane-header">
          <button
            type="button"
            className="icon-btn"
            onClick={onBackToWorkbench}
          >
            <ArrowLeft size={13} /> 返回聚焦解剖台
          </button>
          <span className="mono" style={{ fontSize: 11, color: "var(--accent-teal)" }}>
            ELK 自动拓扑
          </span>
        </div>

        <div className="pane-scroll" style={{ padding: 12 }}>
          <div
            style={{
              padding: 10,
              borderRadius: 6,
              background: "var(--bg-canvas)",
              border: "1px solid var(--accent-teal)",
              marginBottom: 12,
            }}
          >
            <div style={{ fontSize: 11, color: "var(--accent-teal)", fontWeight: 600 }}>
              ⚓ 锁定源头时空锚点
            </div>
            <div style={{ fontWeight: 700, fontSize: 12.5, marginTop: 3 }}>
              {chapter.number} · {chapter.title}
            </div>
            <div className="mono" style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
              当前相位：{currentFrame.phase_label ?? currentFrame.lifecycle_phase}
            </div>
            {pendingAnchorContext && (
              <div
                className="mono"
                style={{
                  marginTop: 6,
                  padding: "5px 7px",
                  borderRadius: 4,
                  background: "var(--bg-elevated)",
                  fontSize: 11,
                  color: "var(--accent-amber)",
                }}
              >
                划选片段：“{pendingAnchorContext.selectedText.slice(0, 72)}”
              </div>
            )}
          </div>

          <form onSubmit={handleSubmitSprout} style={{ marginBottom: 14 }}>
            <label
              htmlFor="canvas-sprout-input"
              style={{
                display: "block",
                fontSize: 11.5,
                fontWeight: 600,
                marginBottom: 5,
              }}
            >
              🌱 向任意方向派生新图谱节点：
            </label>
            <textarea
              id="canvas-sprout-input"
              value={questionInput}
              onChange={(e) => setQuestionInput(e.target.value)}
              placeholder="输入你的追问（大模型将输出原子图谱卡片并自动虚线连回底层类定义）..."
              rows={3}
              style={{
                width: "100%",
                background: "var(--bg-canvas)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-strong)",
                borderRadius: 6,
                padding: 8,
                fontSize: 12,
                resize: "vertical",
              }}
            />
            <button
              id="btn-submit-sprout"
              type="submit"
              disabled={isSprouting}
              className="seg-btn active"
              style={{
                width: "100%",
                justifyContent: "center",
                marginTop: 6,
                padding: "7px 10px",
              }}
            >
              <Send size={12} />
              {isSprouting ? "正在结构化生长节点..." : "向右自动生长探索节点"}
            </button>
          </form>

          <div style={{ marginBottom: 14 }}>
            <div
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                marginBottom: 5,
              }}
            >
              <Sparkles size={11} style={{ verticalAlign: "middle", marginRight: 4 }} />
              一键多维探索灵感：
            </div>
            {quickPrompts.map((qp, idx) => (
              <button
                key={idx}
                type="button"
                className="spark-btn"
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
                ↗ {qp}
              </button>
            ))}
          </div>

          <div
            style={{
              paddingTop: 10,
              borderTop: "1px solid var(--border-subtle)",
              fontSize: 11.5,
              color: "var(--text-muted)",
            }}
          >
            <div>━━ 实线：一阶/二阶追问演化树</div>
            <div style={{ marginTop: 3 }}>┅┅ 虚线：跨概念静态类/论文图谱闭合</div>
            <div
              style={{
                marginTop: 10,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>本地个人分支：{chapterPersonalCount} 个</span>
              {chapterPersonalCount > 0 && (
                <button
                  type="button"
                  className="icon-btn"
                  style={{ fontSize: 11, color: "var(--accent-coral)" }}
                  onClick={onClearPersonalChapterBranches}
                >
                  <Trash2 size={11} /> 清空个人草稿
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Right ELK Auto-Layout Semantic Graph Canvas */}
      <div style={{ flex: 1, height: "100%" }}>
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={NODE_TYPES}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.45}
          maxZoom={1.35}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={22} size={1} color="var(--border-subtle)" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  );
};
