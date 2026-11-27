import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  type Edge,
  type Node,
  type ReactFlowInstance,
} from "@xyflow/react";
import ELK from "elkjs/lib/elk.bundled.js";
import type {
  ChapterCurriculum,
  ConceptCardConfig,
  ExtendedGraphNode,
  KernelBundle,
  KnowledgeGraphEdge,
  KnowledgeLens,
  ProbeBundle,
  SourceSlice,
  SuggestedSpark,
  TraceFrame,
} from "../types/bundle";
import type { CanvasScope } from "./CanvasFloatingHud";
import { MIND_CANVAS_NODE_TYPES } from "./MindCanvasNodes";

const elk = new ELK();

export interface SproutedLeafRecord {
  leafId: string;
  parentNodeId: string;
  kind: "symbol" | "concept" | "insight" | "l0_probe";
  targetId: string;
}

interface UnifiedMindCanvasProps {
  scope: CanvasScope;
  forestKindFilter: string;
  chapter: ChapterCurriculum;
  probe: ProbeBundle;
  availableSlices: SourceSlice[];
  activeSliceId: string;
  onSelectSlice: (id: string) => void;
  frames: Array<TraceFrame & { phase_label?: string }>;
  frameIndex: number;
  activeLenses: KnowledgeLens[];
  symbols: KernelBundle["symbols"];
  concepts: Record<string, ConceptCardConfig>;
  publicNodes: ExtendedGraphNode[];
  publicEdges: KnowledgeGraphEdge[];
  personalNodes: ExtendedGraphNode[];
  personalEdges: KnowledgeGraphEdge[];
  sproutedLeaves: SproutedLeafRecord[];
  onAddOrToggleLeaf: (rec: Omit<SproutedLeafRecord, "leafId">, toggleIfPresent?: boolean) => void;
  onCloseLeaf: (leafId: string) => void;
  isSprouting: boolean;
  onSproutAiQuestion: (
    parentNodeId: string,
    question: string,
    selectedText: string,
    targetRef: string
  ) => Promise<ExtendedGraphNode | null>;
  onEndorseNode: (node: ExtendedGraphNode) => void;
  onOpenFullExplorer: (tab: "source" | "symbols" | "runtime") => void;
  onTeleportFromForest: (chapterId: string, symbolId?: string) => void;
}

export const UnifiedMindCanvas: React.FC<UnifiedMindCanvasProps> = ({
  scope,
  forestKindFilter,
  chapter,
  probe,
  availableSlices,
  activeSliceId,
  onSelectSlice,
  frames,
  frameIndex,
  activeLenses,
  symbols,
  concepts,
  publicNodes,
  publicEdges,
  personalNodes,
  personalEdges,
  sproutedLeaves,
  onAddOrToggleLeaf,
  onCloseLeaf,
  isSprouting,
  onSproutAiQuestion,
  onEndorseNode,
  onOpenFullExplorer,
  onTeleportFromForest,
}) => {
  const rfRef = useRef<ReactFlowInstance | null>(null);

  const [allSectionsExpanded, setAllSectionsExpanded] = useState(false);
  const [manualOpenSections, setManualOpenSections] = useState<
    Record<string, boolean>
  >({});
  const [extraCodeRadius, setExtraCodeRadius] = useState(0);

  // Reset per-chapter transient UI overrides on chapter change
  useEffect(() => {
    setAllSectionsExpanded(false);
    setManualOpenSections({});
    setExtraCodeRadius(0);
  }, [chapter.chapter_id]);

  const currentFrame =
    frames[Math.min(frameIndex, frames.length - 1)] ?? frames[0];
  const prevFrame = frameIndex > 0 ? frames[frameIndex - 1] : null;

  // Auto-sync active slice file when stepping across files
  useEffect(() => {
    const targetFile = currentFrame.source_anchor.file;
    const match = availableSlices.find((sl) =>
      sl.blocks.some(
        (b) =>
          b.file_path === targetFile &&
          currentFrame.source_anchor.highlight_lines[0] >= b.start_line &&
          currentFrame.source_anchor.highlight_lines[0] <= b.end_line
      )
    );
    if (match && match.slice_id !== activeSliceId) {
      onSelectSlice(match.slice_id);
    }
  }, [currentFrame, availableSlices, activeSliceId, onSelectSlice]);

  // Determine which Spine section naturally corresponds to the current frame
  const activeStepSectionIdx = useMemo(() => {
    if (chapter.sections.length <= 1) return 0;
    const lbl = currentFrame.phase_label ?? "";
    if (lbl.includes("Run2") || lbl.includes("Timeline-B")) return 1;
    if (
      currentFrame.lifecycle_phase === "superstep_execute" ||
      currentFrame.lifecycle_phase === "superstep_apply_writes"
    ) {
      return 1;
    }
    if (frameIndex >= Math.ceil(frames.length * 0.58)) return 1;
    return 0;
  }, [chapter.sections.length, currentFrame, frameIndex, frames.length]);

  const handleToggleSection = useCallback((blockId: string) => {
    setManualOpenSections((prev) => {
      const cur = prev[blockId];
      return { ...prev, [blockId]: cur === undefined ? true : !cur };
    });
  }, []);

  const allInsightMap = useMemo(() => {
    const m = new Map<string, ExtendedGraphNode>();
    [...publicNodes, ...personalNodes].forEach((n) => m.set(n.id, n));
    return m;
  }, [publicNodes, personalNodes]);

  const openTargetSet = useMemo(
    () => new Set(sproutedLeaves.map((l) => l.targetId)),
    [sproutedLeaves]
  );

  const l0Open = openTargetSet.has(`l0_${chapter.chapter_id}`);

  const handleToggleL0 = useCallback(() => {
    onAddOrToggleLeaf(
      {
        parentNodeId: `root_${chapter.chapter_id}`,
        kind: "l0_probe",
        targetId: `l0_${chapter.chapter_id}`,
      },
      true
    );
  }, [chapter.chapter_id, onAddOrToggleLeaf]);

  const handleSproutSymbol = useCallback(
    (symId: string, parentNodeId: string) => {
      if (!symbols[symId]) return;
      onAddOrToggleLeaf(
        { parentNodeId, kind: "symbol", targetId: symId },
        false
      );
    },
    [symbols, onAddOrToggleLeaf]
  );

  const handleSproutConcept = useCallback(
    (conceptId: string, parentNodeId: string) => {
      if (!concepts[conceptId]) return;
      onAddOrToggleLeaf(
        { parentNodeId, kind: "concept", targetId: conceptId },
        false
      );
    },
    [concepts, onAddOrToggleLeaf]
  );

  const handleToggleInsightLeaf = useCallback(
    (insightId: string, parentNodeId: string) => {
      onAddOrToggleLeaf(
        { parentNodeId, kind: "insight", targetId: insightId },
        true
      );
    },
    [onAddOrToggleLeaf]
  );

  const handleAskAiFromNode = useCallback(
    async (
      parentNodeId: string,
      question: string,
      contextText: string,
      targetRef: string
    ) => {
      const created = await onSproutAiQuestion(
        parentNodeId,
        question,
        contextText,
        targetRef
      );
      if (created) {
        onAddOrToggleLeaf(
          { parentNodeId, kind: "insight", targetId: created.id },
          false
        );
      }
    },
    [onSproutAiQuestion, onAddOrToggleLeaf]
  );

  const handleLeafSparkClick = useCallback(
    (parentNodeId: string, spark: SuggestedSpark) => {
      void handleAskAiFromNode(
        parentNodeId,
        spark.label,
        spark.label,
        `${chapter.chapter_id}#spark`
      );
    },
    [chapter.chapter_id, handleAskAiFromNode]
  );

  /* ==========================================================================
     SYNCHRONOUS, OVERLAP-FREE MIND-MAP TREE LAYOUT ("专注本关" MODE)
     ========================================================================== */
  const { chapterNodes, chapterEdges } = useMemo(() => {
    if (scope !== "chapter") {
      return { chapterNodes: [] as Node[], chapterEdges: [] as Edge[] };
    }

    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const nodePosY = new Map<string, { x: number; y: number; h: number }>();

    const rootId = `root_${chapter.chapter_id}`;
    const chInsights = publicNodes.filter(
      (n) => n.chapter_id === chapter.chapter_id && n.kind === "insight"
    );

    // Column 1: Spine Sections (x = 376)
    const COL1_X = 376;
    let curCol1Y = 0;
    let activeSpineNodeId = `spine_${chapter.sections[0].block_id}`;

    chapter.sections.forEach((sec, idx) => {
      const nid = `spine_${sec.block_id}`;
      const isStepActive = idx === activeStepSectionIdx;
      const manual = manualOpenSections[sec.block_id];
      const expanded =
        allSectionsExpanded ||
        (manual !== undefined ? manual : isStepActive);

      if (isStepActive) activeSpineNodeId = nid;

      // Distribute chapter's curated insights across sections
      const secInsights = chInsights.filter(
        (_, i) => i % chapter.sections.length === idx
      );

      const stripTokens = (s: string) =>
        s.replace(/\[\[(?:sym|concept):[^|\]]+\|([^\]]+)\]\]/g, "$1");

      const estHeight = expanded
        ? 124 +
          sec.paragraphs.reduce(
            (acc, p) => acc + Math.ceil(stripTokens(p).length / 24) * 22,
            0
          ) +
          (sec.margin_note ? 44 : 0) +
          (secInsights.length + 1) * 32
        : 54;

      nodes.push({
        id: nid,
        type: "spineSection",
        position: { x: COL1_X, y: curCol1Y },
        data: {
          chapter,
          sectionIndex: idx,
          section: sec,
          collapsed: !expanded,
          isActiveStepSection: isStepActive,
          concepts,
          activeLenses,
          curatedInsights: secInsights,
          openLeafIds: openTargetSet,
          isSprouting,
          onToggleSection: handleToggleSection,
          onSproutSymbol: handleSproutSymbol,
          onSproutConcept: handleSproutConcept,
          onToggleInsightLeaf: handleToggleInsightLeaf,
          onAskAiFromNode: handleAskAiFromNode,
        },
      });

      nodePosY.set(nid, { x: COL1_X, y: curCol1Y, h: estHeight });

      edges.push({
        id: `e_${rootId}_${nid}`,
        source: rootId,
        target: nid,
        type: "default",
        style: {
          stroke: isStepActive ? "var(--edge-active)" : "var(--edge-solid)",
          strokeWidth: isStepActive ? 2 : 1.5,
        },
      });

      curCol1Y += estHeight + 28;
    });

    const totalCol1Height = Math.max(240, curCol1Y - 28);

    // Column 0: Chapter Root centered neatly on Column 1 (x = 0)
    const rootHeight = 250;
    const rootY = Math.max(0, (totalCol1Height - rootHeight) * 0.35);
    nodes.unshift({
      id: rootId,
      type: "chapterRoot",
      position: { x: 0, y: rootY },
      data: {
        chapter,
        l0Open,
        allSectionsExpanded,
        onToggleL0: handleToggleL0,
        onToggleExpandAllSections: () => setAllSectionsExpanded((p) => !p),
      },
    });
    nodePosY.set(rootId, { x: 0, y: rootY, h: rootHeight });

    // Column 2: Active Code Slice + Active Runtime Pulse (x = 824)
    const COL2_X = 824;
    const codeNodeId = "node_code_slice";
    const pulseNodeId = "node_runtime_pulse";
    const codeHeight = 365;
    const pulseHeight = 195;

    nodes.push({
      id: codeNodeId,
      type: "codeSlice",
      position: { x: COL2_X, y: 0 },
      data: {
        availableSlices,
        activeSliceId,
        currentFrame,
        extraLinesRadius: extraCodeRadius,
        onSelectSlice,
        onExpandRadius: (d: number) =>
          setExtraCodeRadius((r) => Math.min(32, r + d)),
        onSproutSymbol: handleSproutSymbol,
        onOpenFullSourceDrawer: () => onOpenFullExplorer("source"),
      },
    });
    nodePosY.set(codeNodeId, { x: COL2_X, y: 0, h: codeHeight });

    nodes.push({
      id: pulseNodeId,
      type: "runtimePulse",
      position: { x: COL2_X, y: codeHeight + 26 },
      data: {
        currentFrame,
        prevFrame,
        topologyNodes: probe.trace.topology.nodes,
        onOpenFullRuntimeDrawer: () => onOpenFullExplorer("runtime"),
      },
    });
    nodePosY.set(pulseNodeId, {
      x: COL2_X,
      y: codeHeight + 26,
      h: pulseHeight,
    });

    edges.push(
      {
        id: `e_${activeSpineNodeId}_${codeNodeId}`,
        source: activeSpineNodeId,
        target: codeNodeId,
        type: "default",
        style: { stroke: "var(--edge-active)", strokeWidth: 1.8 },
      },
      {
        id: `e_${activeSpineNodeId}_${pulseNodeId}`,
        source: activeSpineNodeId,
        target: pulseNodeId,
        type: "default",
        style: { stroke: "var(--edge-solid)", strokeWidth: 1.5 },
      }
    );

    // Column 3 & Column 4+: On-Demand Sprouted Knowledge Leaves
    // Compute depth column based on parent's x position
    const leavesByCol = new Map<number, SproutedLeafRecord[]>();
    const leafNodeIdByTarget = new Map<string, string>();

    sproutedLeaves.forEach((leaf) => {
      const parentBox = nodePosY.get(leaf.parentNodeId);
      let colX = 1376;
      if (leaf.kind === "l0_probe") {
        colX = COL1_X;
      } else if (parentBox) {
        if (parentBox.x >= 1376) {
          colX = parentBox.x + 412;
        } else {
          colX = 1376;
        }
      }
      const arr = leavesByCol.get(colX) ?? [];
      arr.push(leaf);
      leavesByCol.set(colX, arr);
      leafNodeIdByTarget.set(leaf.targetId, leaf.leafId);
    });

    Array.from(leavesByCol.entries())
      .sort((a, b) => a[0] - b[0])
      .forEach(([colX, colLeaves]) => {
        let nextAvailableY =
          colX === COL1_X ? totalCol1Height + 32 : 0;

        colLeaves.forEach((leaf) => {
          const parentBox = nodePosY.get(leaf.parentNodeId);
          const desiredY = parentBox ? Math.max(0, parentBox.y) : 0;
          const y = Math.max(nextAvailableY, desiredY);

          let estH = 250;
          let variantData = null;

          if (leaf.kind === "l0_probe") {
            estH = 290;
            variantData = { kind: "l0_probe" as const, probe };
          } else if (leaf.kind === "symbol" && symbols[leaf.targetId]) {
            estH = 280;
            variantData = {
              kind: "symbol" as const,
              symbol: symbols[leaf.targetId],
              currentFrame,
            };
          } else if (leaf.kind === "concept" && concepts[leaf.targetId]) {
            estH = 270;
            variantData = {
              kind: "concept" as const,
              card: concepts[leaf.targetId],
            };
          } else if (leaf.kind === "insight") {
            const ins = allInsightMap.get(leaf.targetId);
            if (ins) {
              estH = 300;
              variantData = { kind: "insight" as const, node: ins };
            }
          }

          if (!variantData) return;

          nodes.push({
            id: leaf.leafId,
            type: "sproutLeaf",
            position: { x: colX, y },
            data: {
              leafId: leaf.leafId,
              variant: variantData,
              isSprouting,
              onClose: onCloseLeaf,
              onSparkClick: handleLeafSparkClick,
              onCustomFollowUp: (pid: string, q: string) =>
                handleAskAiFromNode(
                  pid,
                  q,
                  leaf.targetId,
                  `${chapter.chapter_id}#followup`
                ),
              onEndorse: onEndorseNode,
            },
          });

          nodePosY.set(leaf.leafId, { x: colX, y, h: estH });
          nextAvailableY = y + estH + 28;

          const validParent = nodePosY.has(leaf.parentNodeId)
            ? leaf.parentNodeId
            : activeSpineNodeId;

          edges.push({
            id: `e_${validParent}_${leaf.leafId}`,
            source: validParent,
            target: leaf.leafId,
            type: "default",
            style: {
              stroke:
                leaf.kind === "insight"
                  ? "var(--ink-sage)"
                  : leaf.kind === "symbol"
                    ? "var(--ink-blue)"
                    : "var(--clay)",
              strokeWidth: 1.6,
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 13,
              height: 13,
              color:
                leaf.kind === "insight"
                  ? "var(--ink-sage)"
                  : leaf.kind === "symbol"
                    ? "var(--ink-blue)"
                    : "var(--clay)",
            },
          });
        });
      });

    // Cross-branch Dashed Resonance Arcs when both an Insight leaf and its referenced Symbol/Concept leaf are open
    const allGraphEdges = [...publicEdges, ...personalEdges];
    allGraphEdges.forEach((ge) => {
      if (ge.style === "dashed") {
        const srcLeaf = leafNodeIdByTarget.get(ge.source);
        const tgtLeaf = leafNodeIdByTarget.get(ge.target);
        if (srcLeaf && tgtLeaf && srcLeaf !== tgtLeaf) {
          edges.push({
            id: `res_${srcLeaf}_${tgtLeaf}`,
            source: srcLeaf,
            target: tgtLeaf,
            type: "default",
            style: {
              stroke: "var(--edge-dashed)",
              strokeWidth: 1.3,
              strokeDasharray: "5 5",
            },
          });
        }
      }
    });

    return { chapterNodes: nodes, chapterEdges: edges };
  }, [
    scope,
    chapter,
    publicNodes,
    publicEdges,
    personalEdges,
    activeStepSectionIdx,
    manualOpenSections,
    allSectionsExpanded,
    concepts,
    activeLenses,
    openTargetSet,
    isSprouting,
    handleToggleSection,
    handleSproutSymbol,
    handleSproutConcept,
    handleToggleInsightLeaf,
    handleAskAiFromNode,
    l0Open,
    handleToggleL0,
    availableSlices,
    activeSliceId,
    currentFrame,
    prevFrame,
    extraCodeRadius,
    onSelectSlice,
    onOpenFullExplorer,
    probe,
    sproutedLeaves,
    symbols,
    allInsightMap,
    onCloseLeaf,
    handleLeafSparkClick,
    onEndorseNode,
  ]);

  /* ==========================================================================
     6-CHAPTER FOREST MACRO GRAPH ("6 关全景" MODE)
     ========================================================================== */
  const [forestNodes, setForestNodes] = useState<Node[]>([]);
  const [forestEdges, setForestEdges] = useState<Edge[]>([]);

  useEffect(() => {
    if (scope !== "forest") return;
    let cancelled = false;

    async function layoutForest() {
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

      const filtered = Array.from(map.values()).filter((n) =>
        forestKindFilter === "all"
          ? true
          : forestKindFilter === "theory"
            ? n.kind === "theory" || n.kind === "syntax"
            : n.kind === forestKindFilter
      );
      const validIds = new Set(filtered.map((n) => n.id));
      const validEdges = combinedEdges.filter(
        (e) => validIds.has(e.source) && validIds.has(e.target)
      );

      const out = await elk.layout({
        id: "forest",
        layoutOptions: {
          "elk.algorithm": "layered",
          "elk.direction": "RIGHT",
          "elk.layered.spacing.nodeNodeBetweenLayers": "120",
          "elk.spacing.nodeNode": "36",
        },
        children: filtered.map((n) => ({ id: n.id, width: 274, height: 162 })),
        edges: validEdges.map((e) => ({
          id: e.id,
          sources: [e.source],
          targets: [e.target],
        })),
      });

      if (cancelled) return;

      setForestNodes(
        (out.children ?? []).map((c) => {
          const node = filtered.find((n) => n.id === c.id)!;
          return {
            id: c.id,
            type: "sproutLeaf",
            position: { x: c.x ?? 0, y: c.y ?? 0 },
            data: {
              leafId: c.id,
              variant: { kind: "forest_card" as const, node },
              onTeleportToChapter: onTeleportFromForest,
            },
          };
        })
      );

      setForestEdges(
        validEdges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          type: "default",
          style: {
            stroke:
              e.style === "solid" ? "var(--edge-solid)" : "var(--edge-dashed)",
            strokeWidth: 1.35,
            strokeDasharray: e.style === "dashed" ? "5 5" : undefined,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 12,
            height: 12,
            color:
              e.style === "solid" ? "var(--edge-solid)" : "var(--edge-dashed)",
          },
        }))
      );
    }

    void layoutForest();
    return () => {
      cancelled = true;
    };
  }, [
    scope,
    forestKindFilter,
    publicNodes,
    personalNodes,
    publicEdges,
    personalEdges,
    symbols,
    concepts,
    onTeleportFromForest,
  ]);

  // Smooth camera framing when chapter, macro scope, or sprouted branch count changes
  useEffect(() => {
    const pad = scope === "forest" ? 0.19 : 0.18;
    const id = window.setTimeout(() => {
      rfRef.current?.fitView({
        padding: pad,
        maxZoom: 0.94,
        duration: 240,
      });
    }, 45);
    return () => window.clearTimeout(id);
  }, [
    scope,
    chapter.chapter_id,
    forestKindFilter,
    sproutedLeaves.length,
    allSectionsExpanded,
    forestNodes.length,
  ]);

  const activeNodes = scope === "chapter" ? chapterNodes : forestNodes;
  const activeEdges = scope === "chapter" ? chapterEdges : forestEdges;

  return (
    <div style={{ width: "100%", height: "100%" }}>
      <ReactFlow
        nodes={activeNodes}
        edges={activeEdges}
        nodeTypes={MIND_CANVAS_NODE_TYPES}
        onInit={(inst) => {
          rfRef.current = inst;
          inst.fitView({ padding: 0.18, maxZoom: 0.94 });
        }}
        fitView
        fitViewOptions={{ padding: 0.18, maxZoom: 0.94 }}
        minZoom={0.25}
        maxZoom={1.45}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={24} size={1.25} color="var(--canvas-dots)" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
};
