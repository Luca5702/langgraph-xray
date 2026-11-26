import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import type { ZoomLevel } from "@langgraph-xray/schema";
import {
  KERNEL_BUNDLE,
  type ExtendedGraphNode,
  type KnowledgeGraphEdge,
  type KnowledgeLens,
  type ViewGear,
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
import { TopGpsBar } from "./components/TopGpsBar";
import { TutorialPane } from "./components/TutorialPane";
import { SourceXRayPane } from "./components/SourceXRayPane";
import { RightWorkbenchPane } from "./components/RightWorkbenchPane";
import { SettingsModal } from "./components/SettingsModal";

const SemanticCanvasView = lazy(() =>
  import("./components/SemanticCanvasView").then((m) => ({
    default: m.SemanticCanvasView,
  }))
);
const GlobalAtlasView = lazy(() =>
  import("./components/GlobalAtlasView").then((m) => ({
    default: m.GlobalAtlasView,
  }))
);

export const App: React.FC = () => {
  // Default to Ch.2 (Superstep Barrier & Version Wakeup) as flagship anatomy showcase
  const [activeChapterId, setActiveChapterId] = useState<string>(
    "ch02_superstep_barrier"
  );
  const [gear, setGear] = useState<ViewGear>("workbench");
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>("L2");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
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

  const [frameIndex, setFrameIndex] = useState<number>(1);
  const [isAutoPlaying, setIsAutoPlaying] = useState<boolean>(false);
  const [activeSliceId, setActiveSliceId] = useState<string>(
    activeChapter.default_slice_id
  );

  // At-Hand Surgery Tray state
  const [pinnedSymbolIds, setPinnedSymbolIds] = useState<string[]>(
    activeChapter.default_pinned_symbols
  );
  const [activeSymbolId, setActiveSymbolId] = useState<string>(
    activeChapter.default_pinned_symbols[0]
  );
  const [symbolProvenance, setSymbolProvenance] = useState<string>("");

  // Personal Knowledge Graph (IndexedDB)
  const [personalGraph, setPersonalGraph] = useState<PersonalGraphStore>({
    nodes: [],
    edges: [],
  });
  const [pendingAnchorContext, setPendingAnchorContext] = useState<{
    selectedText: string;
    targetRef: string;
  } | null>(null);
  const [isSprouting, setIsSprouting] = useState<boolean>(false);
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);

  // Load personal graph from IndexedDB on mount
  useEffect(() => {
    void loadPersonalGraph().then(setPersonalGraph);
  }, []);

  // Sync theme attribute on <html>
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // Reset slice, frame, and default pinned symbols when switching chapter
  const handleSelectChapter = useCallback((cid: string) => {
    const nextCh =
      KERNEL_BUNDLE.chapters.find((c) => c.chapter_id === cid) ??
      KERNEL_BUNDLE.chapters[0];
    setActiveChapterId(nextCh.chapter_id);
    setActiveSliceId(nextCh.default_slice_id);
    setPinnedSymbolIds(nextCh.default_pinned_symbols);
    setActiveSymbolId(nextCh.default_pinned_symbols[0]);
    setSymbolProvenance("");
    setFrameIndex(1);
    setIsAutoPlaying(false);
  }, []);

  // Auto-play timer
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

  // Keyboard arrow stepping (← / →)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (gear !== "workbench") return;
      if (e.key === "ArrowRight") {
        setFrameIndex((p) => Math.min(frames.length - 1, p + 1));
      } else if (e.key === "ArrowLeft") {
        setFrameIndex((p) => Math.max(0, p - 1));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [frames.length, gear]);

  const currentFrame = frames[Math.min(frameIndex, frames.length - 1)] ?? frames[0];

  const handleJumpToPhase = useCallback(
    (phaseId: string) => {
      // Search forward from current frame first, then wrap around
      const forwardIdx = frames.findIndex(
        (f, i) => i > frameIndex && f.lifecycle_phase === phaseId
      );
      if (forwardIdx >= 0) {
        setFrameIndex(forwardIdx);
        return;
      }
      const firstIdx = frames.findIndex((f) => f.lifecycle_phase === phaseId);
      if (firstIdx >= 0) {
        setFrameIndex(firstIdx);
      }
    },
    [frames, frameIndex]
  );

  const handleToggleLens = useCallback((lens: KnowledgeLens) => {
    setActiveLenses((prev) => {
      const next = prev.includes(lens)
        ? prev.filter((l) => l !== lens)
        : [...prev, lens];
      saveActiveLenses(next);
      return next;
    });
  }, []);

  const handleInspectSymbol = useCallback((symId: string, provenance?: string) => {
    if (!KERNEL_BUNDLE.symbols[symId]) return;
    setActiveSymbolId(symId);
    setSymbolProvenance(provenance ?? "");
    setPinnedSymbolIds((prev) => (prev.includes(symId) ? prev : [...prev, symId]));
  }, []);

  const handleTogglePinSymbol = useCallback((symId: string) => {
    setPinnedSymbolIds((prev) => {
      if (prev.includes(symId)) {
        return prev.length > 1 ? prev.filter((x) => x !== symId) : prev;
      }
      return [...prev, symId];
    });
  }, []);

  // Core Knowledge Graph Sprouting Handler (Tree Growth + Dashed Cross-Link Closure)
  const handleSproutQuestion = useCallback(
    async (
      parentNodeId: string,
      question: string,
      selectedText: string,
      targetRef: string
    ) => {
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
          zoom_level: zoomLevel,
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

        // Automatically cross-link referenced SymbolBlueprints (closing Tree into Knowledge Graph!)
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

        // Automatically cross-link referenced ConceptCards
        for (const cid of sprout.referenced_concepts ?? []) {
          const card = KERNEL_BUNDLE.concepts[cid];
          if (card) {
            newEdges.push({
              id: `e_${newNodeId}_conc_${cid}`,
              source: newNodeId,
              target: cid,
              relation:
                card.node_kind === "theory" ? "grounds_in_theory" : "uses_syntax",
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
      } finally {
        setIsSprouting(false);
      }
    },
    [activeChapter.chapter_id, activeLenses, currentFrame, zoomLevel]
  );

  const handleSproutFromWorkbench = useCallback(
    (
      selectedText: string,
      targetRef: string,
      _anchorType: "tutorial_mdx" | "source_code",
      customQuestion?: string
    ) => {
      setPendingAnchorContext({ selectedText, targetRef });
      setGear("canvas");
      const spineId =
        KERNEL_BUNDLE.public_graph.nodes.find(
          (n) => n.chapter_id === activeChapter.chapter_id && n.kind === "spine"
        )?.id ?? `spine_${activeChapter.chapter_id}`;

      const autoQ =
        customQuestion ??
        `请结合当前源码与超步状态，深入剖析这段逻辑：「${selectedText.slice(0, 60)}」`;
      void handleSproutQuestion(spineId, autoQ, selectedText, targetRef);
    },
    [activeChapter.chapter_id, handleSproutQuestion]
  );

  const handleEndorseNode = useCallback(
    (node: ExtendedGraphNode) => {
      const parentEdge = [...KERNEL_BUNDLE.public_graph.edges, ...personalGraph.edges].find(
        (e) => e.target === node.id && e.style === "solid"
      );
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

  const handleClearPersonalChapterBranches = useCallback(() => {
    setPersonalGraph((prev) => {
      const removedIds = new Set(
        prev.nodes
          .filter((n) => n.chapter_id === activeChapter.chapter_id)
          .map((n) => n.id)
      );
      const updated: PersonalGraphStore = {
        nodes: prev.nodes.filter((n) => !removedIds.has(n.id)),
        edges: prev.edges.filter(
          (e) => !removedIds.has(e.source) && !removedIds.has(e.target)
        ),
      };
      void savePersonalGraph(updated);
      return updated;
    });
  }, [activeChapter.chapter_id]);

  const availableSlices = useMemo(
    () =>
      activeChapter.available_slice_ids
        .map((id) => KERNEL_BUNDLE.source_slices[id])
        .filter(Boolean),
    [activeChapter]
  );

  const chapterBranchCount = useMemo(() => {
    const pub = KERNEL_BUNDLE.public_graph.nodes.filter(
      (n) => n.chapter_id === activeChapter.chapter_id && n.kind === "insight"
    ).length;
    const per = personalGraph.nodes.filter(
      (n) => n.chapter_id === activeChapter.chapter_id
    ).length;
    return pub + per;
  }, [activeChapter.chapter_id, personalGraph.nodes]);

  const totalGrownCount =
    KERNEL_BUNDLE.public_graph.nodes.filter((n) => n.kind === "insight").length +
    personalGraph.nodes.length;

  return (
    <div className="xray-shell">
      <TopGpsBar
        meta={KERNEL_BUNDLE.meta}
        chapters={KERNEL_BUNDLE.chapters}
        activeChapterId={activeChapter.chapter_id}
        onSelectChapter={handleSelectChapter}
        currentFrame={currentFrame}
        topology={activeProbe.trace.topology}
        onJumpToPhase={handleJumpToPhase}
        activeLenses={activeLenses}
        onToggleLens={handleToggleLens}
        onSetPureMode={() => {
          setActiveLenses([]);
          saveActiveLenses([]);
        }}
        gear={gear}
        onChangeGear={setGear}
        grownCount={totalGrownCount}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {gear === "workbench" && (
        <main className="workbench-grid">
          <TutorialPane
            chapter={activeChapter}
            concepts={KERNEL_BUNDLE.concepts}
            activeLenses={activeLenses}
            onInspectSymbol={handleInspectSymbol}
            onOpenCanvasFromSpine={() => setGear("canvas")}
            onSproutFromSelection={handleSproutFromWorkbench}
            branchCountByChapter={chapterBranchCount}
          />

          <SourceXRayPane
            availableSlices={availableSlices}
            activeSliceId={activeSliceId}
            onSelectSlice={setActiveSliceId}
            zoomLevel={zoomLevel}
            onChangeZoom={setZoomLevel}
            probe={activeProbe}
            currentFrame={currentFrame}
            onInspectSymbol={handleInspectSymbol}
            onSproutFromCode={(code, fileRef) =>
              handleSproutFromWorkbench(code, fileRef, "source_code")
            }
          />

          <RightWorkbenchPane
            symbols={KERNEL_BUNDLE.symbols}
            pinnedSymbolIds={pinnedSymbolIds}
            activeSymbolId={activeSymbolId}
            symbolProvenance={symbolProvenance}
            onSelectSymbol={(sid) => {
              setActiveSymbolId(sid);
              setSymbolProvenance("");
            }}
            onTogglePinSymbol={handleTogglePinSymbol}
            frames={frames}
            frameIndex={frameIndex}
            onChangeFrameIndex={setFrameIndex}
            isAutoPlaying={isAutoPlaying}
            onToggleAutoPlay={() => setIsAutoPlaying((p) => !p)}
          />
        </main>
      )}

      <Suspense
        fallback={
          <div
            className="canvas-stage"
            style={{ alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}
          >
            正在加载 ELK 自动有向图排版引擎...
          </div>
        }
      >
        {gear === "canvas" && (
          <SemanticCanvasView
            chapter={activeChapter}
            currentFrame={currentFrame}
            publicNodes={KERNEL_BUNDLE.public_graph.nodes}
            publicEdges={KERNEL_BUNDLE.public_graph.edges}
            personalNodes={personalGraph.nodes}
            personalEdges={personalGraph.edges}
            symbols={KERNEL_BUNDLE.symbols}
            concepts={KERNEL_BUNDLE.concepts}
            pendingAnchorContext={pendingAnchorContext}
            isSprouting={isSprouting}
            onSproutQuestion={handleSproutQuestion}
            onEndorseNode={handleEndorseNode}
            onClearPersonalChapterBranches={handleClearPersonalChapterBranches}
            onPinSymbolAndReturn={(symId) => {
              handleInspectSymbol(symId, "从生长画布钉回手边托盘");
              setGear("workbench");
            }}
            onBackToWorkbench={() => setGear("workbench")}
          />
        )}

        {gear === "atlas" && (
          <GlobalAtlasView
            publicNodes={KERNEL_BUNDLE.public_graph.nodes}
            publicEdges={KERNEL_BUNDLE.public_graph.edges}
            personalNodes={personalGraph.nodes}
            personalEdges={personalGraph.edges}
            symbols={KERNEL_BUNDLE.symbols}
            concepts={KERNEL_BUNDLE.concepts}
            onTeleportToChapter={(cid, symId) => {
              handleSelectChapter(cid);
              if (symId) {
                handleInspectSymbol(symId, "从全局内核星图定位至此");
              }
              setGear("workbench");
            }}
          />
        )}
      </Suspense>

      {settingsOpen && (
        <SettingsModal
          onClose={() => setSettingsOpen(false)}
          personalGraph={personalGraph}
        />
      )}
    </div>
  );
};
