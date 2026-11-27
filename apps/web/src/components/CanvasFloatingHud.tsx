import React, { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Compass,
  Focus,
  Layers,
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
} from "../types/bundle";

export type CanvasScope = "chapter" | "forest";

interface CanvasFloatingHudProps {
  meta: { langgraph_version: string; vendor_commit: string };
  chapters: ChapterCurriculum[];
  activeChapter: ChapterCurriculum;
  onSelectChapter: (cid: string) => void;
  scope: CanvasScope;
  onChangeScope: (s: CanvasScope) => void;
  forestKindFilter: string;
  onChangeForestKindFilter: (k: string) => void;
  totalNodesCount: number;
  frames: Array<TraceFrame & { phase_label?: string }>;
  frameIndex: number;
  onChangeFrameIndex: (idx: number) => void;
  isAutoPlaying: boolean;
  onToggleAutoPlay: () => void;
  topologyNodes: string[];
  activeLenses: KnowledgeLens[];
  onToggleLens: (lens: KnowledgeLens) => void;
  onResetFocus: () => void;
  sproutedCount: number;
  onOpenFullExplorer: (tab?: "source" | "symbols" | "runtime") => void;
  onOpenSettings: () => void;
}

const PHASE_CN: Record<string, string> = {
  compile: "编译建图",
  superstep_plan: "唤醒排期",
  superstep_execute: "并发执行",
  superstep_apply_writes: "屏障合入",
  stream_or_interrupt: "收敛停机",
};

function formatChapterBadge(num: string): string {
  const n = num.replace(/[^0-9]/g, "");
  return `第 ${Number(n) || 1} 关`;
}

export const CanvasFloatingHud: React.FC<CanvasFloatingHudProps> = ({
  meta,
  chapters,
  activeChapter,
  onSelectChapter,
  scope,
  onChangeScope,
  forestKindFilter,
  onChangeForestKindFilter,
  totalNodesCount,
  frames,
  frameIndex,
  onChangeFrameIndex,
  isAutoPlaying,
  onToggleAutoPlay,
  topologyNodes,
  activeLenses,
  onToggleLens,
  onResetFocus,
  sproutedCount,
  onOpenFullExplorer,
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

  const handleNextSuperstep = () => {
    const curStep = currentFrame.superstep;
    const nextIdx = frames.findIndex(
      (f, idx) => idx > frameIndex && f.superstep > curStep
    );
    onChangeFrameIndex(nextIdx >= 0 ? nextIdx : frames.length - 1);
  };

  const radarNodes = topologyNodes.filter(
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
      {/* Top-Left Floating Chapter & Macro-Scope Capsule */}
      <header className="hud-capsule hud-top-left" ref={menuRef} id="top-gps-bar">
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
          onClick={() => {
            if (scope === "forest") onChangeScope("chapter");
            setMenuOpen((o) => !o);
          }}
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
          <ChevronDown size={13} strokeWidth={1.8} color="var(--ink-muted)" />
        </button>

        <div className="seg-control" role="tablist" aria-label="画布视野范围">
          <button
            id="scope-chapter"
            type="button"
            role="tab"
            aria-selected={scope === "chapter"}
            className={`seg-item ${scope === "chapter" ? "active" : ""}`}
            onClick={() => onChangeScope("chapter")}
            title="默认聚焦当前关卡的思维导图主干与活体源码"
          >
            <Focus size={13} strokeWidth={1.8} />
            专注本关
          </button>
          <button
            id="scope-forest"
            type="button"
            role="tab"
            aria-selected={scope === "forest"}
            className={`seg-item ${scope === "forest" ? "active" : ""}`}
            onClick={() => onChangeScope("forest")}
            title="拉远视野，鸟瞰全部 6 关的知识网络与共享底层结构"
          >
            <Compass size={13} strokeWidth={1.8} />
            6 关全景
            <span
              className="mono"
              style={{
                fontSize: 10.5,
                padding: "0 5px",
                borderRadius: 99,
                background: "var(--clay-soft)",
                color: "var(--clay)",
              }}
            >
              {totalNodesCount}
            </span>
          </button>
        </div>

        {menuOpen && (
          <div className="chapter-menu-popover" role="menu">
            <div className="chapter-menu-header">
              <span>共 6 关 · 每一关都是一棵活体源码导图</span>
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
                      onChangeScope("chapter");
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
      </header>

      {/* Top-Right Floating Lenses, Focus Reset & Full-Data Explorer Capsule */}
      <div className="hud-capsule hud-top-right">
        <span style={{ fontSize: 11.5, color: "var(--ink-muted)", paddingLeft: 4 }}>
          背景透镜：
        </span>
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
              title="开启后点击导图中的虚线术语即可向右展开小抄卡片"
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

        <span className="v-divider" />

        {scope === "chapter" && sproutedCount > 0 && (
          <button
            type="button"
            className="subtle-btn"
            onClick={onResetFocus}
            title="收起展开的旁枝卡片，回到干净聚焦的主干视图"
          >
            聚焦收起 ({sproutedCount})
          </button>
        )}

        <button
          id="btn-open-explorer"
          type="button"
          className="subtle-btn"
          onClick={() => onOpenFullExplorer("source")}
          title="查阅完整源码文件（L0–L3）、全部 19 个核心结构与完整内存快照"
        >
          <Layers size={13} strokeWidth={1.7} color="var(--clay)" />
          全量数据与源码
        </button>

        <button
          id="btn-engine-settings"
          type="button"
          className="ghost-icon-btn"
          onClick={onOpenSettings}
          title="AI 追问连接与个人笔记导出"
        >
          <SlidersHorizontal size={14} strokeWidth={1.8} />
        </button>
      </div>

      {/* Bottom-Center MarginNote-Style Breathing Capsule */}
      {scope === "chapter" ? (
        <div
          className="hud-capsule hud-bottom-center"
          role="region"
          aria-label="单步伴读呼吸胶囊"
        >
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
            title="上一步 (键盘 ←)"
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
            title="下一步 (键盘 →)"
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
            title="跳至下一轮超步"
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
            title={isAutoPlaying ? "暂停自动步进" : "自动连续演示"}
          >
            {isAutoPlaying ? (
              <Pause size={13} strokeWidth={1.7} />
            ) : (
              <Play size={13} strokeWidth={1.7} />
            )}
          </button>

          <span className="v-divider" />

          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12.2,
              whiteSpace: "nowrap",
            }}
          >
            <span className="chapter-num-badge">
              {PHASE_CN[currentFrame.lifecycle_phase] ?? "运行中"}
            </span>
            <span style={{ color: "var(--ink-body)", fontWeight: 500 }}>
              第 <strong>{frameIndex + 1}</strong>/{frames.length} 幕
            </span>
          </div>

          <div className="tick-track" role="slider" aria-valuenow={frameIndex + 1}>
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

          <span className="v-divider" />

          <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            {radarNodes.slice(0, 4).map((n) => {
              const st = currentFrame.node_statuses[n];
              const lit = st && st !== "idle";
              return (
                <span
                  key={n}
                  className="mono"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 11.2,
                    color: lit ? "var(--ink)" : "var(--ink-muted)",
                    fontWeight: lit ? 600 : 400,
                  }}
                  title={`节点 ${n}: ${st ?? "idle"}`}
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
      ) : (
        <div
          className="hud-capsule hud-bottom-center"
          role="region"
          aria-label="全景知识网络分类筛选"
          style={{ whiteSpace: "nowrap" }}
        >
          <span style={{ fontSize: 12, color: "var(--ink-muted)", paddingLeft: 4 }}>
            全景筛选：
          </span>
          <div className="seg-control">
            {[
              ["all", "全部节点"],
              ["spine", "6 关主干"],
              ["insight", "延伸思考"],
              ["symbol", "核心结构"],
              ["theory", "论文与语法"],
            ].map(([k, label]) => (
              <button
                key={k}
                type="button"
                className={`seg-item ${forestKindFilter === k ? "active" : ""}`}
                onClick={() => onChangeForestKindFilter(k)}
              >
                {label}
              </button>
            ))}
          </div>
          <span style={{ fontSize: 11.8, color: "var(--ink-muted)", paddingRight: 4 }}>
            点卡片右下角即可聚焦进入该关导图
          </span>
        </div>
      )}
    </>
  );
};
