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
import { ArrowUpRight } from "lucide-react";
import type {
  ConceptCardConfig,
  ExtendedGraphNode,
  KernelBundle,
  KnowledgeGraphEdge,
} from "../types/bundle";
import { InlineMarkdown } from "./InlineMarkdown";

const elk = new ELK();

interface AtlasCardData extends Record<string, unknown> {
  node: ExtendedGraphNode;
  onTeleport: (chapterId: string, symbolId?: string) => void;
}

const KIND_INFO: Record<string, { label: string; dot: string }> = {
  spine: { label: "章节主线", dot: "var(--clay)" },
  insight: { label: "延伸思考", dot: "var(--ink-sage)" },
  symbol: { label: "核心结构", dot: "var(--ink-blue)" },
  theory: { label: "论文溯源", dot: "var(--ink-amber)" },
  syntax: { label: "Python 机制", dot: "var(--ink-amber)" },
};

const AtlasNodeCard: React.FC<NodeProps<Node<AtlasCardData>>> = ({ data }) => {
  const { node, onTeleport } = data;
  const info = KIND_INFO[node.kind] ?? {
    label: "知识卡片",
    dot: "var(--ink-muted)",
  };

  return (
    <div
      className={`kg-card ${node.kind === "spine" ? "spine" : ""}`}
      style={{ width: 262, padding: "12px 14px" }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{
          background: "var(--bg-sand)",
          border: "1.5px solid var(--edge-solid)",
          width: 6,
          height: 6,
        }}
      />
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span className="kg-badge">
          <span className="dot" style={{ background: info.dot }} />
          {info.label}
        </span>
        {node.heat_score ? (
          <span style={{ fontSize: 10.5, color: "var(--ink-muted)" }}>
            +{node.heat_score}
          </span>
        ) : null}
      </div>

      <div className="kg-card-title" style={{ fontSize: 13.5 }}>
        {node.title}
      </div>

      <div
        className="kg-card-body"
        style={{
          fontSize: 11.8,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        <InlineMarkdown text={node.concise_markdown} />
      </div>

      <div
        className="nodrag"
        style={{
          marginTop: 9,
          paddingTop: 7,
          borderTop: "1px solid var(--border-soft)",
          textAlign: "right",
        }}
      >
        <button
          type="button"
          onClick={() =>
            onTeleport(
              node.chapter_id,
              node.kind === "symbol" ? node.id : undefined
            )
          }
          style={{
            border: "none",
            background: "transparent",
            padding: 0,
            fontSize: 11.5,
            fontWeight: 600,
            color: "var(--clay)",
            display: "inline-flex",
            alignItems: "center",
            gap: 3,
            cursor: "pointer",
          }}
        >
          去这一关伴读 <ArrowUpRight size={12} strokeWidth={1.7} />
        </button>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        style={{
          background: "var(--bg-sand)",
          border: "1.5px solid var(--edge-solid)",
          width: 6,
          height: 6,
        }}
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
            title: sym.name,
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
      kindFilter === "all"
        ? true
        : kindFilter === "theory"
          ? n.kind === "theory" || n.kind === "syntax"
          : n.kind === kindFilter
    );
    const validIds = new Set(filteredNodes.map((n) => n.id));
    const filteredEdges = combinedEdges.filter(
      (e) => validIds.has(e.source) && validIds.has(e.target)
    );

    return { allNodes: filteredNodes, allEdges: filteredEdges };
  }, [
    publicNodes,
    publicEdges,
    personalNodes,
    personalEdges,
    symbols,
    concepts,
    kindFilter,
  ]);

  useEffect(() => {
    let cancelled = false;
    async function runLayout() {
      const g = {
        id: "atlas",
        layoutOptions: {
          "elk.algorithm": "layered",
          "elk.direction": "RIGHT",
          "elk.layered.spacing.nodeNodeBetweenLayers": "120",
          "elk.spacing.nodeNode": "36",
        },
        children: allNodes.map((n) => ({ id: n.id, width: 262, height: 164 })),
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
              e.style === "solid" ? "var(--edge-solid)" : "var(--edge-dashed)",
            strokeWidth: 1.3,
            strokeDasharray: e.style === "dashed" ? "5 5" : undefined,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 13,
            height: 13,
            color:
              e.style === "solid" ? "var(--edge-solid)" : "var(--edge-dashed)",
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
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div className="timeline-bar">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="chapter-num-badge">全局知识地图</span>
          <span style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>
            串联全部 6 关主线、{allNodes.length} 张知识卡片与 {allEdges.length}{" "}
            条脉络关联
          </span>
        </div>

        <div className="seg-control" style={{ height: 30 }}>
          {[
            ["all", "全部卡片"],
            ["spine", "章节主线"],
            ["insight", "延伸思考"],
            ["symbol", "核心结构"],
            ["theory", "论文与语法"],
          ].map(([k, label]) => (
            <button
              key={k}
              type="button"
              className={`seg-item ${kindFilter === k ? "active" : ""}`}
              style={{ height: 24, fontSize: 12 }}
              onClick={() => setKindFilter(k)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="canvas-stage" style={{ paddingTop: 10 }}>
        <div className="canvas-board-wrap">
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
            <Background gap={24} size={1.2} color="var(--canvas-dots)" />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
      </div>
    </div>
  );
};
