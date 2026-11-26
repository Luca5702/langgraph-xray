import React, { useEffect, useRef, useState } from "react";
import { Code2, Eye, FoldVertical, Layers, Sparkles } from "lucide-react";
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

  const firstHighlightRowRef = useRef<HTMLDivElement | null>(null);

  // Auto-switch slice if currentFrame's anchor file matches another slice in availableSlices
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
    if (firstHighlightRowRef.current && (zoomLevel === "L2" || zoomLevel === "L3")) {
      firstHighlightRowRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
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
            className={semLink.inferred_local ? "code-tok-local" : "code-tok-sym"}
            title={
              semLink.inferred_local
                ? `局部变量 ${tok} → 离线 Jedi 推导为 ${shortSym} (点击在手边展开)`
                : `核心类型 ${tok} (点击在手边展开静态契约)`
            }
            onClick={() =>
              onInspectSymbol(
                semLink.target_symbol,
                semLink.inferred_local
                  ? `局部变量 \`${tok}\` (${block.file_path.split("/").pop()}:L${lineNumber}) → 静态推导为 ${shortSym}`
                  : `类型定义 \`${tok}\` (${block.file_path.split("/").pop()}:L${lineNumber})`
              )
            }
            onMouseEnter={(e) => {
              if (zoomLevel === "L3" && memField) {
                setHoveredVar({
                  name: `${tok} (当前帧实时内存)`,
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
          <span key={key} style={{ color: "var(--syn-kw)", fontWeight: 500 }}>
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
        <span key="cmt" style={{ color: "var(--syn-cmt)", fontStyle: "italic" }}>
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
              className="fold-capsule-row"
              onClick={() => toggleFold(foldKey)}
              title="点击原地展开此段工程旁支代码"
            >
              <FoldVertical size={12} color="var(--accent-teal)" />
              <span>[+] {fold.summary_label}</span>
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
          className={`code-line-row ${isHighlighted ? "active-anchor" : ""}`}
        >
          <span className="line-num">{lineNum}</span>
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
    <section className="pane-col" aria-label="分层可观测源码视窗">
      {/* Header: Zoom Level Switcher */}
      <div className="pane-header" style={{ flexWrap: "wrap" }}>
        <div className="pane-title">
          <Code2 size={14} color="var(--accent-teal)" />
          <span>真实内核源码视窗</span>
        </div>

        <div className="segmented-group" role="tablist" aria-label="源码复杂度缩放层级">
          {(
            [
              ["L0", "L0 概念Diff"],
              ["L1", "L1 算法骨架"],
              ["L2", "L2 核心降噪"],
              ["L3", "L3 全量显微镜"],
            ] as Array<[ZoomLevel, string]>
          ).map(([lvl, label]) => (
            <button
              key={lvl}
              id={`zoom-btn-${lvl}`}
              type="button"
              className={`seg-btn ${zoomLevel === lvl ? "active" : ""}`}
              onClick={() => onChangeZoom(lvl)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Subbar: Kernel File Slice Tabs + Legend */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "5px 10px",
          background: "var(--bg-canvas)",
          borderBottom: "1px solid var(--border-subtle)",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {availableSlices.map((sl) => (
            <button
              key={sl.slice_id}
              type="button"
              className={`lens-btn ${sl.slice_id === activeSlice.slice_id ? "on" : ""}`}
              onClick={() => onSelectSlice(sl.slice_id)}
            >
              {sl.title}
            </button>
          ))}
        </div>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
          点 <span className="code-tok-sym">类名</span> 或{" "}
          <span className="code-tok-local">局部变量</span> 零跳转查结构
        </span>
      </div>

      {/* Main Code Body by ZoomLevel */}
      {zoomLevel === "L0" ? (
        <div className="pane-scroll" style={{ background: "var(--bg-code)" }}>
          <div style={{ marginBottom: 12 }}>
            <div
              style={{
                fontSize: 11.5,
                fontWeight: 600,
                color: "var(--accent-teal)",
                marginBottom: 6,
              }}
            >
              <Layers size={12} style={{ verticalAlign: "middle", marginRight: 4 }} />
              L0 概念视角：本关确定性 Python 探针图定义
            </div>
            <pre
              className="mono"
              style={{
                margin: 0,
                padding: 12,
                borderRadius: 6,
                background: "var(--bg-panel)",
                border: "1px solid var(--border-subtle)",
                overflowX: "auto",
                fontSize: 12,
                lineHeight: 1.6,
              }}
            >
              {probe.l0_view.probe_code}
            </pre>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
            }}
          >
            <div
              style={{
                padding: 10,
                borderRadius: 6,
                background: "var(--bg-panel)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
                执行前输入快照 (Input State)
              </div>
              <pre className="mono" style={{ margin: 0, fontSize: 11.5, overflowX: "auto" }}>
                {JSON.stringify(probe.l0_view.input_state, null, 2)}
              </pre>
            </div>
            <div
              style={{
                padding: 10,
                borderRadius: 6,
                background: "var(--bg-panel)",
                border: "1px solid var(--accent-emerald)",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: "var(--accent-emerald)",
                  fontWeight: 600,
                  marginBottom: 4,
                }}
              >
                执行后收敛状态 (Output State)
              </div>
              <pre className="mono" style={{ margin: 0, fontSize: 11.5, overflowX: "auto" }}>
                {JSON.stringify(probe.l0_view.output_state, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      ) : zoomLevel === "L1" ? (
        <div className="pane-scroll" style={{ background: "var(--bg-code)" }}>
          <div
            style={{
              fontSize: 11.5,
              color: "var(--accent-amber)",
              fontWeight: 600,
              marginBottom: 8,
            }}
          >
            L1 纯净算法骨架（剥离 70% 异步/回调/缓存工程胶水后的核心状态机灵魂）
          </div>
          <pre
            className="mono"
            style={{
              margin: 0,
              padding: 14,
              borderRadius: 6,
              background: "var(--bg-panel)",
              border: "1px solid var(--border-subtle)",
              fontSize: 12.2,
              lineHeight: 1.68,
              overflowX: "auto",
            }}
          >
            {activeSlice.l1_skeleton_code}
          </pre>
        </div>
      ) : (
        <div
          className="code-surface"
          onScroll={() => setCodeSelection(null)}
          onMouseUp={(e) => {
            const sel = window.getSelection()?.toString().trim() ?? "";
            if (sel.length >= 3 && sel.length <= 320) {
              setCodeSelection({
                x: Math.min(window.innerWidth - 260, Math.max(20, e.clientX - 50)),
                y: Math.max(54, e.clientY - 40),
                text: sel,
                fileRef: `${activeSlice.primary_file}`,
              });
            } else {
              setCodeSelection(null);
            }
          }}
        >
          {zoomLevel === "L3" && (
            <div
              style={{
                margin: "0 12px 8px",
                padding: "5px 10px",
                borderRadius: 5,
                background: "var(--accent-teal-soft)",
                color: "var(--accent-teal)",
                fontSize: 11.5,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Eye size={13} />
              <span>
                L3 显微镜已开启：已展开全部折叠块，鼠标悬停在源码中的{" "}
                <code>checkpoint</code> / <code>channels</code> / <code>tasks</code> /{" "}
                <code>scratchpad</code> 上即可透视当前帧内存。
              </span>
            </div>
          )}

          {activeSlice.blocks.map((block) => (
            <div key={block.qualname}>
              <div className="code-block-divider">
                <span className="mono" style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                  {block.qualname}
                </span>
                <span className="mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  {block.file_path} · L{block.start_line}-L{block.end_line}
                </span>
              </div>
              {renderBlockLines(block)}
            </div>
          ))}
        </div>
      )}

      {/* L3 Hover Live Memory Microscope Tooltip */}
      {hoveredVar && zoomLevel === "L3" && (
        <div
          style={{
            position: "fixed",
            left: hoveredVar.x,
            top: hoveredVar.y,
            zIndex: 90,
            width: 300,
            maxHeight: 210,
            overflow: "auto",
            background: "var(--bg-panel)",
            border: "1px solid var(--accent-teal)",
            borderRadius: 6,
            padding: 9,
            boxShadow: "var(--shadow-float)",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--accent-teal)",
              marginBottom: 4,
            }}
          >
            🔬 {hoveredVar.name}
          </div>
          <pre className="mono" style={{ margin: 0, fontSize: 11 }}>
            {hoveredVar.valueJson}
          </pre>
        </div>
      )}

      {/* Code Selection Sprout Floating Pill */}
      {codeSelection && (
        <div
          className="selection-floating-bar"
          style={{ left: codeSelection.x, top: codeSelection.y }}
        >
          <button
            type="button"
            className="seg-btn active"
            onClick={() => {
              const { text, fileRef } = codeSelection;
              setCodeSelection(null);
              window.getSelection()?.removeAllRanges();
              onSproutFromCode(text, fileRef);
            }}
          >
            <Sparkles size={12} />
            🌱 锚定选中源码推入画布追问
          </button>
        </div>
      )}
    </section>
  );
};
