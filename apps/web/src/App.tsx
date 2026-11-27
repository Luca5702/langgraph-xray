import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  KERNEL_BUNDLE,
  type ExtendedGraphNode,
  type KnowledgeGraphEdge,
  type KnowledgeLens,
} from "./types/bundle";
import {
  endorseBranchToCommunity,
  loadActiveLenses,
  loadPersonalGraph,
  requestSproutBranch,
  saveActiveLenses,
  savePersonalGraph,
  type PersonalGraphStore,
} from "./store/storage";
import {
  CanvasFloatingHud,
  type CanvasScope,
} from "./components/CanvasFloatingHud";
import {
  UnifiedMindCanvas,
  type SproutedLeafRecord,
} from "./components/UnifiedMindCanvas";
import { FullScopeDrawer } from "./components/FullScopeDrawer";
import { SettingsModal } from "./components/SettingsModal";

function pickSignatureFrame(
  frames: Array<{ superstep: number; lifecycle_phase: string }>
): number {
  const step1Plan = frames.findIndex(
    (f) => f.superstep >= 1 && f.lifecycle_phase === "superstep_plan"
  );
  if (step1Plan >= 0) return step1Plan;
  return Math.min(1, frames.length - 1);
}

export const App: React.FC = () => {
  const initialParams = useMemo(
    () => new URLSearchParams(window.location.search),
    []
  );

  const [activeChapterId, setActiveChapterId] = useState<string>(
    () => initialParams.get("ch") || "ch02_superstep_barrier"
  );
  const [scope, setScope] = useState<CanvasScope>(() =>
    initialParams.get("scope") === "forest" ||
    initialParams.get("gear") === "atlas"
      ? "forest"
      : "chapter"
  );
  const [forestKindFilter, setForestKindFilter] = useState<string>("all");
  const [activeLenses, setActiveLenses] = useState<KnowledgeLens[]>(() =>
    loadActiveLenses()
  );

  const activeChapter = useMemo(
    () =>
      KERNEL_BUNDLE.chapters.find((c) => c.chapter_id === activeChapterId) ??
      KERNEL_BUNDLE.chapters[0],
    [activeChapterId]
  );

  const activeProbe = KERNEL_BUNDLE.probes[activeChapter.chapter_id];
  const frames = activeProbe.trace.frames;

  const [frameIndex, setFrameIndex] = useState<number>(() =>
    pickSignatureFrame(frames)
  );
  const [isAutoPlaying, setIsAutoPlaying] = useState<boolean>(false);
  const [activeSliceId, setActiveSliceId] = useState<string>(
    activeChapter.default_slice_id
  );

  // On-demand sprouted rightward leaves (empty by default for calm attention focus!)
  const [sproutedLeaves, setSproutedLeaves] = useState<SproutedLeafRecord[]>(
    () => {
      if (initialParams.get("demo") === "sprout") {
        return [
          {
            leafId: "leaf_demo_sym",
            parentNodeId: "node_code_slice",
            kind: "symbol",
            targetId: "langgraph.channels.named_barrier_value.NamedBarrierValue",
          },
          {
            leafId: "leaf_demo_ins",
            parentNodeId: "spine_ch02_b1",
            kind: "insight",
            targetId: "insight_ch02_fanin_barrier",
          },
        ];
      }
      return [];
    }
  );

  const [personalGraph, setPersonalGraph] = useState<PersonalGraphStore>({
    nodes: [],
    edges: [],
  });
  const [isSprouting, setIsSprouting] = useState<boolean>(false);
  const [drawerTab, setDrawerTab] = useState<
    "source" | "symbols" | "runtime" | null
  >(() => {
    const d = initialParams.get("drawer");
    return d === "source" || d === "symbols" || d === "runtime" ? d : null;
  });
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);

  useEffect(() => {
    void loadPersonalGraph().then(setPersonalGraph);
  }, []);

  const handleSelectChapter = useCallback((cid: string) => {
    const nextCh =
      KERNEL_BUNDLE.chapters.find((c) => c.chapter_id === cid) ??
      KERNEL_BUNDLE.chapters[0];
    const nextFrames = KERNEL_BUNDLE.probes[nextCh.chapter_id].trace.frames;
    setActiveChapterId(nextCh.chapter_id);
    setActiveSliceId(nextCh.default_slice_id);
    setSproutedLeaves([]);
    setFrameIndex(pickSignatureFrame(nextFrames));
    setIsAutoPlaying(false);
  }, []);

  useEffect(() => {
    if (!isAutoPlaying) return;
    const id = window.setInterval(() => {
      setFrameIndex((prev) => {
        if (prev >= frames.length - 1) {
          setIsAutoPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 1350);
    return () => window.clearInterval(id);
  }, [isAutoPlaying, frames.length]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "Escape" && drawerTab) {
        setDrawerTab(null);
        return;
      }
      if (scope !== "chapter") return;
      if (e.key === "ArrowRight") {
        setFrameIndex((p) => Math.min(frames.length - 1, p + 1));
      } else if (e.key === "ArrowLeft") {
        setFrameIndex((p) => Math.max(0, p - 1));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [frames.length, scope, drawerTab]);

  const currentFrame =
    frames[Math.min(frameIndex, frames.length - 1)] ?? frames[0];

  const handleToggleLens = useCallback((lens: KnowledgeLens) => {
    setActiveLenses((prev) => {
      const next = prev.includes(lens)
        ? prev.filter((l) => l !== lens)
        : [...prev, lens];
      saveActiveLenses(next);
      return next;
    });
  }, []);

  const handleAddOrToggleLeaf = useCallback(
    (rec: Omit<SproutedLeafRecord, "leafId">, toggleIfPresent = false) => {
      setSproutedLeaves((prev) => {
        const existing = prev.find((p) => p.targetId === rec.targetId);
        if (existing) {
          return toggleIfPresent
            ? prev.filter((p) => p.targetId !== rec.targetId)
            : prev;
        }
        const safeId = `leaf_${rec.kind}_${rec.targetId.replace(/[^a-zA-Z0-9_]/g, "_")}`;
        return [...prev, { ...rec, leafId: safeId }];
      });
    },
    []
  );

  const handleCloseLeaf = useCallback((leafId: string) => {
    setSproutedLeaves((prev) => prev.filter((l) => l.leafId !== leafId));
  }, []);

  const handleSproutAiQuestion = useCallback(
    async (
      parentNodeId: string,
      question: string,
      selectedText: string,
      targetRef: string
    ): Promise<ExtendedGraphNode | null> => {
      setIsSprouting(true);
      try {
        const memSummary = JSON.stringify({
          step: currentFrame.superstep,
          phase: currentFrame.lifecycle_phase,
          versions: currentFrame.memory_snapshot.channel_versions,
          tasks: currentFrame.memory_snapshot.tasks_queue.map((t) => t.name),
        });

        const { sprout, log_id } = await requestSproutBranch({
          chapter_id: activeChapter.chapter_id,
          anchor_type: "source_code",
          target_ref: targetRef,
          zoom_level: "L2",
          superstep_frame_id: currentFrame.frame_id,
          active_lenses: activeLenses,
          selected_text: selectedText,
          user_question: question,
          memory_summary: memSummary,
        });

        const newNodeId = `personal_${Date.now().toString(36)}`;
        const newNode: ExtendedGraphNode = {
          id: newNodeId,
          kind: "insight",
          visibility: "local_personal",
          chapter_id: activeChapter.chapter_id,
          origin_anchor: targetRef,
          title: sprout.title,
          concise_markdown: sprout.concise_markdown,
          heat_score: 1,
          suggested_sparks: sprout.suggested_sparks,
          log_id,
        };

        const newEdges: KnowledgeGraphEdge[] = [
          {
            id: `e_${parentNodeId}_${newNodeId}`,
            source: parentNodeId,
            target: newNodeId,
            relation: "evolves_to",
            style: "solid",
          },
        ];

        for (const symId of sprout.referenced_symbols ?? []) {
          if (KERNEL_BUNDLE.symbols[symId]) {
            newEdges.push({
              id: `e_${newNodeId}_sym_${symId.split(".").pop()}`,
              source: newNodeId,
              target: symId,
              relation: "references_symbol",
              style: "dashed",
            });
          }
        }

        for (const cid of sprout.referenced_concepts ?? []) {
          const card = KERNEL_BUNDLE.concepts[cid];
          if (card) {
            newEdges.push({
              id: `e_${newNodeId}_conc_${cid}`,
              source: newNodeId,
              target: cid,
              relation:
                card.node_kind === "theory"
                  ? "grounds_in_theory"
                  : "uses_syntax",
              style: "dashed",
            });
          }
        }

        setPersonalGraph((prev) => {
          const updated: PersonalGraphStore = {
            nodes: [...prev.nodes, newNode],
            edges: [...prev.edges, ...newEdges],
          };
          void savePersonalGraph(updated);
          return updated;
        });

        return newNode;
      } finally {
        setIsSprouting(false);
      }
    },
    [activeChapter.chapter_id, activeLenses, currentFrame]
  );

  const handleEndorseNode = useCallback(
    (node: ExtendedGraphNode) => {
      const parentEdge = [
        ...KERNEL_BUNDLE.public_graph.edges,
        ...personalGraph.edges,
      ].find((e) => e.target === node.id && e.style === "solid");
      void endorseBranchToCommunity(node.log_id, parentEdge?.source ?? "");
      setPersonalGraph((prev) => {
        const updated = {
          ...prev,
          nodes: prev.nodes.map((n) =>
            n.id === node.id
              ? { ...n, endorsed: true, heat_score: (n.heat_score ?? 1) + 1 }
              : n
          ),
        };
        void savePersonalGraph(updated);
        return updated;
      });
    },
    [personalGraph.edges]
  );

  const availableSlices = useMemo(
    () =>
      activeChapter.available_slice_ids
        .map((id) => KERNEL_BUNDLE.source_slices[id])
        .filter(Boolean),
    [activeChapter]
  );

  const totalForestCount = useMemo(() => {
    const ids = new Set<string>();
    KERNEL_BUNDLE.public_graph.nodes.forEach((n) => ids.add(n.id));
    personalGraph.nodes.forEach((n) => ids.add(n.id));
    KERNEL_BUNDLE.public_graph.edges.forEach((e) => ids.add(e.target));
    return ids.size;
  }, [personalGraph.nodes]);

  return (
    <div className="mind-canvas-shell">
      <CanvasFloatingHud
        meta={KERNEL_BUNDLE.meta}
        chapters={KERNEL_BUNDLE.chapters}
        activeChapter={activeChapter}
        onSelectChapter={handleSelectChapter}
        scope={scope}
        onChangeScope={setScope}
        forestKindFilter={forestKindFilter}
        onChangeForestKindFilter={setForestKindFilter}
        totalNodesCount={totalForestCount}
        frames={frames}
        frameIndex={frameIndex}
        onChangeFrameIndex={setFrameIndex}
        isAutoPlaying={isAutoPlaying}
        onToggleAutoPlay={() => setIsAutoPlaying((p) => !p)}
        topologyNodes={activeProbe.trace.topology.nodes}
        activeLenses={activeLenses}
        onToggleLens={handleToggleLens}
        onResetFocus={() => setSproutedLeaves([])}
        sproutedCount={sproutedLeaves.length}
        onOpenFullExplorer={(tab) => setDrawerTab(tab ?? "source")}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <UnifiedMindCanvas
        scope={scope}
        forestKindFilter={forestKindFilter}
        chapter={activeChapter}
        probe={activeProbe}
        availableSlices={availableSlices}
        activeSliceId={activeSliceId}
        onSelectSlice={setActiveSliceId}
        frames={frames}
        frameIndex={frameIndex}
        activeLenses={activeLenses}
        symbols={KERNEL_BUNDLE.symbols}
        concepts={KERNEL_BUNDLE.concepts}
        publicNodes={KERNEL_BUNDLE.public_graph.nodes}
        publicEdges={KERNEL_BUNDLE.public_graph.edges}
        personalNodes={personalGraph.nodes}
        personalEdges={personalGraph.edges}
        sproutedLeaves={sproutedLeaves}
        onAddOrToggleLeaf={handleAddOrToggleLeaf}
        onCloseLeaf={handleCloseLeaf}
        isSprouting={isSprouting}
        onSproutAiQuestion={handleSproutAiQuestion}
        onEndorseNode={handleEndorseNode}
        onOpenFullExplorer={(tab) => setDrawerTab(tab)}
        onTeleportFromForest={(cid, symId) => {
          handleSelectChapter(cid);
          setScope("chapter");
          if (symId && KERNEL_BUNDLE.symbols[symId]) {
            setSproutedLeaves([
              {
                leafId: `leaf_sym_${symId.replace(/[^a-zA-Z0-9_]/g, "_")}`,
                parentNodeId: "node_code_slice",
                kind: "symbol",
                targetId: symId,
              },
            ]);
          }
        }}
      />

      {drawerTab && (
        <FullScopeDrawer
          initialTab={drawerTab}
          availableSlices={availableSlices}
          activeSliceId={activeSliceId}
          onSelectSlice={setActiveSliceId}
          probe={activeProbe}
          currentFrame={currentFrame}
          symbols={KERNEL_BUNDLE.symbols}
          concepts={KERNEL_BUNDLE.concepts}
          onSproutSymbolToCanvas={(symId) => {
            setScope("chapter");
            handleAddOrToggleLeaf(
              {
                parentNodeId: "node_code_slice",
                kind: "symbol",
                targetId: symId,
              },
              false
            );
          }}
          onSproutConceptToCanvas={(cid) => {
            setScope("chapter");
            handleAddOrToggleLeaf(
              {
                parentNodeId: `spine_${activeChapter.sections[0].block_id}`,
                kind: "concept",
                targetId: cid,
              },
              false
            );
          }}
          onSproutCodeQuestionToCanvas={(qualname, fileRef) => {
            setScope("chapter");
            void handleSproutAiQuestion(
              "node_code_slice",
              `深入剖析 ${qualname} 在超步执行中的关键职责与边界行为`,
              qualname,
              fileRef
            ).then((created) => {
              if (created) {
                handleAddOrToggleLeaf(
                  {
                    parentNodeId: "node_code_slice",
                    kind: "insight",
                    targetId: created.id,
                  },
                  false
                );
              }
            });
          }}
          onClose={() => setDrawerTab(null)}
        />
      )}

      {settingsOpen && (
        <SettingsModal
          onClose={() => setSettingsOpen(false)}
          personalGraph={personalGraph}
        />
      )}
    </div>
  );
};
