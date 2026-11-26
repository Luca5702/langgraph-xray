import React, { useEffect, useRef, useState } from "react";
import { Check, Pin, Plus } from "lucide-react";
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
  topologyNodes: string[];
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
  topologyNodes,
}) => {
  const [trayMode, setTrayMode] = useState<"contract" | "fusion" | "raw">("fusion");
  const [sandboxTab, setSandboxTab] = useState<
    "matrix" | "channels" | "tasks" | "scratchpad"
  >("matrix");
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const activeSymbol =
    symbols[activeSymbolId] ??
    symbols[pinnedSymbolIds[0]] ??
    Object.values(symbols)[0];
  const isPinned = pinnedSymbolIds.includes(activeSymbol.symbol_id);

  const currentFrame = frames[frameIndex] ?? frames[0];
  const prevFrame = frameIndex > 0 ? frames[frameIndex - 1] : null;
  const mem = currentFrame.memory_snapshot;

  const formatLiveBinding = (liveKey: string | undefined): string => {
    if (!liveKey) return "—";
    const val = (mem as unknown as Record<string, unknown>)[liveKey];
    if (val === undefined) return "—";
    const s = JSON.stringify(val);
    return s.length > 48 ? `${s.slice(0, 46)}…` : s;
  };

  const allChannelNames = Object.keys(mem.channel_versions).filter(
    (c) => c !== "__start__"
  );
  const realNodes = topologyNodes.filter(
    (n) => n !== "__start__" && n !== "__end__"
  );
  const scheduledTriggersByNode = new Map<string, Set<string>>();
  for (const t of mem.tasks_queue) {
    scheduledTriggersByNode.set(t.name, new Set(t.triggers));
  }

  return (
    <aside className="pane-col" aria-label="静态契约托盘与超步内存检查器">
      <div className="inspector-split">
        {/* ================================================================
            UPPER HALF: STATIC SYMBOL BLUEPRINT TRAY (Raycast / Linear Style)
            ================================================================ */}
        <div className="blueprint-pane">
          <div className="col-bar" style={{ paddingLeft: 8, paddingRight: 8 }}>
            <div className="editor-tabs" style={{ flex: 1 }}>
              {pinnedSymbolIds.map((sid) => {
                const s = symbols[sid];
                if (!s) return null;
                const selected = sid === activeSymbol.symbol_id;
                const shortName =
                  s.name === "PregelExecutableTask"
                    ? "ExecutableTask"
                    : s.name === "BinaryOperatorAggregate"
                      ? "BinOpAggregate"
                      : s.name;
                return (
                  <button
                    key={sid}
                    type="button"
                    onClick={() => onSelectSymbol(sid)}
                    className={`editor-tab mono ${selected ? "active" : ""}`}
                    style={{ padding: "0 8px", fontSize: 11.3 }}
                    title={s.name}
                  >
                    {shortName}
                  </button>
                );
              })}
            </div>

            <div ref={pickerRef} style={{ position: "relative", flexShrink: 0 }}>
              <button
                type="button"
                className="ghost-icon-btn"
                style={{ width: 24, height: 24 }}
                onClick={() => setPickerOpen((o) => !o)}
                title="浏览或钉住其他内核符号定义"
              >
                <Plus size={13} strokeWidth={1.6} />
              </button>

              {pickerOpen && (
                <div
                  style={{
                    position: "fixed",
                    right: 14,
                    top: 122,
                    width: 270,
                    maxHeight: 320,
                    overflowY: "auto",
                    background: "var(--bg-popover)",
                    borderRadius: 10,
                    padding: 5,
                    boxShadow: "var(--shadow-popover)",
                    zIndex: 95,
                  }}
                >
                  <div
                    className="eyebrow"
                    style={{
                      padding: "4px 8px 6px",
                      borderBottom: "1px solid var(--hairline)",
                    }}
                  >
                    19 Kernel Symbols
                  </div>
                  {Object.values(symbols).map((sym) => {
                    const pinned = pinnedSymbolIds.includes(sym.symbol_id);
                    return (
                      <button
                        key={sym.symbol_id}
                        type="button"
                        className="chapter-menu-item"
                        style={{ padding: "6px 8px", alignItems: "center" }}
                        onClick={() => {
                          onSelectSymbol(sym.symbol_id);
                          if (!pinned) onTogglePinSymbol(sym.symbol_id);
                          setPickerOpen(false);
                        }}
                      >
                        <span className="mono" style={{ fontSize: 11.5 }}>
                          {sym.name}
                          <span
                            style={{
                              color: "var(--ink-faint)",
                              marginLeft: 6,
                              fontSize: 10.5,
                            }}
                          >
                            {sym.kind}
                          </span>
                        </span>
                        {pinned && (
                          <Check size={12} strokeWidth={1.6} color="var(--ink-muted)" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Subheader Metadata Row + Mode Switcher */}
          <div
            style={{
              padding: "5px 12px 5px 14px",
              borderBottom: "1px solid var(--hairline)",
              background: "var(--bg-canvas)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <div
              className="mono"
              style={{
                fontSize: 11,
                color: "var(--ink-muted)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              <span style={{ color: "var(--ink-faint)", marginRight: 5 }}>
                {activeSymbol.kind}
              </span>
              <span style={{ color: "var(--ink)", fontWeight: 500 }}>
                {activeSymbol.name}
              </span>
              <span style={{ color: "var(--ink-faint)", marginLeft: 6 }}>
                :{activeSymbol.defined_in.start_line}
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              <div className="seg-control" style={{ height: 22 }}>
                {(
                  [
                    ["contract", "Struct"],
                    ["fusion", "Live"],
                    ["raw", "Code"],
                  ] as const
                ).map(([m, label]) => (
                  <button
                    key={m}
                    type="button"
                    className={`seg-item ${trayMode === m ? "active" : ""}`}
                    style={{ height: 16, padding: "0 6px", fontSize: 10.5 }}
                    onClick={() => setTrayMode(m)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => onTogglePinSymbol(activeSymbol.symbol_id)}
                title={isPinned ? "从托盘取消固定" : "固定在手边标签栏"}
                style={{
                  border: "none",
                  background: "transparent",
                  padding: 0,
                  color: isPinned ? "var(--ink)" : "var(--ink-faint)",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                }}
              >
                <Pin size={12} strokeWidth={1.5} />
              </button>
            </div>
          </div>

          {symbolProvenance && (
            <div
              className="mono"
              style={{
                padding: "4px 14px",
                borderBottom: "1px solid var(--hairline)",
                fontSize: 10.5,
                color: "var(--sig-blue)",
                background: "var(--sig-blue-tint)",
              }}
            >
              {symbolProvenance}
            </div>
          )}

          {/* Hairline Property Inspector Body */}
          <div className="pane-scroll">
            {trayMode === "raw" ? (
              <pre
                className="mono"
                style={{
                  margin: 0,
                  padding: "12px 14px",
                  background: "var(--bg-code)",
                  fontSize: 11.2,
                  lineHeight: 1.6,
                  color: "var(--ink-secondary)",
                  overflowX: "auto",
                }}
              >
                {activeSymbol.raw_excerpt}
              </pre>
            ) : (
              <>
                {activeSymbol.fields.map((f) => (
                  <div key={f.name} className="kv-row">
                    <div className="kv-top">
                      <span className="kv-sig mono">{f.name}</span>
                      {trayMode === "fusion" && (
                        <span
                          className="kv-live-val mono"
                          title={formatLiveBinding(f.live_key)}
                        >
                          {formatLiveBinding(f.live_key)}
                        </span>
                      )}
                    </div>
                    <div className="kv-desc">{f.duty_cn}</div>
                  </div>
                ))}

                {activeSymbol.subclasses_summary &&
                  activeSymbol.subclasses_summary.length > 0 && (
                    <div>
                      <div
                        className="eyebrow"
                        style={{
                          padding: "10px 14px 6px",
                          borderBottom: "1px solid var(--hairline)",
                        }}
                      >
                        Polymorphic Subclasses
                      </div>
                      {activeSymbol.subclasses_summary.map((sub) => (
                        <div key={sub.name} className="kv-row">
                          <div className="kv-sig mono">{sub.name}</div>
                          <div className="kv-desc">{sub.behavior_diff_cn}</div>
                        </div>
                      ))}
                    </div>
                  )}
              </>
            )}
          </div>
        </div>

        {/* ================================================================
            LOWER HALF: PREGEL RUNTIME STATE INSPECTOR
            ================================================================ */}
        <div className="runtime-pane">
          <div className="col-bar" style={{ paddingLeft: 8 }}>
            <div className="editor-tabs">
              {(
                [
                  ["matrix", "Versions"],
                  ["channels", "Channels"],
                  ["tasks", "Tasks"],
                  ["scratchpad", "Scratchpad"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`editor-tab ${sandboxTab === id ? "active" : ""}`}
                  style={{ padding: "0 8px", fontSize: 11.8 }}
                  onClick={() => setSandboxTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>

            <span
              className="mono"
              style={{
                fontSize: 10.5,
                color: "var(--ink-muted)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: 135,
              }}
              title={currentFrame.phase_label}
            >
              Step {currentFrame.superstep}
            </span>
          </div>

          <div
            style={{
              padding: "5px 14px",
              borderBottom: "1px solid var(--hairline)",
              background: "var(--bg-canvas)",
              fontSize: 11.2,
              color: currentFrame.phase_label?.includes("Interrupt")
                ? "var(--sig-red)"
                : "var(--ink-secondary)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
            title={currentFrame.phase_label}
          >
            {currentFrame.phase_label ?? currentFrame.lifecycle_phase}
          </div>

          <div className="pane-scroll">
            {sandboxTab === "matrix" &&
              (allChannelNames.length === 0 ? (
                <div style={{ padding: "18px 14px", color: "var(--ink-muted)", fontSize: 12 }}>
                  当前处于编译静态期（Compile），尚未注入运行输入。点击顶栏{" "}
                  <strong style={{ color: "var(--ink)" }}>Next Phase</strong> 启动第 0 超步。
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table className="clean-matrix mono">
                    <thead>
                      <tr>
                        <th>Channel</th>
                        <th>Ver</th>
                        {realNodes.map((n) => (
                          <th key={n}>{n}</th>
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
                            <td style={{ color: "var(--ink)", fontWeight: 500 }}>{ch}</td>
                            <td
                              style={{
                                color: bumped ? "var(--sig-amber)" : "var(--ink)",
                                fontWeight: 500,
                              }}
                            >
                              {globalVer}
                              {bumped ? "↑" : ""}
                            </td>
                            {realNodes.map((n) => {
                              const seenVer = mem.versions_seen[n]?.[ch];
                              const numGlobal = Number(globalVer);
                              const numSeen = seenVer === undefined ? 0 : Number(seenVer);
                              const isScheduledTrigger = Boolean(
                                scheduledTriggersByNode.get(n)?.has(ch)
                              );
                              const unseenHot =
                                isScheduledTrigger &&
                                !Number.isNaN(numGlobal) &&
                                numGlobal > numSeen;
                              return (
                                <td
                                  key={n}
                                  className={unseenHot ? "unseen-hot" : ""}
                                  title={
                                    unseenHot
                                      ? `触发唤醒 ${n} (全局 v${globalVer} > 已见 v${seenVer ?? 0})`
                                      : seenVer !== undefined
                                        ? `已消费同步 (v${seenVer})`
                                        : "未订阅或未消费"
                                  }
                                >
                                  {unseenHot
                                    ? `${seenVer ?? 0} → ${globalVer}`
                                    : seenVer === undefined
                                      ? "·"
                                      : seenVer}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ))}

            {sandboxTab === "channels" && (
              <div>
                <div
                  className="eyebrow"
                  style={{
                    padding: "8px 14px 5px",
                    borderBottom: "1px solid var(--hairline)",
                  }}
                >
                  Committed Channel Values
                </div>
                {Object.entries(mem.channel_values).map(([k, v]) => {
                  const prevVal = prevFrame?.memory_snapshot.channel_values[k];
                  const changed = JSON.stringify(prevVal) !== JSON.stringify(v);
                  return (
                    <div key={k} className="kv-row mono">
                      <div className="kv-top">
                        <span className="kv-sig">{k}</span>
                        {changed && (
                          <span
                            style={{
                              fontSize: 10,
                              padding: "0 5px",
                              borderRadius: 4,
                              background: "var(--sig-green-tint)",
                              color: "var(--sig-green)",
                            }}
                          >
                            updated
                          </span>
                        )}
                      </div>
                      <div
                        className="kv-desc mono"
                        style={{ wordBreak: "break-all", fontSize: 11.2 }}
                      >
                        {JSON.stringify(v)}
                      </div>
                    </div>
                  );
                })}

                <div
                  className="eyebrow"
                  style={{
                    padding: "12px 14px 5px",
                    borderBottom: "1px solid var(--hairline)",
                  }}
                >
                  Uncommitted Pending Writes (Pre-Barrier)
                </div>
                {mem.pending_writes.length === 0 ? (
                  <div
                    className="mono"
                    style={{ padding: "10px 14px", fontSize: 11.5, color: "var(--ink-faint)" }}
                  >
                    none
                  </div>
                ) : (
                  mem.pending_writes.map((pw, idx) => (
                    <div key={idx} className="kv-row mono">
                      <div className="kv-top">
                        <span className="kv-sig" style={{ color: "var(--sig-amber)" }}>
                          {pw.task_name} → {pw.channel}
                        </span>
                      </div>
                      <div className="kv-desc mono" style={{ fontSize: 11.2 }}>
                        {JSON.stringify(pw.value)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {sandboxTab === "tasks" && (
              <div>
                <div
                  className="eyebrow"
                  style={{
                    padding: "8px 14px 5px",
                    borderBottom: "1px solid var(--hairline)",
                  }}
                >
                  Scheduled Tasks &amp; Isolated Snapshots
                </div>
                {mem.tasks_queue.length === 0 ? (
                  <div
                    style={{ padding: "14px", fontSize: 12, color: "var(--ink-muted)" }}
                  >
                    空任务队列 — 当前超步无触发条件满足（Vote to Halt）。
                  </div>
                ) : (
                  mem.tasks_queue.map((t, i) => (
                    <div key={`${t.name}_${i}`} className="kv-row mono">
                      <div className="kv-top">
                        <span className="kv-sig">{t.name}</span>
                        <span style={{ fontSize: 10.5, color: "var(--ink-faint)" }}>
                          [{t.triggers.join(", ")}]
                        </span>
                      </div>
                      <div className="kv-desc mono" style={{ fontSize: 11.2 }}>
                        input: {JSON.stringify(t.input)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {sandboxTab === "scratchpad" && (
              <pre
                className="mono"
                style={{
                  margin: 0,
                  padding: "12px 14px",
                  fontSize: 11.5,
                  lineHeight: 1.6,
                  color: "var(--ink-secondary)",
                  overflowX: "auto",
                }}
              >
                {JSON.stringify(mem.scratchpad ?? {}, null, 2)}
              </pre>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
};
