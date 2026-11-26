import React, { useState } from "react";
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Pause,
  Pin,
  Play,
  RotateCcw,
  SkipForward,
  Wrench,
} from "lucide-react";
import type { KernelBundle, TraceFrame } from "../types/bundle";

interface RightWorkbenchPaneProps {
  symbols: KernelBundle["symbols"];
  pinnedSymbolIds: string[];
  activeSymbolId: string;
  symbolProvenance: string;
  onSelectSymbol: (symId: string) => void;
  onTogglePinSymbol: (symId: string) => void;
  frames: Array<TraceFrame & { phase_label?: string }>;
  frameIndex: number;
  onChangeFrameIndex: (idx: number) => void;
  isAutoPlaying: boolean;
  onToggleAutoPlay: () => void;
}

export const RightWorkbenchPane: React.FC<RightWorkbenchPaneProps> = ({
  symbols,
  pinnedSymbolIds,
  activeSymbolId,
  symbolProvenance,
  onSelectSymbol,
  onTogglePinSymbol,
  frames,
  frameIndex,
  onChangeFrameIndex,
  isAutoPlaying,
  onToggleAutoPlay,
}) => {
  const [trayMode, setTrayMode] = useState<"contract" | "fusion" | "raw">("fusion");
  const [sandboxTab, setSandboxTab] = useState<"matrix" | "channels" | "scratchpad">(
    "matrix"
  );

  const activeSymbol =
    symbols[activeSymbolId] ?? symbols[pinnedSymbolIds[0]] ?? Object.values(symbols)[0];
  const isPinned = pinnedSymbolIds.includes(activeSymbol.symbol_id);

  const currentFrame = frames[frameIndex] ?? frames[0];
  const prevFrame = frameIndex > 0 ? frames[frameIndex - 1] : null;
  const mem = currentFrame.memory_snapshot;

  const handleNextSuperstep = () => {
    const curStep = currentFrame.superstep;
    const nextIdx = frames.findIndex(
      (f, idx) => idx > frameIndex && f.superstep > curStep
    );
    onChangeFrameIndex(nextIdx >= 0 ? nextIdx : frames.length - 1);
  };

  const formatLiveBinding = (liveKey: string | undefined): string => {
    if (!liveKey) return "—";
    const val = (mem as unknown as Record<string, unknown>)[liveKey];
    if (val === undefined) return "—";
    const s = JSON.stringify(val);
    return s.length > 56 ? `${s.slice(0, 54)}…` : s;
  };

  const allChannelNames = Object.keys(mem.channel_versions);
  const allNodeNames = Object.keys(mem.versions_seen);

  return (
    <aside className="pane-col" aria-label="手边静态器械盘与运行时内存沙盒">
      <div className="right-split">
        {/* ================================================================
            UPPER HALF: AT-HAND SURGERY TRAY (就在手边静态结构定义)
            ================================================================ */}
        <div className="tray-section">
          <div className="pane-header" style={{ padding: "6px 10px" }}>
            <div className="pane-title">
              <Wrench size={13} color="var(--accent-teal)" />
              <span>手边器械盘 (零跳转静态契约)</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <select
                aria-label="切换查阅任意内核类定义"
                className="chapter-select"
                style={{ fontSize: 11, padding: "2px 6px" }}
                value={activeSymbol.symbol_id}
                onChange={(e) => onSelectSymbol(e.target.value)}
              >
                {Object.values(symbols).map((s) => (
                  <option key={s.symbol_id} value={s.symbol_id}>
                    {s.name} ({s.kind})
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="icon-btn"
                style={{
                  padding: "2px 7px",
                  borderColor: isPinned ? "var(--accent-teal)" : undefined,
                  color: isPinned ? "var(--accent-teal)" : undefined,
                }}
                onClick={() => onTogglePinSymbol(activeSymbol.symbol_id)}
                title="将该数据结构常驻钉在手边托盘"
              >
                <Pin size={11} />
                {isPinned ? "已钉住" : "钉住"}
              </button>
            </div>
          </div>

          {/* Pinned Capsule Bar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 6,
              padding: "5px 10px",
              background: "var(--bg-canvas)",
              borderBottom: "1px solid var(--border-subtle)",
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {pinnedSymbolIds.map((sid) => {
                const s = symbols[sid];
                if (!s) return null;
                const selected = sid === activeSymbol.symbol_id;
                return (
                  <button
                    key={sid}
                    type="button"
                    onClick={() => onSelectSymbol(sid)}
                    className={`lens-btn mono ${selected ? "on" : ""}`}
                    style={{
                      fontSize: 11,
                      borderColor: selected ? "var(--accent-teal)" : undefined,
                      color: selected ? "var(--accent-teal)" : undefined,
                    }}
                  >
                    📌 {s.name}
                  </button>
                );
              })}
            </div>

            <div className="segmented-group">
              <button
                type="button"
                className={`seg-btn ${trayMode === "contract" ? "active" : ""}`}
                style={{ padding: "2px 6px", fontSize: 11 }}
                onClick={() => setTrayMode("contract")}
              >
                契约
              </button>
              <button
                type="button"
                className={`seg-btn ${trayMode === "fusion" ? "active" : ""}`}
                style={{ padding: "2px 6px", fontSize: 11 }}
                onClick={() => setTrayMode("fusion")}
              >
                契约×当前值
              </button>
              <button
                type="button"
                className={`seg-btn ${trayMode === "raw" ? "active" : ""}`}
                style={{ padding: "2px 6px", fontSize: 11 }}
                onClick={() => setTrayMode("raw")}
              >
                原源码
              </button>
            </div>
          </div>

          {/* Active Symbol Card Content */}
          <div className="pane-scroll" style={{ padding: "9px 11px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginBottom: 5,
                gap: 6,
              }}
            >
              <span className="mono" style={{ fontWeight: 700, fontSize: 12.5 }}>
                <span style={{ color: "var(--accent-amber)", marginRight: 5 }}>
                  {activeSymbol.kind}
                </span>
                {activeSymbol.name}
              </span>
              <span className="mono" style={{ fontSize: 10.5, color: "var(--text-muted)" }}>
                {activeSymbol.defined_in.file.split("langgraph/").pop()}:L
                {activeSymbol.defined_in.start_line}
              </span>
            </div>

            {symbolProvenance && (
              <div
                style={{
                  fontSize: 11,
                  padding: "3px 7px",
                  marginBottom: 7,
                  borderRadius: 4,
                  background: "var(--accent-amber-soft)",
                  color: "var(--accent-amber)",
                }}
              >
                ⚡ {symbolProvenance}
              </div>
            )}

            {trayMode === "raw" ? (
              <pre
                className="mono"
                style={{
                  margin: 0,
                  padding: 8,
                  borderRadius: 5,
                  background: "var(--bg-code)",
                  border: "1px solid var(--border-subtle)",
                  fontSize: 11,
                  lineHeight: 1.5,
                  overflowX: "auto",
                }}
              >
                {activeSymbol.raw_excerpt}
              </pre>
            ) : (
              <>
                {activeSymbol.fields.map((f) => (
                  <div key={f.name} className="field-row-card">
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <span className="mono" style={{ fontWeight: 600, fontSize: 11.5 }}>
                        {f.name}
                      </span>
                      {trayMode === "fusion" && (
                        <span
                          className="mono"
                          style={{
                            fontSize: 10.5,
                            padding: "1px 6px",
                            borderRadius: 4,
                            background: "var(--accent-teal-soft)",
                            color: "var(--accent-teal)",
                            maxWidth: "48%",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={formatLiveBinding(f.live_key)}
                        >
                          {formatLiveBinding(f.live_key)}
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 11.5,
                        color: "var(--text-secondary)",
                        marginTop: 2,
                      }}
                    >
                      {f.duty_cn}
                    </div>
                  </div>
                ))}

                {activeSymbol.subclasses_summary &&
                  activeSymbol.subclasses_summary.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: "var(--accent-teal)",
                          marginBottom: 4,
                        }}
                      >
                        5 大核心通道子类多态行为速查：
                      </div>
                      {activeSymbol.subclasses_summary.map((sub) => (
                        <div
                          key={sub.name}
                          className="field-row-card"
                          style={{ padding: "5px 8px" }}
                        >
                          <strong className="mono" style={{ fontSize: 11 }}>
                            ↳ {sub.name}：
                          </strong>
                          <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                            {sub.behavior_diff_cn}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
              </>
            )}
          </div>
        </div>

        {/* ================================================================
            LOWER HALF: PREGEL RUNTIME STATE X-RAY SANDBOX
            ================================================================ */}
        <div className="sandbox-section">
          <div className="pane-header" style={{ padding: "6px 10px", flexWrap: "wrap" }}>
            <div className="pane-title">
              <Activity size={13} color="var(--accent-emerald)" />
              <span>Pregel 超步内存沙盒</span>
              <span className="mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>
                ({frameIndex + 1}/{frames.length})
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <button
                id="sandbox-reset"
                type="button"
                className="icon-btn"
                onClick={() => onChangeFrameIndex(0)}
                title="重置回第 0 帧 (Compile)"
              >
                <RotateCcw size={12} />
              </button>
              <button
                id="sandbox-prev"
                type="button"
                className="icon-btn"
                disabled={frameIndex <= 0}
                onClick={() => onChangeFrameIndex(Math.max(0, frameIndex - 1))}
                title="上一半步 (快捷键 ←)"
              >
                <ChevronLeft size={13} />
              </button>
              <button
                id="sandbox-next"
                type="button"
                className="icon-btn"
                disabled={frameIndex >= frames.length - 1}
                onClick={() =>
                  onChangeFrameIndex(Math.min(frames.length - 1, frameIndex + 1))
                }
                style={{
                  borderColor: "var(--accent-teal)",
                  color: "var(--accent-teal)",
                  fontWeight: 600,
                }}
                title="推进下一相位半步 (快捷键 →)"
              >
                下一相位 <ChevronRight size={13} />
              </button>
              <button
                id="sandbox-next-superstep"
                type="button"
                className="icon-btn"
                disabled={frameIndex >= frames.length - 1}
                onClick={handleNextSuperstep}
                title="跳至下一完整 Superstep"
              >
                <SkipForward size={12} />
              </button>
              <button
                id="sandbox-autoplay"
                type="button"
                className="icon-btn"
                onClick={onToggleAutoPlay}
                title="自动连续播放超步演进"
              >
                {isAutoPlaying ? <Pause size={12} /> : <Play size={12} />}
              </button>
            </div>
          </div>

          {/* Current Phase Banner + Scrubber */}
          <div
            style={{
              padding: "6px 10px",
              background: "var(--bg-canvas)",
              borderBottom: "1px solid var(--border-subtle)",
            }}
          >
            <div
              style={{
                fontSize: 11.5,
                fontWeight: 600,
                color: currentFrame.phase_label?.includes("Interrupt")
                  ? "var(--accent-coral)"
                  : "var(--accent-teal)",
                marginBottom: 4,
              }}
            >
              {currentFrame.phase_label ?? currentFrame.lifecycle_phase}
            </div>
            <input
              aria-label="超步帧进度条"
              type="range"
              min={0}
              max={Math.max(0, frames.length - 1)}
              value={frameIndex}
              onChange={(e) => onChangeFrameIndex(Number(e.target.value))}
              style={{ width: "100%", accentColor: "var(--accent-teal)", height: 4 }}
            />
          </div>

          {/* Sandbox Sub-Tabs */}
          <div
            style={{
              display: "flex",
              gap: 4,
              padding: "5px 10px",
              borderBottom: "1px solid var(--border-subtle)",
              background: "var(--bg-panel)",
            }}
          >
            <button
              type="button"
              className={`lens-btn ${sandboxTab === "matrix" ? "on" : ""}`}
              onClick={() => setSandboxTab("matrix")}
            >
              唤醒判定矩阵
            </button>
            <button
              type="button"
              className={`lens-btn ${sandboxTab === "channels" ? "on" : ""}`}
              onClick={() => setSandboxTab("channels")}
            >
              通道Diff & 读写隔离
            </button>
            <button
              type="button"
              className={`lens-btn ${sandboxTab === "scratchpad" ? "on" : ""}`}
              onClick={() => setSandboxTab("scratchpad")}
            >
              Scratchpad 草稿箱
            </button>
          </div>

          <div className="pane-scroll" style={{ padding: "9px 11px" }}>
            {sandboxTab === "matrix" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {allChannelNames.length === 0 ? (
                  <div style={{ color: "var(--text-muted)", fontSize: 12 }}>
                    当前处于 <strong>Compile 编译静态期</strong>，尚未注入初始输入，因此全局{" "}
                    <code>channel_versions</code> 为空字典。点击上方「下一相位 →」进入 Step #0！
                  </div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table className="ver-matrix mono">
                      <thead>
                        <tr>
                          <th>Channel 通道</th>
                          <th>全局版本</th>
                          {allNodeNames.map((n) => (
                            <th key={n}>{n} 已见</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {allChannelNames.map((ch) => {
                          const globalVer = mem.channel_versions[ch];
                          const prevVer = prevFrame?.memory_snapshot.channel_versions[ch];
                          const bumped = prevVer !== undefined && prevVer !== globalVer;
                          return (
                            <tr key={ch}>
                              <td style={{ fontWeight: 600 }}>{ch}</td>
                              <td
                                style={{
                                  color: bumped
                                    ? "var(--accent-amber)"
                                    : "var(--text-primary)",
                                  fontWeight: 700,
                                }}
                              >
                                v{globalVer} {bumped ? "↑" : ""}
                              </td>
                              {allNodeNames.map((n) => {
                                const seenVer = mem.versions_seen[n]?.[ch];
                                const numGlobal = Number(globalVer);
                                const numSeen = seenVer === undefined ? 0 : Number(seenVer);
                                const unseenHot =
                                  !Number.isNaN(numGlobal) && numGlobal > numSeen;
                                return (
                                  <td
                                    key={n}
                                    className={
                                      unseenHot ? "cell-trigger-hot" : "cell-synced"
                                    }
                                    title={
                                      unseenHot
                                        ? `全局版本 (${globalVer}) > ${n} 已见版本 (${seenVer ?? 0})：若订阅此通道则触发唤醒！`
                                        : "已同步消费，不会重复触发"
                                    }
                                  >
                                    {seenVer === undefined ? "—" : `v${seenVer}`}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                <div>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: "var(--text-secondary)",
                      marginBottom: 4,
                    }}
                  >
                    本轮排期并发任务队列 (<code>tasks_queue</code> · 私有快照输入):
                  </div>
                  {mem.tasks_queue.length === 0 ? (
                    <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                      空队列（无节点被唤醒 → 达成 Vote to Halt 终止条件）
                    </div>
                  ) : (
                    mem.tasks_queue.map((t, i) => (
                      <div key={`${t.name}_${i}`} className="field-row-card mono">
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            color: "var(--accent-teal)",
                            fontWeight: 600,
                            fontSize: 11.5,
                          }}
                        >
                          <span>Task: {t.name}</span>
                          <span>triggers: [{t.triggers.join(", ")}]</span>
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--text-secondary)",
                            marginTop: 2,
                          }}
                        >
                          私有只读快照 input: {JSON.stringify(t.input)}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {sandboxTab === "channels" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: "var(--accent-emerald)",
                      marginBottom: 4,
                    }}
                  >
                    已过屏障生效的全局通道值 (<code>channel_values</code>):
                  </div>
                  {Object.entries(mem.channel_values).map(([k, v]) => {
                    const prevVal = prevFrame?.memory_snapshot.channel_values[k];
                    const changed = JSON.stringify(prevVal) !== JSON.stringify(v);
                    return (
                      <div
                        key={k}
                        className="field-row-card mono"
                        style={{
                          borderColor: changed
                            ? "var(--accent-emerald)"
                            : "var(--border-subtle)",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: 11.5,
                          }}
                        >
                          <strong style={{ color: "var(--text-primary)" }}>{k}</strong>
                          {changed && (
                            <span
                              style={{
                                fontSize: 10,
                                color: "var(--accent-emerald)",
                                fontWeight: 700,
                              }}
                            >
                              ● 本帧已变更
                            </span>
                          )}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--text-secondary)",
                            wordBreak: "break-all",
                          }}
                        >
                          {JSON.stringify(v)}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: "var(--accent-amber)",
                      marginBottom: 4,
                    }}
                  >
                    尚未过屏障的任务写缓冲 / 挂起记录 (<code>pending_writes</code>):
                  </div>
                  {mem.pending_writes.length === 0 ? (
                    <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                      [] （已全部在同步屏障合入或尚未产生写入）
                    </div>
                  ) : (
                    mem.pending_writes.map((pw, idx) => (
                      <div
                        key={idx}
                        className="field-row-card mono"
                        style={{ borderColor: "var(--accent-amber)" }}
                      >
                        <span style={{ color: "var(--accent-amber)", fontWeight: 600 }}>
                          {pw.task_name} → {pw.channel}:
                        </span>{" "}
                        <span style={{ fontSize: 11 }}>{JSON.stringify(pw.value)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {sandboxTab === "scratchpad" && (
              <div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--accent-teal)",
                    marginBottom: 6,
                  }}
                >
                  运行时控制面与中断重放草稿箱 (<code>PregelScratchpad</code> & Namespace):
                </div>
                <pre
                  className="mono"
                  style={{
                    margin: 0,
                    padding: 10,
                    borderRadius: 6,
                    background: "var(--bg-code)",
                    border: "1px solid var(--border-subtle)",
                    fontSize: 11.5,
                    lineHeight: 1.55,
                    overflowX: "auto",
                  }}
                >
                  {JSON.stringify(mem.scratchpad ?? {}, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
};
