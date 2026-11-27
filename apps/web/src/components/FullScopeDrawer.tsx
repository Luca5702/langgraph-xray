import React, { useState } from "react";
import { ArrowUpRight, ChevronRight, Search, X } from "lucide-react";
import type { ZoomLevel } from "@langgraph-xray/schema";
import type {
  ConceptCardConfig,
  KernelBundle,
  ProbeBundle,
  SourceBlock,
  SourceSlice,
  TraceFrame,
} from "../types/bundle";

interface FullScopeDrawerProps {
  initialTab: "source" | "symbols" | "runtime";
  availableSlices: SourceSlice[];
  activeSliceId: string;
  onSelectSlice: (id: string) => void;
  probe: ProbeBundle;
  currentFrame: TraceFrame & { phase_label?: string };
  symbols: KernelBundle["symbols"];
  concepts: Record<string, ConceptCardConfig>;
  onSproutSymbolToCanvas: (symId: string) => void;
  onSproutConceptToCanvas: (conceptId: string) => void;
  onSproutCodeQuestionToCanvas: (code: string, fileRef: string) => void;
  onClose: () => void;
}

const PY_KEYWORDS = new Set([
  "def",
  "class",
  "return",
  "if",
  "elif",
  "else",
  "for",
  "in",
  "while",
  "try",
  "except",
  "finally",
  "raise",
  "with",
  "as",
  "and",
  "or",
  "not",
  "None",
  "True",
  "False",
  "import",
  "from",
  "yield",
  "async",
  "await",
  "pass",
  "break",
  "continue",
]);

const HOVER_MEMORY_KEYS: Record<string, keyof TraceFrame["memory_snapshot"]> = {
  checkpoint: "channel_versions",
  channel_versions: "channel_versions",
  versions_seen: "versions_seen",
  channels: "channel_values",
  tasks: "tasks_queue",
  task: "tasks_queue",
  writes: "pending_writes",
  pending_writes: "pending_writes",
  scratchpad: "scratchpad",
};

export const FullScopeDrawer: React.FC<FullScopeDrawerProps> = ({
  initialTab,
  availableSlices,
  activeSliceId,
  onSelectSlice,
  probe,
  currentFrame,
  symbols,
  concepts,
  onSproutSymbolToCanvas,
  onSproutConceptToCanvas,
  onSproutCodeQuestionToCanvas,
  onClose,
}) => {
  const [tab, setTab] = useState<"source" | "symbols" | "runtime">(initialTab);
  const [zoom, setZoom] = useState<ZoomLevel>("L2");
  const [unfolded, setUnfolded] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [hoveredVar, setHoveredVar] = useState<{
    name: string;
    json: string;
    x: number;
    y: number;
  } | null>(null);

  const activeSlice =
    availableSlices.find((s) => s.slice_id === activeSliceId) ??
    availableSlices[0];
  const [hlStart, hlEnd] = currentFrame.source_anchor.highlight_lines;

  const renderLineTokens = (
    lineText: string,
    lineNumber: number,
    block: SourceBlock
  ) => {
    const commentIdx = lineText.indexOf("#");
    const codePart = commentIdx >= 0 ? lineText.slice(0, commentIdx) : lineText;
    const commentPart = commentIdx >= 0 ? lineText.slice(commentIdx) : "";
    const links = new Map(
      block.token_links
        .filter((t) => t.line === lineNumber)
        .map((l) => [l.col_start, l])
    );

    const out: React.ReactNode[] = [];
    const wordRegex = /[A-Za-z_][A-Za-z0-9_]*|'[^']*'|"[^"]*"|\S+|\s+/g;
    let m: RegExpExecArray | null;
    while ((m = wordRegex.exec(codePart)) !== null) {
      const tok = m[0];
      const sem = links.get(m.index);
      const key = `${lineNumber}_${m.index}`;
      if (sem) {
        const memField = HOVER_MEMORY_KEYS[tok];
        out.push(
          <span
            key={key}
            className={sem.inferred_local ? "tok-var" : "tok-class"}
            style={{ color: sem.inferred_local ? undefined : "var(--syn-fn)" }}
            title="点击派发该结构卡到思维画布"
            onClick={() => {
              onSproutSymbolToCanvas(sem.target_symbol);
              onClose();
            }}
            onMouseEnter={(e) => {
              if (zoom === "L3" && memField) {
                setHoveredVar({
                  name: tok,
                  json: JSON.stringify(
                    currentFrame.memory_snapshot[memField],
                    null,
                    2
                  ),
                  x: Math.max(20, e.clientX - 310),
                  y: Math.min(window.innerHeight - 210, e.clientY + 12),
                });
              }
            }}
            onMouseLeave={() => setHoveredVar(null)}
          >
            {tok}
          </span>
        );
      } else if (PY_KEYWORDS.has(tok)) {
        out.push(
          <span key={key} style={{ color: "var(--syn-kw)", fontWeight: 500 }}>
            {tok}
          </span>
        );
      } else if (tok.startsWith("'") || tok.startsWith('"')) {
        out.push(
          <span key={key} style={{ color: "var(--syn-str)" }}>
            {tok}
          </span>
        );
      } else {
        out.push(<span key={key}>{tok}</span>);
      }
    }
    if (commentPart) {
      out.push(
        <span key="c" style={{ color: "var(--syn-cmt)", fontStyle: "italic" }}>
          {commentPart}
        </span>
      );
    }
    return out;
  };

  const filteredSymbols = Object.values(symbols).filter(
    (s) =>
      !searchQuery.trim() ||
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.fields.some((f) => f.duty_cn.includes(searchQuery))
  );

  const mem = currentFrame.memory_snapshot;

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="scope-drawer" onClick={(e) => e.stopPropagation()}>
        {/* Drawer Header */}
        <div
          style={{
            padding: "12px 18px",
            borderBottom: "1px solid var(--border-soft)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
            background: "var(--bg-sheet)",
          }}
        >
          <div className="seg-control">
            {(
              [
                ["source", "完整源码文件 (L0–L3)"],
                ["symbols", "全部 19 个核心结构"],
                ["runtime", "全量内存快照 & 背景库"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                className={`seg-item ${tab === k ? "active" : ""}`}
                onClick={() => setTab(k)}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="ghost-icon-btn"
            onClick={onClose}
            aria-label="关闭探索抽屉"
          >
            <X size={16} strokeWidth={1.8} />
          </button>
        </div>

        {/* Tab 1: Full Multi-File Source Code Explorer */}
        {tab === "source" && (
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                padding: "8px 18px",
                borderBottom: "1px solid var(--border-soft)",
                background: "var(--bg-subtle)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", gap: 6, overflowX: "auto" }}>
                {availableSlices.map((sl) => {
                  const on = sl.slice_id === activeSlice.slice_id;
                  return (
                    <button
                      key={sl.slice_id}
                      type="button"
                      className="subtle-btn mono"
                      style={{
                        height: 26,
                        fontSize: 11.5,
                        background: on ? "var(--bg-card)" : "transparent",
                        borderColor: on
                          ? "var(--clay-border)"
                          : "var(--border-soft)",
                      }}
                      onClick={() => onSelectSlice(sl.slice_id)}
                    >
                      {sl.primary_file.split("/").pop()}
                    </button>
                  );
                })}
              </div>

              <div className="seg-control" style={{ height: 26, padding: 2 }}>
                {(
                  [
                    ["L0", "示例 L0"],
                    ["L1", "骨架 L1"],
                    ["L2", "精简 L2"],
                    ["L3", "全量 L3"],
                  ] as Array<[ZoomLevel, string]>
                ).map(([z, label]) => (
                  <button
                    key={z}
                    type="button"
                    className={`seg-item ${zoom === z ? "active" : ""}`}
                    style={{ height: 22, padding: "0 8px", fontSize: 11.2 }}
                    onClick={() => setZoom(z)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div
              style={{
                flex: 1,
                overflow: "auto",
                background: "var(--bg-code)",
                padding: zoom === "L0" || zoom === "L1" ? 18 : "8px 0 28px",
              }}
              onMouseUp={() => {
                const sel = window.getSelection()?.toString().trim() ?? "";
                if (sel.length >= 12 && sel.length <= 240) {
                  // Allow user to sprout selected code snippet if desired via button
                }
              }}
            >
              {zoom === "L0" ? (
                <div>
                  <pre
                    className="mono"
                    style={{
                      margin: "0 0 14px",
                      padding: 14,
                      borderRadius: 12,
                      background: "var(--bg-card)",
                      border: "1px solid var(--border-soft)",
                      fontSize: 12,
                      lineHeight: 1.65,
                      overflowX: "auto",
                    }}
                  >
                    {probe.l0_view.probe_code}
                  </pre>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 12,
                    }}
                  >
                    <pre
                      className="mono"
                      style={{
                        margin: 0,
                        padding: 12,
                        borderRadius: 10,
                        background: "var(--bg-card)",
                        border: "1px solid var(--border-soft)",
                        fontSize: 11.5,
                      }}
                    >
                      输入：{JSON.stringify(probe.l0_view.input_state, null, 2)}
                    </pre>
                    <pre
                      className="mono"
                      style={{
                        margin: 0,
                        padding: 12,
                        borderRadius: 10,
                        background: "var(--bg-card)",
                        border: "1px solid var(--border-medium)",
                        fontSize: 11.5,
                      }}
                    >
                      输出：{JSON.stringify(probe.l0_view.output_state, null, 2)}
                    </pre>
                  </div>
                </div>
              ) : zoom === "L1" ? (
                <pre
                  className="mono"
                  style={{
                    margin: 0,
                    padding: 16,
                    borderRadius: 12,
                    background: "var(--bg-card)",
                    border: "1px solid var(--border-soft)",
                    fontSize: 12,
                    lineHeight: 1.72,
                    overflowX: "auto",
                  }}
                >
                  {activeSlice.l1_skeleton_code}
                </pre>
              ) : (
                <>
                  {zoom === "L3" && (
                    <div
                      style={{
                        padding: "4px 18px 8px",
                        borderBottom: "1px solid var(--border-soft)",
                        fontSize: 11.8,
                        color: "var(--ink-muted)",
                      }}
                    >
                      全量源码模式 · 鼠标悬停在源码变量上可实时透视当前超步的内存真值；点击蓝色类名可将其派发到思维导图上。
                    </div>
                  )}
                  {activeSlice.blocks.map((block) => {
                    const isSameFile =
                      currentFrame.source_anchor.file === block.file_path;
                    const rows: React.ReactNode[] = [];
                    let idx = 0;
                    while (idx < block.lines.length) {
                      const ln = block.start_line + idx;
                      if (zoom === "L2") {
                        const fold = block.l2_folds.find(
                          (f) => f.start_line === ln
                        );
                        const fk = `${block.qualname}_${ln}`;
                        if (fold && !unfolded[fk]) {
                          rows.push(
                            <div
                              key={fk}
                              className="zed-fold-pill"
                              onClick={() =>
                                setUnfolded((p) => ({ ...p, [fk]: true }))
                              }
                            >
                              <ChevronRight size={12} color="var(--clay)" />
                              <span>
                                {fold.summary_label.replace(
                                  /^已折叠\s*/,
                                  "已为你收起 "
                                )}
                              </span>
                            </div>
                          );
                          idx += Math.max(
                            1,
                            fold.end_line - fold.start_line + 1
                          );
                          continue;
                        }
                      }
                      const isExec =
                        isSameFile && ln >= hlStart && ln <= hlEnd;
                      rows.push(
                        <div
                          key={ln}
                          className={`code-row ${isExec ? "exec-line" : ""}`}
                          style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}
                        >
                          <span className="gutter-num">{ln}</span>
                          <span style={{ whiteSpace: "pre" }}>
                            {renderLineTokens(block.lines[idx], ln, block)}
                          </span>
                        </div>
                      );
                      idx += 1;
                    }

                    return (
                      <div key={block.qualname} style={{ marginBottom: 14 }}>
                        <div
                          className="mono"
                          style={{
                            padding: "8px 18px 5px",
                            fontSize: 11.5,
                            fontWeight: 600,
                            color: "var(--ink)",
                            display: "flex",
                            justifyContent: "space-between",
                          }}
                        >
                          <span>{block.qualname}</span>
                          <button
                            type="button"
                            className="subtle-btn"
                            style={{ height: 22, fontSize: 11 }}
                            onClick={() => {
                              onSproutCodeQuestionToCanvas(
                                block.qualname,
                                block.file_path
                              );
                              onClose();
                            }}
                          >
                            针对此函数在导图追问 ↗
                          </button>
                        </div>
                        {rows}
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: All 19 Kernel Symbol Blueprints Directory */}
        {tab === "symbols" && (
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                padding: "10px 18px",
                borderBottom: "1px solid var(--border-soft)",
                background: "var(--bg-subtle)",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Search size={14} color="var(--ink-muted)" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索类名或中文职责（如 PregelNode、屏障、快照）…"
                style={{
                  flex: 1,
                  border: "none",
                  background: "transparent",
                  fontSize: 13,
                  color: "var(--ink)",
                  outline: "none",
                }}
              />
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: 18 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {filteredSymbols.map((sym) => (
                  <div
                    key={sym.symbol_id}
                    style={{
                      padding: "14px 16px",
                      borderRadius: 14,
                      background: "var(--bg-card)",
                      border: "1px solid var(--border-soft)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 8,
                      }}
                    >
                      <div>
                        <span
                          className="mono"
                          style={{ fontSize: 14, fontWeight: 600 }}
                        >
                          {sym.name}
                        </span>
                        <span
                          className="mono"
                          style={{
                            fontSize: 11,
                            color: "var(--ink-muted)",
                            marginLeft: 8,
                          }}
                        >
                          {sym.kind} · {sym.defined_in.file.replace("libs/langgraph/", "")}:
                          {sym.defined_in.start_line}
                        </span>
                      </div>

                      <button
                        type="button"
                        className="subtle-btn"
                        onClick={() => {
                          onSproutSymbolToCanvas(sym.symbol_id);
                          onClose();
                        }}
                      >
                        放到导图右侧 <ArrowUpRight size={12} />
                      </button>
                    </div>

                    {sym.fields.map((f) => (
                      <div key={f.name} className="kv-mini-row">
                        <span
                          className="mono"
                          style={{ fontSize: 11.5, fontWeight: 600 }}
                        >
                          {f.name}
                        </span>
                        <span
                          style={{
                            fontSize: 12,
                            color: "var(--ink-muted)",
                            marginLeft: 8,
                          }}
                        >
                          — {f.duty_cn}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Full Raw Memory Snapshot & All 12 Background Concepts */}
        {tab === "runtime" && (
          <div style={{ flex: 1, overflowY: "auto", padding: 18 }}>
            <div style={{ marginBottom: 20 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  marginBottom: 8,
                  color: "var(--ink)",
                }}
              >
                当前超步完整内存快照（Step #{currentFrame.superstep} ·{" "}
                {currentFrame.phase_label}）
              </div>
              <pre
                className="mono"
                style={{
                  margin: 0,
                  padding: 14,
                  borderRadius: 12,
                  background: "var(--bg-code)",
                  border: "1px solid var(--border-soft)",
                  fontSize: 11.4,
                  lineHeight: 1.6,
                  maxHeight: 280,
                  overflow: "auto",
                }}
              >
                {JSON.stringify(mem, null, 2)}
              </pre>
            </div>

            <div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  marginBottom: 10,
                  color: "var(--ink)",
                }}
              >
                全部 12 张背景知识小抄库（Python 语法 · Pregel 论文 · 底层契约）
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {Object.values(concepts).map((c) => (
                  <div
                    key={c.concept_id}
                    style={{
                      padding: "12px 14px",
                      borderRadius: 12,
                      background: "var(--bg-card)",
                      border: "1px solid var(--border-soft)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>
                        {c.title}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--ink-muted)",
                          marginTop: 3,
                        }}
                      >
                        {c.tier1_tldr}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="subtle-btn"
                      onClick={() => {
                        onSproutConceptToCanvas(c.concept_id);
                        onClose();
                      }}
                    >
                      展开到导图 <ArrowUpRight size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {hoveredVar && zoom === "L3" && (
          <div
            style={{
              position: "fixed",
              left: hoveredVar.x,
              top: hoveredVar.y,
              zIndex: 98,
              width: 290,
              maxHeight: 200,
              overflow: "auto",
              background: "var(--bg-card)",
              borderRadius: 12,
              padding: "10px 12px",
              boxShadow: "var(--shadow-popover)",
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--clay)",
                marginBottom: 4,
              }}
            >
              此刻内存真值 · {hoveredVar.name}
            </div>
            <pre className="mono" style={{ margin: 0, fontSize: 11 }}>
              {hoveredVar.json}
            </pre>
          </div>
        )}
      </aside>
    </div>
  );
};
