import React, { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  SlidersHorizontal,
} from "lucide-react";
import type {
  ChapterCurriculum,
  KnowledgeLens,
  TraceFrame,
  ViewGear,
} from "../types/bundle";

interface TopGpsBarProps {
  meta: { langgraph_version: string; vendor_commit: string };
  chapters: ChapterCurriculum[];
  activeChapter: ChapterCurriculum;
  onSelectChapter: (cid: string) => void;
  frames: Array<TraceFrame & { phase_label?: string }>;
  frameIndex: number;
  onChangeFrameIndex: (idx: number) => void;
  isAutoPlaying: boolean;
  onToggleAutoPlay: () => void;
  topology: { nodes: string[]; edges: Array<[string, string]> };
  onJumpToPhase: (phase: string) => void;
  activeLenses: KnowledgeLens[];
  onToggleLens: (lens: KnowledgeLens) => void;
  onSetPureMode: () => void;
  gear: ViewGear;
  onChangeGear: (g: ViewGear) => void;
  grownCount: number;
  onOpenSettings: () => void;
}

const PHASES: Array<{ id: string; label: string }> = [
  { id: "compile", label: "编译建图" },
  { id: "superstep_plan", label: "唤醒排期" },
  { id: "superstep_execute", label: "并发执行" },
  { id: "superstep_apply_writes", label: "屏障合入" },
  { id: "stream_or_interrupt", label: "收敛停机" },
];

function formatChapterBadge(num: string): string {
  const n = num.replace(/[^0-9]/g, "");
  return `第 ${Number(n) || 1} 关`;
}

export const TopGpsBar: React.FC<TopGpsBarProps> = ({
  meta,
  chapters,
  activeChapter,
  onSelectChapter,
  frames,
  frameIndex,
  onChangeFrameIndex,
  isAutoPlaying,
  onToggleAutoPlay,
  topology,
  onJumpToPhase,
  activeLenses,
  onToggleLens,
  onSetPureMode,
  gear,
  onChangeGear,
  grownCount,
  onOpenSettings,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const currentFrame =
    frames[Math.min(frameIndex, frames.length - 1)] ?? frames[0];
  const hasInterrupt = Object.values(currentFrame.node_statuses).includes(
    "interrupted"
  );

  const handleNextSuperstep = () => {
    const curStep = currentFrame.superstep;
    const nextIdx = frames.findIndex(
      (f, idx) => idx > frameIndex && f.superstep > curStep
    );
    onChangeFrameIndex(nextIdx >= 0 ? nextIdx : frames.length - 1);
  };

  const radarNodes = topology.nodes.filter(
    (n) => n !== "__start__" && n !== "__end__"
  );

  const nodeDotColor = (status: string | undefined): string => {
    switch (status) {
      case "planned":
      case "active":
        return "var(--ink-blue)";
      case "committed":
        return "var(--ink-sage)";
      case "interrupted":
        return "var(--ink-coral)";
      default:
        return "var(--ink-faint)";
    }
  };

  return (
    <>
      {/* Row 1: Warm Companion Navigation Bar */}
      <header className="shell-header" id="top-gps-bar">
        <div className="header-left" ref={menuRef}>
          <h1 className="brand-mark">
            <span className="brand-emblem" aria-hidden="true">
              <BookOpen size={14} strokeWidth={2} />
            </span>
            <span>LangGraph 源码伴读</span>
          </h1>

          <button
            id="chapter-selector"
            type="button"
            className={`chapter-trigger ${menuOpen ? "open" : ""}`}
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
          >
            <span className="chapter-num-badge">
              {formatChapterBadge(activeChapter.number)}
            </span>
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {activeChapter.title}
            </span>
            <ChevronDown size={14} strokeWidth={1.7} color="var(--ink-muted)" />
          </button>

          {menuOpen && (
            <div className="chapter-menu-popover" role="menu">
              <div className="chapter-menu-header">
                <span>共 6 关 · 循序渐进吃透内核</span>
                <span className="mono" style={{ fontSize: 11, fontWeight: 400 }}>
                  langgraph v{meta.langgraph_version}
                </span>
              </div>
              <div style={{ paddingTop: 4 }}>
                {chapters.map((ch, idx) => {
                  const selected = ch.chapter_id === activeChapter.chapter_id;
                  return (
                    <button
                      key={ch.chapter_id}
                      type="button"
                      role="menuitem"
                      className={`chapter-menu-item ${selected ? "selected" : ""}`}
                      onClick={() => {
                        onSelectChapter(ch.chapter_id);
                        setMenuOpen(false);
                      }}
                    >
                      <div style={{ display: "flex", gap: 10, minWidth: 0 }}>
                        <span
                          className="chapter-num-badge"
                          style={{
                            height: 22,
                            display: "inline-flex",
                            alignItems: "center",
                            marginTop: 1,
                          }}
                        >
                          第 {idx + 1} 关
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>
                            {ch.title}
                          </div>
                          <div
                            style={{
                              fontSize: 11.8,
                              color: "var(--ink-muted)",
                              marginTop: 2,
                            }}
                          >
                            {ch.subtitle}
                          </div>
                        </div>
                      </div>
                      {selected && (
                        <Check
                          size={15}
                          strokeWidth={2}
                          color="var(--clay)"
                          style={{ flexShrink: 0, marginTop: 3 }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Center: Soft Capsule Switcher */}
        <div className="seg-control" role="tablist" aria-label="学习模式切换">
          <button
            id="gear-workbench"
            type="button"
            role="tab"
            aria-selected={gear === "workbench"}
            className={`seg-item ${gear === "workbench" ? "active" : ""}`}
            onClick={() => onChangeGear("workbench")}
          >
            伴读工作台
          </button>
          <button
            id="gear-canvas"
            type="button"
            role="tab"
            aria-selected={gear === "canvas"}
            className={`seg-item ${gear === "canvas" ? "active" : ""}`}
            onClick={() => onChangeGear("canvas")}
          >
            思维生长画布
            <span className="count-pill mono">{grownCount}</span>
          </button>
          <button
            id="gear-atlas"
            type="button"
            role="tab"
            aria-selected={gear === "atlas"}
            className={`seg-item ${gear === "atlas" ? "active" : ""}`}
            onClick={() => onChangeGear("atlas")}
          >
            全局知识地图
          </button>
        </div>

        {/* Right: Friendly Background Knowledge Strip + Settings */}
        <div className="header-right">
          <div
            className="lens-strip"
            title="按需开启背景小抄，点击正文虚线词即可原位展开解读；关闭后正文清爽无打扰"
          >
            <span className="lens-label">背景小抄：</span>
            {(
              [
                ["python_syntax", "Python 语法"],
                ["pregel_paper", "Pregel 论文"],
                ["runnable_contract", "底层契约"],
              ] as Array<[KnowledgeLens, string]>
            ).map(([id, label]) => {
              const on = activeLenses.includes(id);
              return (
                <button
                  key={id}
                  id={`lens-toggle-${id}`}
                  type="button"
                  className={`lens-chip ${on ? "on" : ""}`}
                  onClick={() => onToggleLens(id)}
                >
                  <span
                    className="dot"
                    style={{
                      width: 5,
                      height: 5,
                      background: on ? "var(--clay)" : "var(--ink-faint)",
                    }}
                  />
                  {label}
                </button>
              );
            })}
            {activeLenses.length > 0 && (
              <button
                id="lens-pure-mode"
                type="button"
                className="lens-chip"
                onClick={onSetPureMode}
                title="隐藏所有背景提示，进入清爽阅读模式"
              >
                清爽阅读
              </button>
            )}
          </div>

          <button
            id="btn-engine-settings"
            type="button"
            className="ghost-icon-btn"
            onClick={onOpenSettings}
            title="AI 伴读连接与笔记导出设置"
          >
            <SlidersHorizontal size={15} strokeWidth={1.7} />
          </button>
        </div>
      </header>

      {/* Row 2: Tactile Floating Step-by-Step Companion Bar */}
      {gear === "workbench" && (
        <div className="timeline-bar" role="region" aria-label="单步执行伴读进度条">
          <div className="transport-group">
            <button
              id="sandbox-reset"
              type="button"
              className="ghost-icon-btn"
              style={{ width: 28, height: 28 }}
              onClick={() => onChangeFrameIndex(0)}
              title="回到第 1 幕（建图起点）"
            >
              <RotateCcw size={13} strokeWidth={1.7} />
            </button>
            <button
              id="sandbox-prev"
              type="button"
              className="subtle-btn"
              disabled={frameIndex <= 0}
              onClick={() => onChangeFrameIndex(Math.max(0, frameIndex - 1))}
              title="退回上一步"
            >
              <ChevronLeft size={14} strokeWidth={1.7} />
              上一步
            </button>
            <button
              id="sandbox-next"
              type="button"
              className="primary-cta"
              disabled={frameIndex >= frames.length - 1}
              onClick={() =>
                onChangeFrameIndex(Math.min(frames.length - 1, frameIndex + 1))
              }
            >
              下一步
              <ChevronRight size={14} strokeWidth={2} />
            </button>
            <button
              id="sandbox-next-superstep"
              type="button"
              className="subtle-btn"
              disabled={frameIndex >= frames.length - 1}
              onClick={handleNextSuperstep}
              title="直接跳到下一轮超步（Superstep）"
            >
              <SkipForward size={12} strokeWidth={1.6} />
              下一轮
            </button>
            <button
              id="sandbox-autoplay"
              type="button"
              className="ghost-icon-btn"
              style={{ width: 28, height: 28 }}
              onClick={onToggleAutoPlay}
              title={isAutoPlaying ? "暂停自动播放" : "自动一步步演示"}
            >
              {isAutoPlaying ? (
                <Pause size={13} strokeWidth={1.7} />
              ) : (
                <Play size={13} strokeWidth={1.7} />
              )}
            </button>

            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
                marginLeft: 4,
              }}
              title="按键盘左右方向键也能前后翻步"
            >
              <kbd className="kbd mono">←</kbd>
              <kbd className="kbd mono">→</kbd>
            </span>

            <span
              style={{
                fontSize: 12,
                color: "var(--ink-muted)",
                marginLeft: 6,
                whiteSpace: "nowrap",
              }}
            >
              第 <strong style={{ color: "var(--ink)" }}>{frameIndex + 1}</strong> /{" "}
              {frames.length} 幕
            </span>
          </div>

          {/* Center: Friendly Chinese Stage Pills + Capsule Progress Ticks */}
          <div className="scrubber-center">
            <div className="phase-crumbs">
              {PHASES.map((p) => {
                const isCur = currentFrame.lifecycle_phase === p.id;
                const dotCol =
                  isCur && hasInterrupt
                    ? "var(--ink-coral)"
                    : isCur && p.id === "superstep_apply_writes"
                      ? "var(--ink-sage)"
                      : isCur
                        ? "var(--clay)"
                        : "transparent";
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`phase-step-btn ${isCur ? "current" : ""}`}
                    onClick={() => onJumpToPhase(p.id)}
                    title={`跳到「${p.label}」环节`}
                  >
                    {isCur && (
                      <span className="dot" style={{ background: dotCol }} />
                    )}
                    {p.label}
                  </button>
                );
              })}
            </div>

            <div
              className="tick-track"
              role="slider"
              aria-valuenow={frameIndex + 1}
            >
              {frames.map((f, idx) => {
                const isIntr = Object.values(f.node_statuses).includes(
                  "interrupted"
                );
                const isBarrier =
                  f.lifecycle_phase === "superstep_apply_writes";
                let cls = "frame-tick";
                if (idx === frameIndex) cls += " active";
                else if (isIntr) cls += " interrupt";
                else if (isBarrier) cls += " barrier";
                else if (idx < frameIndex) cls += " past";

                return (
                  <button
                    key={f.frame_id}
                    type="button"
                    className={cls}
                    onClick={() => onChangeFrameIndex(idx)}
                    title={`第 ${idx + 1} 幕 · ${f.phase_label ?? f.lifecycle_phase}`}
                  />
                );
              })}
            </div>
          </div>

          {/* Right: Node Activity Pills */}
          <div className="topology-strip">
            {radarNodes.map((n) => {
              const st = currentFrame.node_statuses[n];
              const lit = st && st !== "idle";
              return (
                <span
                  key={n}
                  className={`topo-node-tag mono ${lit ? "lit" : ""}`}
                  title={`节点 ${n} 当前状态：${st ?? "待命"}`}
                >
                  <span
                    className="dot"
                    style={{ background: nodeDotColor(st) }}
                  />
                  {n}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
};
