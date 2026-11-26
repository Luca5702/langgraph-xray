import React, { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { ZoomLevel } from "@langgraph-xray/schema";
import type {
  ProbeBundle,
  SourceBlock,
  SourceSlice,
  TraceFrame,
} from "../types/bundle";

interface SourceXRayPaneProps {
  availableSlices: SourceSlice[];
  activeSliceId: string;
  onSelectSlice: (sliceId: string) => void;
  zoomLevel: ZoomLevel;
  onChangeZoom: (z: ZoomLevel) => void;
  probe: ProbeBundle;
  currentFrame: TraceFrame & { phase_label?: string };
  onInspectSymbol: (symbolId: string, provenance?: string) => void;
  onSproutFromCode: (selectedCode: string, targetRef: string) => void;
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

function shortTabName(slice: SourceSlice): string {
  const base = slice.primary_file.split("/").pop() ?? slice.slice_id;
  if (slice.slice_id === "channels_core") return "channels/*.py";
  if (slice.slice_id === "send_command_write") return "types.py & _write.py";
  if (slice.slice_id === "interrupt_scratchpad") return "interrupt()";
  if (slice.slice_id === "checkpoint_saver") return "checkpoint/base.py";
  return base;
}

export const SourceXRayPane: React.FC<SourceXRayPaneProps> = ({
  availableSlices,
  activeSliceId,
  onSelectSlice,
  zoomLevel,
  onChangeZoom,
  probe,
  currentFrame,
  onInspectSymbol,
  onSproutFromCode,
}) => {
  const activeSlice =
    availableSlices.find((s) => s.slice_id === activeSliceId) ?? availableSlices[0];

  const [unfoldedKeys, setUnfoldedKeys] = useState<Record<string, boolean>>({});
  const [hoveredVar, setHoveredVar] = useState<{
    name: string;
    valueJson: string;
    x: number;
    y: number;
  } | null>(null);
  const [codeSelection, setCodeSelection] = useState<{
    x: number;
    y: number;
    text: string;
    fileRef: string;
  } | null>(null);

  const codeViewportRef = useRef<HTMLDivElement | null>(null);
  const firstHighlightRowRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const targetFile = currentFrame.source_anchor.file;
    const matchingSlice = availableSlices.find((sl) =>
      sl.blocks.some(
        (b) =>
          b.file_path === targetFile &&
          currentFrame.source_anchor.highlight_lines[0] >= b.start_line &&
          currentFrame.source_anchor.highlight_lines[0] <= b.end_line
      )
    );
    if (matchingSlice && matchingSlice.slice_id !== activeSliceId) {
      onSelectSlice(matchingSlice.slice_id);
    }
  }, [currentFrame, availableSlices, activeSliceId, onSelectSlice]);

  useEffect(() => {
    const container = codeViewportRef.current;
    const row = firstHighlightRowRef.current;
    if (container && row && (zoomLevel === "L2" || zoomLevel === "L3")) {
      const targetTop = Math.max(0, row.offsetTop - container.clientHeight * 0.22);
      container.scrollTo({ top: targetTop, behavior: "auto" });
    }
  }, [currentFrame.frame_id, activeSliceId, zoomLevel]);

  const toggleFold = (key: string) => {
    setUnfoldedKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const renderTokenizedLine = (
    lineText: string,
    lineNumber: number,
    block: SourceBlock
  ) => {
    const commentIdx = lineText.indexOf("#");
    const codePart = commentIdx >= 0 ? lineText.slice(0, commentIdx) : lineText;
    const commentPart = commentIdx >= 0 ? lineText.slice(commentIdx) : "";

    const lineLinks = block.token_links.filter((t) => t.line === lineNumber);
    const linkByCol = new Map(lineLinks.map((l) => [l.col_start, l]));

    const segments: React.ReactNode[] = [];
    const wordRegex = /[A-Za-z_][A-Za-z0-9_]*|'[^']*'|"[^"]*"|\S+|\s+/g;
    let m: RegExpExecArray | null;

    while ((m = wordRegex.exec(codePart)) !== null) {
      const tok = m[0];
      const col = m.index;
      const semLink = linkByCol.get(col);
      const key = `${lineNumber}_${col}`;

      if (semLink) {
        const shortSym = semLink.target_symbol.split(".").pop() ?? semLink.target_symbol;
        const memField = HOVER_MEMORY_KEYS[tok];
        segments.push(
          <span
            key={key}
            className={semLink.inferred_local ? "tok-var" : "tok-class"}
            style={{ color: semLink.inferred_local ? undefined : "var(--syn-fn)" }}
            title={
              semLink.inferred_local
                ? `${tok} → ${shortSym} (Jedi inferred)`
                : `${tok} · Static Blueprint`
            }
            onClick={() =>
              onInspectSymbol(
                semLink.target_symbol,
                semLink.inferred_local
                  ? `${tok} → ${shortSym} · ${block.file_path.split("/").pop()}:${lineNumber}`
                  : `${tok} · ${block.file_path.split("/").pop()}:${lineNumber}`
              )
            }
            onMouseEnter={(e) => {
              if (zoomLevel === "L3" && memField) {
                setHoveredVar({
                  name: tok,
                  valueJson: JSON.stringify(
                    currentFrame.memory_snapshot[memField],
                    null,
                    2
                  ),
                  x: Math.min(window.innerWidth - 320, e.clientX + 12),
                  y: Math.min(window.innerHeight - 220, e.clientY + 12),
                });
              }
            }}
            onMouseLeave={() => setHoveredVar(null)}
          >
            {tok}
          </span>
        );
      } else if (PY_KEYWORDS.has(tok)) {
        segments.push(
          <span key={key} style={{ color: "var(--syn-kw)" }}>
            {tok}
          </span>
        );
      } else if (tok.startsWith("'") || tok.startsWith('"')) {
        segments.push(
          <span key={key} style={{ color: "var(--syn-str)" }}>
            {tok}
          </span>
        );
      } else {
        segments.push(<span key={key}>{tok}</span>);
      }
    }

    if (commentPart) {
      segments.push(
        <span key="cmt" style={{ color: "var(--syn-cmt)" }}>
          {commentPart}
        </span>
      );
    }

    return segments;
  };

  const renderBlockLines = (block: SourceBlock) => {
    const rows: React.ReactNode[] = [];
    const [hlStart, hlEnd] = currentFrame.source_anchor.highlight_lines;
    const isSameFile = currentFrame.source_anchor.file === block.file_path;
    let assignedScrollRef = false;

    let idx = 0;
    while (idx < block.lines.length) {
      const lineNum = block.start_line + idx;

      if (zoomLevel === "L2") {
        const fold = block.l2_folds.find((f) => f.start_line === lineNum);
        const foldKey = `${block.qualname}_${lineNum}`;
        if (fold && !unfoldedKeys[foldKey]) {
          rows.push(
            <div
              key={`fold_${foldKey}`}
              className="zed-fold-pill"
              onClick={() => toggleFold(foldKey)}
              title="点击展开折叠的工程胶水代码"
            >
              <ChevronRight size={12} strokeWidth={1.6} />
              <span>{fold.summary_label}</span>
            </div>
          );
          idx += Math.max(1, fold.end_line - fold.start_line + 1);
          continue;
        }
      }

      const isHighlighted = isSameFile && lineNum >= hlStart && lineNum <= hlEnd;
      const attachRef = isHighlighted && !assignedScrollRef;
      if (attachRef) assignedScrollRef = true;

      rows.push(
        <div
          key={lineNum}
          ref={attachRef ? firstHighlightRowRef : undefined}
          className={`code-row ${isHighlighted ? "exec-line" : ""}`}
        >
          <span className="gutter-num">{lineNum}</span>
          <span style={{ whiteSpace: "pre", userSelect: "text" }}>
            {renderTokenizedLine(block.lines[idx], lineNum, block)}
          </span>
        </div>
      );
      idx += 1;
    }

    return rows;
  };

  return (
    <section className="pane-col" aria-label="真实内核源码视窗">
      {/* Unified 36px Zed-Style Editor Tab + Zoom Bar */}
      <div className="col-bar" style={{ paddingLeft: 6 }}>
        <div className="editor-tabs" role="tablist">
          {availableSlices.map((sl) => (
            <button
              key={sl.slice_id}
              type="button"
              role="tab"
              aria-selected={sl.slice_id === activeSlice.slice_id}
              className={`editor-tab mono ${
                sl.slice_id === activeSlice.slice_id ? "active" : ""
              }`}
              onClick={() => onSelectSlice(sl.slice_id)}
              title={sl.title}
            >
              {shortTabName(sl)}
            </button>
          ))}
        </div>

        <div className="seg-control" style={{ height: 24 }} role="tablist">
          {(
            [
              ["L0", "L0"],
              ["L1", "L1"],
              ["L2", "L2"],
              ["L3", "L3"],
            ] as Array<[ZoomLevel, string]>
          ).map(([lvl, label]) => (
            <button
              key={lvl}
              id={`zoom-btn-${lvl}`}
              type="button"
              title={
                lvl === "L0"
                  ? "L0 业务探针与前后 State Diff"
                  : lvl === "L1"
                    ? "L1 纯净核心算法骨架"
                    : lvl === "L2"
                      ? "L2 真实源码 + 工程胶水自动折叠 (推荐)"
                      : "L3 100% 全量源码 + 变量悬停内存显微镜"
              }
              className={`seg-item mono ${zoomLevel === lvl ? "active" : ""}`}
              style={{ height: 18, padding: "0 7px", fontSize: 11 }}
              onClick={() => onChangeZoom(lvl)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {zoomLevel === "L0" ? (
        <div className="pane-scroll" style={{ background: "var(--bg-code)", padding: 20 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            L0 · DETERMINISTIC PROBE GRAPH
          </div>
          <pre
            className="mono"
            style={{
              margin: "0 0 20px",
              padding: "14px 16px",
              borderRadius: 8,
              background: "var(--bg-panel)",
              border: "1px solid var(--hairline)",
              overflowX: "auto",
              fontSize: 12,
              lineHeight: 1.65,
              color: "var(--ink)",
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
            <div
              style={{
                padding: "12px 14px",
                borderRadius: 8,
                background: "var(--bg-panel)",
                border: "1px solid var(--hairline)",
              }}
            >
              <div className="eyebrow" style={{ marginBottom: 6 }}>
                INPUT STATE
              </div>
              <pre
                className="mono"
                style={{
                  margin: 0,
                  fontSize: 11.5,
                  color: "var(--ink-secondary)",
                  overflowX: "auto",
                }}
              >
                {JSON.stringify(probe.l0_view.input_state, null, 2)}
              </pre>
            </div>
            <div
              style={{
                padding: "12px 14px",
                borderRadius: 8,
                background: "var(--bg-panel)",
                border: "1px solid var(--hairline-strong)",
              }}
            >
              <div
                className="eyebrow"
                style={{ marginBottom: 6, color: "var(--sig-green)" }}
              >
                CONVERGED OUTPUT
              </div>
              <pre
                className="mono"
                style={{
                  margin: 0,
                  fontSize: 11.5,
                  color: "var(--ink)",
                  overflowX: "auto",
                }}
              >
                {JSON.stringify(probe.l0_view.output_state, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      ) : zoomLevel === "L1" ? (
        <div className="pane-scroll" style={{ background: "var(--bg-code)", padding: 20 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            L1 · DISTILLED ALGORITHMIC SKELETON
          </div>
          <pre
            className="mono"
            style={{
              margin: 0,
              padding: "16px 18px",
              borderRadius: 8,
              background: "var(--bg-panel)",
              border: "1px solid var(--hairline)",
              fontSize: 12.2,
              lineHeight: 1.72,
              color: "var(--ink)",
              overflowX: "auto",
            }}
          >
            {activeSlice.l1_skeleton_code}
          </pre>
        </div>
      ) : (
        <div
          ref={codeViewportRef}
          className="code-viewport"
          onScroll={() => setCodeSelection(null)}
          onMouseUp={(e) => {
            const sel = window.getSelection()?.toString().trim() ?? "";
            if (sel.length >= 3 && sel.length <= 320) {
              setCodeSelection({
                x: Math.min(window.innerWidth - 220, Math.max(20, e.clientX - 50)),
                y: Math.max(54, e.clientY - 40),
                text: sel,
                fileRef: activeSlice.primary_file,
              });
            } else {
              setCodeSelection(null);
            }
          }}
        >
          {zoomLevel === "L3" && (
            <div
              style={{
                padding: "4px 16px 8px",
                borderBottom: "1px solid var(--hairline)",
                marginBottom: 4,
                fontSize: 11,
                color: "var(--ink-muted)",
              }}
            >
              L3 Unfolded · 悬停源码中的变量标识符可实时检视当前超步内存快照
            </div>
          )}

          {activeSlice.blocks.map((block) => (
            <div key={block.qualname}>
              <div className="symbol-scope-header mono">
                <span style={{ color: "var(--ink)", fontWeight: 500 }}>
                  {block.qualname}
                </span>
                <span style={{ color: "var(--ink-faint)" }}>
                  {block.file_path.replace("libs/langgraph/", "")}:{block.start_line}–
                  {block.end_line}
                </span>
              </div>
              {renderBlockLines(block)}
            </div>
          ))}
        </div>
      )}

      {hoveredVar && zoomLevel === "L3" && (
        <div
          style={{
            position: "fixed",
            left: hoveredVar.x,
            top: hoveredVar.y,
            zIndex: 95,
            width: 300,
            maxHeight: 210,
            overflow: "auto",
            background: "var(--bg-popover)",
            borderRadius: 8,
            padding: "10px 12px",
            boxShadow: "var(--shadow-popover)",
            pointerEvents: "none",
          }}
        >
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            LIVE MEMORY · {hoveredVar.name}
          </div>
          <pre className="mono" style={{ margin: 0, fontSize: 11, color: "var(--ink)" }}>
            {hoveredVar.valueJson}
          </pre>
        </div>
      )}

      {codeSelection && (
        <div
          className="selection-pill"
          style={{ left: codeSelection.x, top: codeSelection.y }}
        >
          <button
            type="button"
            className="primary-cta"
            onClick={() => {
              const { text, fileRef } = codeSelection;
              setCodeSelection(null);
              window.getSelection()?.removeAllRanges();
              onSproutFromCode(text, fileRef);
            }}
          >
            锚定代码推入画布追问 ↗
          </button>
        </div>
      )}
    </section>
  );
};
