import React, { useEffect, useMemo, useState } from "react";
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
import { ArrowUpRight, Compass } from "lucide-react";
import type {
  ConceptCardConfig,
  ExtendedGraphNode,
  KernelBundle,
  KnowledgeGraphEdge,
} from "../types/bundle";

const elk = new ELK();

interface AtlasCardData extends Record<string, unknown> {
  node: ExtendedGraphNode;
  onTeleport: (chapterId: string, symbolId?: string) => void;
}

const AtlasNodeCard: React.FC<NodeProps<Node<AtlasCardData>>> = ({ data }) => {
  const { node, onTeleport } = data;
  return (
    <div className={`rf-node-card ${node.kind}`} style={{ width: 255, padding: "9px 11px" }}>
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: "var(--accent-teal)", width: 6, height: 6 }}
      />
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 10,
          color: "var(--text-muted)",
          marginBottom: 3,
        }}
      >
        <span className="mono">{node.kind.toUpperCase()}</span>
        {node.heat_score ? <span>🔥 {node.heat_score}</span> : null}
      </div>
      <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4 }}>{node.title}</div>
      <div
        style={{
          fontSize: 11,
          color: "var(--text-secondary)",
          display: "-webkit-box",
          WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {node.concise_markdown}
      </div>
      <div className="nodrag" style={{ marginTop: 7, textAlign: "right" }}>
        <button
          type="button"
          className="icon-btn"
          style={{ padding: "2px 6px", fontSize: 10.5, color: "var(--accent-teal)" }}
          onClick={() =>
            onTeleport(
              node.chapter_id,
              node.kind === "symbol" ? node.id : undefined
            )
          }
        >
          进入解剖台 <ArrowUpRight size={10} />
        </button>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: "var(--accent-teal)", width: 6, height: 6 }}
      />
    </div>
  );
};

const ATLAS_NODE_TYPES = { atlasCard: AtlasNodeCard };

interface GlobalAtlasViewProps {
  publicNodes: ExtendedGraphNode[];
  publicEdges: KnowledgeGraphEdge[];
  personalNodes: ExtendedGraphNode[];
  personalEdges: KnowledgeGraphEdge[];
  symbols: KernelBundle["symbols"];
  concepts: Record<string, ConceptCardConfig>;
  onTeleportToChapter: (chapterId: string, symbolId?: string) => void;
}

export const GlobalAtlasView: React.FC<GlobalAtlasViewProps> = ({
  publicNodes,
  publicEdges,
  personalNodes,
  personalEdges,
  symbols,
  concepts,
  onTeleportToChapter,
}) => {
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [rfNodes, setRfNodes] = useState<Array<Node<AtlasCardData>>>([]);
  const [rfEdges, setRfEdges] = useState<Edge[]>([]);

  const { allNodes, allEdges } = useMemo(() => {
    const map = new Map<string, ExtendedGraphNode>();
    [...publicNodes, ...personalNodes].forEach((n) => map.set(n.id, n));

    const combinedEdges = [...publicEdges, ...personalEdges];
    combinedEdges.forEach((e) => {
      if (!map.has(e.target)) {
        const sym = symbols[e.target];
        if (sym) {
          map.set(e.target, {
            id: sym.symbol_id,
            kind: "symbol",
            visibility: "crystallized_public",
            chapter_id: "ch02_superstep_barrier",
            title: `${sym.name}`,
            concise_markdown: sym.fields[0]?.duty_cn ?? "",
          });
        } else {
          const c = concepts[e.target];
          if (c) {
            map.set(e.target, {
              id: c.concept_id,
              kind: c.node_kind === "theory" ? "theory" : "syntax",
              visibility: "crystallized_public",
              chapter_id: "ch02_superstep_barrier",
              title: c.title,
              concise_markdown: c.tier1_tldr,
            });
          }
        }
      }
    });

    const filteredNodes = Array.from(map.values()).filter((n) =>
      kindFilter === "all" ? true : n.kind === kindFilter
    );
    const validIds = new Set(filteredNodes.map((n) => n.id));
    const filteredEdges = combinedEdges.filter(
      (e) => validIds.has(e.source) && validIds.has(e.target)
    );

    return { allNodes: filteredNodes, allEdges: filteredEdges };
  }, [publicNodes, publicEdges, personalNodes, personalEdges, symbols, concepts, kindFilter]);

  useEffect(() => {
    let cancelled = false;
    async function runLayout() {
      const g = {
        id: "atlas",
        layoutOptions: {
          "elk.algorithm": "layered",
          "elk.direction": "RIGHT",
          "elk.layered.spacing.nodeNodeBetweenLayers": "110",
          "elk.spacing.nodeNode": "30",
        },
        children: allNodes.map((n) => ({ id: n.id, width: 255, height: 132 })),
        edges: allEdges.map((e) => ({
          id: e.id,
          sources: [e.source],
          targets: [e.target],
        })),
      };
      const out = await elk.layout(g);
      if (cancelled) return;

      setRfNodes(
        (out.children ?? []).map((c) => ({
          id: c.id,
          type: "atlasCard",
          position: { x: c.x ?? 0, y: c.y ?? 0 },
          data: {
            node: allNodes.find((n) => n.id === c.id)!,
            onTeleport: onTeleportToChapter,
          },
        }))
      );

      setRfEdges(
        allEdges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          style: {
            stroke:
              e.style === "solid" ? "var(--accent-teal)" : "var(--accent-amber)",
            strokeWidth: 1.5,
            strokeDasharray: e.style === "dashed" ? "4 3" : undefined,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color:
              e.style === "solid" ? "var(--accent-teal)" : "var(--accent-amber)",
          },
        }))
      );
    }
    void runLayout();
    return () => {
      cancelled = true;
    };
  }, [allNodes, allEdges, onTeleportToChapter]);

  return (
    <div className="canvas-stage" style={{ flexDirection: "column" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "7px 14px",
          background: "var(--bg-panel)",
          borderBottom: "1px solid var(--border-subtle)",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Compass size={15} color="var(--accent-teal)" />
          <strong>全六关 LangGraph 内核知识星图</strong>
          <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
            共 {allNodes.length} 个知识节点 · {allEdges.length} 条跨章节语义耦合边（点击任意节点直达对应关卡解剖台）
          </span>
        </div>

        <div className="segmented-group">
          {[
            ["all", "全部节点"],
            ["spine", "⚓ 六关主脊柱"],
            ["insight", "🌿 演化洞见"],
            ["symbol", "📌 核心静态类"],
            ["theory", "📄 Pregel 论文"],
          ].map(([k, label]) => (
            <button
              key={k}
              type="button"
              className={`seg-btn ${kindFilter === k ? "active" : ""}`}
              onClick={() => setKindFilter(k)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={ATLAS_NODE_TYPES}
          fitView
          fitViewOptions={{ padding: 0.16 }}
          minZoom={0.3}
          maxZoom={1.4}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={24} size={1} color="var(--border-subtle)" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  );
};
