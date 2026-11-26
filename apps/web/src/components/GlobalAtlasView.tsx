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

const elk = new ELK();

interface AtlasCardData extends Record<string, unknown> {
  node: ExtendedGraphNode;
  onTeleport: (chapterId: string, symbolId?: string) => void;
}

const DOT_BY_KIND: Record<string, string> = {
  spine: "var(--sig-blue)",
  insight: "var(--sig-green)",
  symbol: "var(--ink-muted)",
  theory: "var(--sig-amber)",
  syntax: "var(--sig-amber)",
};

const AtlasNodeCard: React.FC<NodeProps<Node<AtlasCardData>>> = ({ data }) => {
  const { node, onTeleport } = data;
  return (
    <div
      className={`kg-card ${node.kind === "spine" ? "spine" : ""}`}
      style={{ width: 256, padding: "11px 13px" }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{
          background: "var(--bg-surface-3)",
          border: "1px solid var(--ink-muted)",
          width: 5,
          height: 5,
        }}
      />
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span
          className="eyebrow"
          style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
        >
          <span
            className="dot"
            style={{ background: DOT_BY_KIND[node.kind] ?? "var(--ink-muted)" }}
          />
          {node.kind}
        </span>
        {node.heat_score ? (
          <span className="mono" style={{ fontSize: 10, color: "var(--ink-faint)" }}>
            +{node.heat_score}
          </span>
        ) : null}
      </div>

      <div className="kg-card-title" style={{ fontSize: 12.5 }}>
        {node.title}
      </div>

      <div
        className="kg-card-body"
        style={{
          fontSize: 11.5,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {node.concise_markdown}
      </div>

      <div
        className="nodrag"
        style={{
          marginTop: 8,
          paddingTop: 6,
          borderTop: "1px solid var(--hairline)",
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
            fontSize: 11,
            color: "var(--ink-secondary)",
            display: "inline-flex",
            alignItems: "center",
            gap: 3,
            cursor: "pointer",
          }}
        >
          Open in Workbench <ArrowUpRight size={11} strokeWidth={1.5} />
        </button>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        style={{
          background: "var(--bg-surface-3)",
          border: "1px solid var(--ink-muted)",
          width: 5,
          height: 5,
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
      kindFilter === "all" ? true : n.kind === kindFilter
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
          "elk.layered.spacing.nodeNodeBetweenLayers": "110",
          "elk.spacing.nodeNode": "28",
        },
        children: allNodes.map((n) => ({ id: n.id, width: 256, height: 136 })),
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
            strokeWidth: 1.2,
            strokeDasharray: e.style === "dashed" ? "4 4" : undefined,
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
    <div className="canvas-stage" style={{ flexDirection: "column" }}>
      <div className="timeline-bar">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="eyebrow">GLOBAL KERNEL ATLAS</span>
          <span style={{ fontSize: 12, color: "var(--ink-muted)" }}>
            {allNodes.length} nodes · {allEdges.length} semantic relations across Ch.01–Ch.06
          </span>
        </div>

        <div className="seg-control" style={{ height: 26 }}>
          {[
            ["all", "All"],
            ["spine", "Spines"],
            ["insight", "Insights"],
            ["symbol", "Symbols"],
            ["theory", "Papers"],
          ].map(([k, label]) => (
            <button
              key={k}
              type="button"
              className={`seg-item ${kindFilter === k ? "active" : ""}`}
              style={{ height: 20, fontSize: 11.5 }}
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
          <Background gap={24} size={1} color="var(--canvas-dots)" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  );
};
