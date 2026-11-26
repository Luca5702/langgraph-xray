import React, { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Moon,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  SlidersHorizontal,
  Sun,
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
  theme: "dark" | "light";
  onToggleTheme: () => void;
  onOpenSettings: () => void;
}

const PHASES: Array<{ id: string; label: string }> = [
  { id: "compile", label: "Compile" },
  { id: "superstep_plan", label: "Plan" },
  { id: "superstep_execute", label: "Execute" },
  { id: "superstep_apply_writes", label: "Apply" },
  { id: "stream_or_interrupt", label: "Halt" },
];

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
  theme,
  onToggleTheme,
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

  const currentFrame = frames[Math.min(frameIndex, frames.length - 1)] ?? frames[0];
  const hasInterrupt = Object.values(currentFrame.node_statuses).includes("interrupted");

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
        return "var(--sig-blue)";
      case "committed":
        return "var(--sig-green)";
      case "interrupted":
        return "var(--sig-red)";
      default:
        return "var(--ink-faint)";
    }
  };

  return (
    <>
      {/* Tier 1: 44px Global Monochrome Shell Header */}
      <header className="shell-header" id="top-gps-bar">
        <div className="header-left" ref={menuRef}>
          <h1 className="brand-mark">
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <rect
                x="2"
                y="2"
                width="12"
                height="12"
                rx="3"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <circle cx="8" cy="8" r="2.2" fill="currentColor" />
            </svg>
            <span>LangGraph X-Ray</span>
          </h1>

          <span className="crumb-sep">/</span>

          <button
            id="chapter-selector"
            type="button"
            className={`chapter-trigger ${menuOpen ? "open" : ""}`}
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
          >
            <span className="chapter-num-tag mono">
              {activeChapter.number.replace("Ch.", "0")}
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
            <ChevronDown size={13} strokeWidth={1.5} color="var(--ink-muted)" />
          </button>

          {menuOpen && (
            <div className="chapter-menu-popover" role="menu">
              <div
                className="eyebrow"
                style={{ padding: "4px 10px 6px", borderBottom: "1px solid var(--hairline)" }}
              >
                Curriculum · 6 Kernel Probes
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
                          className="mono"
                          style={{
                            fontSize: 11,
                            color: "var(--ink-faint)",
                            paddingTop: 1,
                          }}
                        >
                          0{idx + 1}
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 500 }}>
                            {ch.title}
                          </div>
                          <div
                            style={{
                              fontSize: 11.5,
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
                          size={14}
                          strokeWidth={1.6}
                          color="var(--ink)"
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

        {/* Center: 3-Mode Segmented Switcher */}
        <div className="seg-control" role="tablist" aria-label="视图模式切换">
          <button
            id="gear-workbench"
            type="button"
            role="tab"
            aria-selected={gear === "workbench"}
            className={`seg-item ${gear === "workbench" ? "active" : ""}`}
            onClick={() => onChangeGear("workbench")}
          >
            解剖台
          </button>
          <button
            id="gear-canvas"
            type="button"
            role="tab"
            aria-selected={gear === "canvas"}
            className={`seg-item ${gear === "canvas" ? "active" : ""}`}
            onClick={() => onChangeGear("canvas")}
          >
            生长画布
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
            全局星图
          </button>
        </div>

        {/* Right: Quiet Lens Toggles + Metadata + Icon Actions */}
        <div className="header-right">
          <div className="lens-strip" title="正交背景知识透镜（关闭后正文中扫盲标记完全隐形）">
            {(
              [
                ["python_syntax", "Py"],
                ["pregel_paper", "Paper"],
                ["runnable_contract", "Spec"],
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
                      background: on ? "var(--ink)" : "var(--ink-faint)",
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
                title="一键进入零标记老手纯净模式"
              >
                Pure
              </button>
            )}
          </div>

          <span className="v-divider" />

          <span
            className="mono"
            style={{ fontSize: 11, color: "var(--ink-faint)", whiteSpace: "nowrap" }}
            title="构建期挂载的官方 LangGraph 内核版本与固定 Commit"
          >
            {meta.langgraph_version}@{meta.vendor_commit}
          </span>

          <button
            id="btn-theme-toggle"
            type="button"
            className="ghost-icon-btn"
            onClick={onToggleTheme}
            title="切换深浅主题"
          >
            {theme === "dark" ? (
              <Sun size={14} strokeWidth={1.5} />
            ) : (
              <Moon size={14} strokeWidth={1.5} />
            )}
          </button>

          <button
            id="btn-engine-settings"
            type="button"
            className="ghost-icon-btn"
            onClick={onOpenSettings}
            title="配置 Gemini API Key 与边缘后端"
          >
            <SlidersHorizontal size={14} strokeWidth={1.5} />
          </button>
        </div>
      </header>

      {/* Tier 2: 38px Replay.io-Style Deterministic Execution Timeline Bar (Workbench only) */}
      {gear === "workbench" && (
        <div className="timeline-bar" role="region" aria-label="超步时间轴控制器">
          <div className="transport-group">
            <button
              id="sandbox-reset"
              type="button"
              className="ghost-icon-btn"
              style={{ width: 26, height: 26 }}
              onClick={() => onChangeFrameIndex(0)}
              title="回到编译初始帧"
            >
              <RotateCcw size={13} strokeWidth={1.5} />
            </button>
            <button
              id="sandbox-prev"
              type="button"
              className="subtle-btn"
              disabled={frameIndex <= 0}
              onClick={() => onChangeFrameIndex(Math.max(0, frameIndex - 1))}
              title="上一半步"
            >
              <ChevronLeft size={13} strokeWidth={1.6} />
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
              Next Phase
              <ChevronRight size={13} strokeWidth={1.8} />
            </button>
            <button
              id="sandbox-next-superstep"
              type="button"
              className="subtle-btn"
              disabled={frameIndex >= frames.length - 1}
              onClick={handleNextSuperstep}
              title="跳至下一完整 Superstep"
            >
              <SkipForward size={12} strokeWidth={1.5} />
            </button>
            <button
              id="sandbox-autoplay"
              type="button"
              className="ghost-icon-btn"
              style={{ width: 26, height: 26 }}
              onClick={onToggleAutoPlay}
              title={isAutoPlaying ? "暂停自动步进" : "自动连续步进"}
            >
              {isAutoPlaying ? (
                <Pause size={13} strokeWidth={1.5} />
              ) : (
                <Play size={13} strokeWidth={1.5} />
              )}
            </button>

            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
                marginLeft: 4,
              }}
              title="支持键盘左右方向键单步调试"
            >
              <kbd className="kbd mono">←</kbd>
              <kbd className="kbd mono">→</kbd>
            </span>

            <span
              className="mono"
              style={{ fontSize: 11, color: "var(--ink-muted)", marginLeft: 6 }}
            >
              {String(frameIndex + 1).padStart(2, "0")}/
              {String(frames.length).padStart(2, "0")}
            </span>
          </div>

          {/* Center: Lifecycle Stage Breadcrumbs + Discrete Frame Tick Track */}
          <div className="scrubber-center">
            <div className="phase-crumbs">
              {PHASES.map((p) => {
                const isCur = currentFrame.lifecycle_phase === p.id;
                const dotCol =
                  isCur && hasInterrupt
                    ? "var(--sig-red)"
                    : isCur && p.id === "superstep_apply_writes"
                      ? "var(--sig-green)"
                      : isCur
                        ? "var(--sig-blue)"
                        : "transparent";
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`phase-step-btn ${isCur ? "current" : ""}`}
                    onClick={() => onJumpToPhase(p.id)}
                    title={`跳转至下一 ${p.label} 阶段帧`}
                  >
                    {isCur && <span className="dot" style={{ background: dotCol }} />}
                    {p.label}
                  </button>
                );
              })}
            </div>

            <div className="tick-track" role="slider" aria-valuenow={frameIndex + 1}>
              {frames.map((f, idx) => {
                const isIntr = Object.values(f.node_statuses).includes("interrupted");
                const isBarrier = f.lifecycle_phase === "superstep_apply_writes";
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
                    title={`#${idx + 1} · ${f.phase_label ?? f.lifecycle_phase}`}
                  />
                );
              })}
            </div>
          </div>

          {/* Right: Minimalist Node Status Dots */}
          <div className="topology-strip">
            {radarNodes.map((n) => {
              const st = currentFrame.node_statuses[n];
              const lit = st && st !== "idle";
              return (
                <span
                  key={n}
                  className={`topo-node-tag mono ${lit ? "lit" : ""}`}
                  title={`${n}: ${st ?? "idle"}`}
                >
                  <span className="dot" style={{ background: nodeDotColor(st) }} />
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
