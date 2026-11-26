import React from "react";
import {
  Compass,
  GitBranch,
  Microscope,
  Moon,
  Settings,
  Sun,
  Zap,
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
  activeChapterId: string;
  onSelectChapter: (cid: string) => void;
  currentFrame: TraceFrame & { phase_label?: string };
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
  { id: "compile", label: "1. Compile 编译" },
  { id: "superstep_plan", label: "2a. Plan 算任务" },
  { id: "superstep_execute", label: "2b. Execute 并发跑" },
  { id: "superstep_apply_writes", label: "2c. Apply 屏障合入" },
  { id: "stream_or_interrupt", label: "3. Halt / Interrupt" },
];

export const TopGpsBar: React.FC<TopGpsBarProps> = ({
  meta,
  chapters,
  activeChapterId,
  onSelectChapter,
  currentFrame,
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
  const hasInterruptedNode = Object.values(currentFrame.node_statuses).includes("interrupted");

  // Compact horizontal SVG topology radar
  const visibleNodes = topology.nodes.filter((n) => n !== "__start__" && n !== "__end__");
  const radarNodes = ["__start__", ...visibleNodes, "__end__"].filter((n) =>
    topology.nodes.includes(n)
  );

  const statusColor = (status: string | undefined): string => {
    switch (status) {
      case "planned":
      case "active":
        return "var(--accent-teal)";
      case "committed":
        return "var(--accent-emerald)";
      case "interrupted":
        return "var(--accent-coral)";
      default:
        return "var(--text-muted)";
    }
  };

  return (
    <header className="gps-topbar" id="top-gps-bar">
      {/* Brand + Chapter Switcher */}
      <div className="brand-cluster">
        <h1 className="brand-title">
          <Microscope size={16} color="var(--accent-teal)" />
          <span>LangGraph X-Ray</span>
        </h1>
        <span className="kernel-badge mono" title="真实挂载的官方 LangGraph 内核版本与 Commit">
          v{meta.langgraph_version} · {meta.vendor_commit}
        </span>
        <select
          id="chapter-selector"
          aria-label="选择课程关卡"
          className="chapter-select"
          value={activeChapterId}
          onChange={(e) => onSelectChapter(e.target.value)}
        >
          {chapters.map((ch) => (
            <option key={ch.chapter_id} value={ch.chapter_id}>
              {ch.number} · {ch.title}
            </option>
          ))}
        </select>
      </div>

      {/* Dimension 1 & 2: Lifecycle Pipeline + Mini Topology Radar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <nav className="lifecycle-strip" aria-label="Pregel 宏观生命周期轴">
          {PHASES.map((p, idx) => {
            const isActive = currentFrame.lifecycle_phase === p.id;
            const isIntr = isActive && p.id === "stream_or_interrupt" && hasInterruptedNode;
            return (
              <React.Fragment key={p.id}>
                {idx > 0 && <span className="phase-arrow">→</span>}
                <button
                  id={`phase-pill-${p.id}`}
                  type="button"
                  onClick={() => onJumpToPhase(p.id)}
                  title="点击跳转至最近匹配的生命周期相位帧"
                  className={`phase-pill ${isIntr ? "interrupted" : isActive ? "active" : ""}`}
                >
                  {p.label}
                </button>
              </React.Fragment>
            );
          })}
        </nav>

        {/* Mini Topology Radar */}
        <div
          title="实时探针图节点状态雷达（灰=休眠, 青=排期/运行中, 绿=已过屏障提交, 红=中断挂起）"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "3px 8px",
            borderRadius: 6,
            background: "var(--bg-canvas)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          {radarNodes.map((n, idx) => {
            const st = currentFrame.node_statuses[n];
            const label = n === "__start__" ? "S" : n === "__end__" ? "E" : n;
            return (
              <React.Fragment key={n}>
                {idx > 0 && (
                  <span style={{ color: "var(--border-strong)", fontSize: 10 }}>·</span>
                )}
                <span
                  className="mono"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 11,
                    color: st && st !== "idle" ? "var(--text-primary)" : "var(--text-muted)",
                  }}
                >
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: statusColor(st),
                      display: "inline-block",
                    }}
                  />
                  {label}
                </span>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Orthogonal Knowledge Lenses + 3-Gear Mode Switcher */}
      <div className="controls-cluster">
        <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <button
            id="lens-toggle-python"
            type="button"
            className={`lens-btn ${activeLenses.includes("python_syntax") ? "on" : ""}`}
            onClick={() => onToggleLens("python_syntax")}
            title="开关 Python 高阶语法透视（含浏览器微沙盒）"
          >
            🐍 Python
          </button>
          <button
            id="lens-toggle-paper"
            type="button"
            className={`lens-btn ${activeLenses.includes("pregel_paper") ? "on" : ""}`}
            onClick={() => onToggleLens("pregel_paper")}
            title="开关 Google Pregel (2010) 论文溯源"
          >
            📄 论文
          </button>
          <button
            id="lens-toggle-contract"
            type="button"
            className={`lens-btn ${activeLenses.includes("runnable_contract") ? "on" : ""}`}
            onClick={() => onToggleLens("runnable_contract")}
            title="开关 LangChain Runnable 控制面契约透镜"
          >
            🔗 契约
          </button>
          {activeLenses.length > 0 && (
            <button
              id="lens-pure-mode"
              type="button"
              className="lens-btn"
              onClick={onSetPureMode}
              title="一键隐藏全部前置扫盲微标，进入老手纯净阅读态"
            >
              <Zap size={11} style={{ verticalAlign: "middle" }} /> 纯净
            </button>
          )}
        </div>

        <div className="segmented-group" role="tablist" aria-label="三挡工作台视图切换">
          <button
            id="gear-workbench"
            type="button"
            role="tab"
            aria-selected={gear === "workbench"}
            className={`seg-btn ${gear === "workbench" ? "active" : ""}`}
            onClick={() => onChangeGear("workbench")}
          >
            <Microscope size={13} />
            解剖台
          </button>
          <button
            id="gear-canvas"
            type="button"
            role="tab"
            aria-selected={gear === "canvas"}
            className={`seg-btn ${gear === "canvas" ? "active" : ""}`}
            onClick={() => onChangeGear("canvas")}
          >
            <GitBranch size={13} />
            生长画布
            <span
              className="mono"
              style={{
                fontSize: 10.5,
                padding: "0 5px",
                borderRadius: 9,
                background: "var(--accent-teal-soft)",
                color: "var(--accent-teal)",
              }}
            >
              {grownCount}
            </span>
          </button>
          <button
            id="gear-atlas"
            type="button"
            role="tab"
            aria-selected={gear === "atlas"}
            className={`seg-btn ${gear === "atlas" ? "active" : ""}`}
            onClick={() => onChangeGear("atlas")}
          >
            <Compass size={13} />
            全局星图
          </button>
        </div>

        <button
          id="btn-theme-toggle"
          type="button"
          className="icon-btn"
          onClick={onToggleTheme}
          title="切换暗色 X-Ray 透视 / 亮色工程蓝图主题"
        >
          {theme === "dark" ? <Sun size={13} /> : <Moon size={13} />}
        </button>

        <button
          id="btn-engine-settings"
          type="button"
          className="icon-btn"
          onClick={onOpenSettings}
          title="配置 Gemini API Key / Edge API 与个人图谱管理"
        >
          <Settings size={13} />
        </button>
      </div>
    </header>
  );
};
