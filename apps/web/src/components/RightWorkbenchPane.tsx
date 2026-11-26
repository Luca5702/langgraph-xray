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
  const [trayMode, setTrayMode] = useState<"contract" | "fusion" | "raw">(
    "fusion"
  );
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
    <aside className="inspector-col" aria-label="手边结构卡与超步运行现场">
      {/* ================================================================
          TOP CARD: AT-HAND OBJECT BLUEPRINT CARD (手边结构卡)
          ================================================================ */}
      <div className="blueprint-card">
        <div className="col-bar" style={{ paddingLeft: 12, paddingRight: 10 }}>
          <div className="editor-tabs" style={{ flex: 1 }}>
            {pinnedSymbolIds.map((sid) => {
              const s = symbols[sid];
              if (!s) return null;
              const selected = sid === activeSymbol.symbol_id;
              const shortName =
                s.name === "PregelExecutableTask"
                  ? "ExecTask"
                  : s.name === "NamedBarrierValue"
                    ? "BarrierValue"
                    : s.name === "BinaryOperatorAggregate"
                      ? "BinOpAgg"
                      : s.name;
              return (
                <button
                  key={sid}
                  type="button"
                  onClick={() => onSelectSymbol(sid)}
                  className={`editor-tab mono ${selected ? "active" : ""}`}
                  style={{ padding: "0 8px", fontSize: 11.2 }}
                  title={`查看 ${s.name} 的结构说明`}
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
              style={{ width: 26, height: 26 }}
              onClick={() => setPickerOpen((o) => !o)}
              title="挑选其他内核对象放到手边对照"
            >
              <Plus size={14} strokeWidth={1.8} />
            </button>

            {pickerOpen && (
              <div
                style={{
                  position: "fixed",
                  right: 16,
                  top: 145,
                  width: 278,
                  maxHeight: 330,
                  overflowY: "auto",
                  background: "var(--bg-card)",
                  borderRadius: 14,
                  padding: 6,
                  boxShadow: "var(--shadow-popover)",
                  zIndex: 95,
                }}
              >
                <div
                  className="eyebrow"
                  style={{
                    padding: "6px 10px 8px",
                    borderBottom: "1px solid var(--border-soft)",
                  }}
                >
                  全部 19 个核心结构卡
                </div>
                {Object.values(symbols).map((sym) => {
                  const pinned = pinnedSymbolIds.includes(sym.symbol_id);
                  return (
                    <button
                      key={sym.symbol_id}
                      type="button"
                      className="chapter-menu-item"
                      style={{ padding: "7px 10px", alignItems: "center" }}
                      onClick={() => {
                        onSelectSymbol(sym.symbol_id);
                        if (!pinned) onTogglePinSymbol(sym.symbol_id);
                        setPickerOpen(false);
                      }}
                    >
                      <span className="mono" style={{ fontSize: 11.6 }}>
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
                        <Check
                          size={13}
                          strokeWidth={1.8}
                          color="var(--clay)"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Subheader: Object Identity + Friendly Switcher */}
        <div
          style={{
            padding: "6px 14px",
            borderBottom: "1px solid var(--border-soft)",
            background: "var(--bg-subtle)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <div
            style={{
              fontSize: 11.5,
              color: "var(--ink-muted)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ marginRight: 6 }}>手边结构：</span>
            <span
              className="mono"
              style={{ color: "var(--ink)", fontWeight: 600 }}
            >
              {activeSymbol.name}
            </span>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              flexShrink: 0,
            }}
          >
            <div className="seg-control" style={{ height: 24, padding: 2 }}>
              {(
                [
                  ["contract", "字段说明"],
                  ["fusion", "实时对照"],
                  ["raw", "源码定义"],
                ] as const
              ).map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  className={`seg-item ${trayMode === m ? "active" : ""}`}
                  style={{ height: 20, padding: "0 8px", fontSize: 11 }}
                  onClick={() => setTrayMode(m)}
                >
                  {label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => onTogglePinSymbol(activeSymbol.symbol_id)}
              title={isPinned ? "从手边栏收起" : "固定在手边栏"}
              style={{
                border: "none",
                background: "transparent",
                padding: 2,
                color: isPinned ? "var(--clay)" : "var(--ink-faint)",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              <Pin size={13} strokeWidth={1.7} />
            </button>
          </div>
        </div>

        {symbolProvenance && (
          <div
            style={{
              padding: "5px 14px",
              borderBottom: "1px solid var(--border-soft)",
              fontSize: 11.2,
              color: "var(--ink-blue)",
              background: "var(--ink-blue-tint)",
            }}
          >
            定位来源：{symbolProvenance}
          </div>
        )}

        <div className="pane-scroll">
          {trayMode === "raw" ? (
            <pre
              className="mono"
              style={{
                margin: 0,
                padding: "12px 16px",
                background: "var(--bg-code)",
                fontSize: 11.3,
                lineHeight: 1.62,
                color: "var(--ink-body)",
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
                        padding: "10px 16px 6px",
                        background: "var(--bg-subtle)",
                        borderBottom: "1px solid var(--border-soft)",
                      }}
                    >
                      不同通道子类的行为差别
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
          BOTTOM CARD: SUPERSTEP LIVE RUNTIME STATE (超步运行现场)
          ================================================================ */}
      <div className="runtime-card">
        <div className="col-bar" style={{ paddingLeft: 12, paddingRight: 12 }}>
          <div className="editor-tabs">
            {(
              [
                ["matrix", "谁被唤醒？"],
                ["channels", "通道真值"],
                ["tasks", "并发任务"],
                ["scratchpad", "断点草稿"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`editor-tab ${sandboxTab === id ? "active" : ""}`}
                style={{ padding: "0 9px", fontSize: 12 }}
                onClick={() => setSandboxTab(id)}
              >
                {label}
              </button>
            ))}
          </div>

          <span
            className="chapter-num-badge"
            style={{ fontSize: 11, padding: "2px 8px" }}
            title={currentFrame.phase_label}
          >
            第 {currentFrame.superstep} 轮超步
          </span>
        </div>

        <div
          style={{
            padding: "6px 16px",
            borderBottom: "1px solid var(--border-soft)",
            background: "var(--bg-subtle)",
            fontSize: 11.8,
            color: currentFrame.phase_label?.includes("Interrupt")
              ? "var(--ink-coral)"
              : "var(--ink-body)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
          title={currentFrame.phase_label}
        >
          当前画面：{currentFrame.phase_label ?? currentFrame.lifecycle_phase}
        </div>

        <div className="pane-scroll">
          {sandboxTab === "matrix" &&
            (allChannelNames.length === 0 ? (
              <div
                style={{
                  padding: "18px 16px",
                  color: "var(--ink-muted)",
                  fontSize: 12.5,
                  lineHeight: 1.65,
                }}
              >
                此刻还在静态编译建图阶段，还没有注入输入数据。点击上方橙色按钮{" "}
                <strong style={{ color: "var(--clay)" }}>「下一步 ›」</strong>{" "}
                开始观察第 0 轮超步如何唤醒节点吧！
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="clean-matrix mono">
                  <thead>
                    <tr>
                      <th>状态通道</th>
                      <th>版本</th>
                      {realNodes.map((n) => (
                        <th key={n}>{n}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {allChannelNames.map((ch) => {
                      const globalVer = mem.channel_versions[ch];
                      const prevVer =
                        prevFrame?.memory_snapshot.channel_versions[ch];
                      const bumped =
                        prevVer !== undefined && prevVer !== globalVer;
                      return (
                        <tr key={ch}>
                          <td style={{ color: "var(--ink)", fontWeight: 600 }}>
                            {ch}
                          </td>
                          <td
                            style={{
                              color: bumped ? "var(--ink-amber)" : "var(--ink)",
                              fontWeight: 600,
                            }}
                          >
                            v{globalVer}
                            {bumped ? " ↑" : ""}
                          </td>
                          {realNodes.map((n) => {
                            const seenVer = mem.versions_seen[n]?.[ch];
                            const numGlobal = Number(globalVer);
                            const numSeen =
                              seenVer === undefined ? 0 : Number(seenVer);
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
                                    ? `通道最新 v${globalVer} 大于节点 ${n} 上次读过的 v${seenVer ?? 0}，因此本轮唤醒它！`
                                    : seenVer !== undefined
                                      ? `节点已读过 v${seenVer}，没有新变化`
                                      : "该节点不监听此通道或尚未执行"
                                }
                              >
                                {unseenHot
                                  ? `${seenVer ?? 0} → ${globalVer}`
                                  : seenVer === undefined
                                    ? "·"
                                    : `v${seenVer}`}
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
                  padding: "8px 16px 6px",
                  background: "var(--bg-subtle)",
                  borderBottom: "1px solid var(--border-soft)",
                }}
              >
                已正式生效的通道值（全局可见）
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
                            fontFamily: "var(--font-sans)",
                            fontSize: 10.5,
                            fontWeight: 600,
                            padding: "1px 7px",
                            borderRadius: 99,
                            background: "var(--ink-sage-tint)",
                            color: "var(--ink-sage)",
                          }}
                        >
                          刚刚更新
                        </span>
                      )}
                    </div>
                    <div
                      className="kv-desc mono"
                      style={{ wordBreak: "break-all", fontSize: 11.4 }}
                    >
                      {JSON.stringify(v)}
                    </div>
                  </div>
                );
              })}

              <div
                className="eyebrow"
                style={{
                  padding: "10px 16px 6px",
                  background: "var(--bg-subtle)",
                  borderBottom: "1px solid var(--border-soft)",
                }}
              >
                屏障外暂存写入（同轮其他并发节点还看不见）
              </div>
              {mem.pending_writes.length === 0 ? (
                <div
                  style={{
                    padding: "12px 16px",
                    fontSize: 12,
                    color: "var(--ink-faint)",
                  }}
                >
                  当前没有暂存写入
                </div>
              ) : (
                mem.pending_writes.map((pw, idx) => (
                  <div key={idx} className="kv-row mono">
                    <div className="kv-top">
                      <span
                        className="kv-sig"
                        style={{ color: "var(--ink-amber)" }}
                      >
                        {pw.task_name} → {pw.channel}
                      </span>
                    </div>
                    <div className="kv-desc mono" style={{ fontSize: 11.4 }}>
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
                  padding: "8px 16px 6px",
                  background: "var(--bg-subtle)",
                  borderBottom: "1px solid var(--border-soft)",
                }}
              >
                本轮排期执行的节点任务（各自拿到独立只读拷贝）
              </div>
              {mem.tasks_queue.length === 0 ? (
                <div
                  style={{
                    padding: "16px",
                    fontSize: 12.5,
                    color: "var(--ink-muted)",
                    lineHeight: 1.6,
                  }}
                >
                  没有新的通道变化需要处理，全部节点一致同意停机收敛（Vote to
                  Halt）。
                </div>
              ) : (
                mem.tasks_queue.map((t, i) => (
                  <div key={`${t.name}_${i}`} className="kv-row mono">
                    <div className="kv-top">
                      <span className="kv-sig">{t.name}</span>
                      <span
                        style={{
                          fontFamily: "var(--font-sans)",
                          fontSize: 11,
                          color: "var(--ink-muted)",
                        }}
                      >
                        由 {t.triggers.join(", ")} 唤醒
                      </span>
                    </div>
                    <div className="kv-desc mono" style={{ fontSize: 11.4 }}>
                      只读输入快照：{JSON.stringify(t.input)}
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
                padding: "14px 16px",
                fontSize: 11.5,
                lineHeight: 1.65,
                color: "var(--ink-body)",
                overflowX: "auto",
              }}
            >
              {JSON.stringify(mem.scratchpad ?? {}, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </aside>
  );
};
