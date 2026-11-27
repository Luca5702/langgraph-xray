import React, { useState } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import {
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CornerDownRight,
  HelpCircle,
  Maximize2,
  Play,
  Plus,
  Sparkles,
  ThumbsUp,
  X,
} from "lucide-react";
import type {
  ChapterCurriculum,
  ConceptCardConfig,
  ExtendedGraphNode,
  KnowledgeLens,
  ProbeBundle,
  SourceBlock,
  SourceSlice,
  SuggestedSpark,
  SymbolBlueprint,
  TraceFrame,
} from "../types/bundle";
import { InlineMarkdown } from "./InlineMarkdown";

declare global {
  interface Window {
    loadPyodide?: (cfg: { indexURL: string }) => Promise<{
      runPythonAsync: (code: string) => Promise<unknown>;
      setStdout: (opts: { batched: (msg: string) => void }) => void;
    }>;
    __pyodideInstance?: {
      runPythonAsync: (code: string) => Promise<unknown>;
      setStdout: (opts: { batched: (msg: string) => void }) => void;
    };
  }
}

const TOKEN_REGEX = /\[\[(sym|concept):([^|\]]+)\|([^\]]+)\]\]/g;

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

function formatChapterLabel(num: string): string {
  const n = num.replace(/[^0-9]/g, "");
  return `第 ${Number(n) || 1} 关`;
}

function shortSliceName(slice: SourceSlice): string {
  const base = slice.primary_file.split("/").pop() ?? slice.slice_id;
  if (slice.slice_id === "channels_core") return "channels/*.py";
  if (slice.slice_id === "send_command_write") return "types & _write";
  if (slice.slice_id === "interrupt_scratchpad") return "interrupt()";
  if (slice.slice_id === "checkpoint_saver") return "checkpoint.py";
  return base;
}

/* ============================================================================
   1. LEVEL 0: CHAPTER ROOT NODE
   ============================================================================ */

export interface ChapterRootData extends Record<string, unknown> {
  chapter: ChapterCurriculum;
  l0Open: boolean;
  allSectionsExpanded: boolean;
  onToggleL0: () => void;
  onToggleExpandAllSections: () => void;
}

export const ChapterRootNode: React.FC<NodeProps<Node<ChapterRootData>>> = ({
  data,
}) => {
  const {
    chapter,
    l0Open,
    allSectionsExpanded,
    onToggleL0,
    onToggleExpandAllSections,
  } = data;

  return (
    <div className="mm-root-card">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span className="chapter-num-badge">
          {formatChapterLabel(chapter.number)} · 核心主干
        </span>
        <button
          type="button"
          className="nodrag"
          onClick={onToggleExpandAllSections}
          style={{
            border: "none",
            background: "transparent",
            padding: 0,
            fontSize: 11.2,
            color: "var(--ink-muted)",
            cursor: "pointer",
          }}
        >
          {allSectionsExpanded ? "仅聚焦当前脉络" : "展开全部脉络"}
        </button>
      </div>

      <h2 className="mm-root-title">{chapter.title}</h2>

      <div className="mm-question-box">
        <div
          style={{
            fontSize: 11.2,
            fontWeight: 600,
            color: "var(--clay)",
            marginBottom: 3,
          }}
        >
          本关一起搞懂这个问题
        </div>
        {chapter.core_question}
      </div>

      <div className="mm-bud-row nodrag" style={{ marginTop: 11, paddingTop: 9 }}>
        <button
          type="button"
          className={`mm-bud ${l0Open ? "open" : ""}`}
          onClick={onToggleL0}
        >
          <span style={{ color: "var(--clay)", fontWeight: 700 }}>
            {l0Open ? "✓" : "+"}
          </span>
          <span>业务探针小例子与输入输出 (L0)</span>
        </button>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="mm-handle active"
      />
    </div>
  );
};

/* ============================================================================
   2. LEVEL 1: SPINE SECTION NODE (Focused Card vs Calm Collapsed Pill)
   ============================================================================ */

export interface SpineSectionData extends Record<string, unknown> {
  chapter: ChapterCurriculum;
  sectionIndex: number;
  section: ChapterCurriculum["sections"][number];
  collapsed: boolean;
  isActiveStepSection: boolean;
  concepts: Record<string, ConceptCardConfig>;
  activeLenses: KnowledgeLens[];
  curatedInsights: ExtendedGraphNode[];
  openLeafIds: Set<string>;
  isSprouting: boolean;
  onToggleSection: (blockId: string) => void;
  onSproutSymbol: (symId: string, parentNodeId: string) => void;
  onSproutConcept: (conceptId: string, parentNodeId: string) => void;
  onToggleInsightLeaf: (insightId: string, parentNodeId: string) => void;
  onAskAiFromNode: (
    parentNodeId: string,
    question: string,
    contextText: string,
    targetRef: string
  ) => Promise<void>;
}

export const SpineSectionNode: React.FC<NodeProps<Node<SpineSectionData>>> = ({
  id,
  data,
}) => {
  const {
    chapter,
    section,
    collapsed,
    isActiveStepSection,
    concepts,
    activeLenses,
    curatedInsights,
    openLeafIds,
    isSprouting,
    onToggleSection,
    onSproutSymbol,
    onSproutConcept,
    onToggleInsightLeaf,
    onAskAiFromNode,
  } = data;

  const [qaOpen, setQaOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [questionText, setQuestionText] = useState("");

  if (collapsed) {
    return (
      <div
        className="mm-spine-pill nodrag"
        onClick={() => onToggleSection(section.block_id)}
        title="点击展开这一节的伴读讲义与代码脉络"
      >
        <Handle type="target" position={Position.Left} className="mm-handle" />
        <span
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: 13.5,
            fontWeight: 600,
            color: "var(--ink-body)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {section.heading}
        </span>
        <span
          className="chapter-num-badge"
          style={{ flexShrink: 0, fontSize: 11 }}
        >
          展开 ⊕
        </span>
        <Handle type="source" position={Position.Right} className="mm-handle" />
      </div>
    );
  }

  const renderRichParagraph = (text: string, pIdx: number) => {
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    const regex = new RegExp(TOKEN_REGEX.source, "g");

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(
          <InlineMarkdown
            key={`t_${pIdx}_${lastIndex}`}
            text={text.slice(lastIndex, match.index)}
          />
        );
      }
      const [, kind, targetId, label] = match;
      const key = `tok_${pIdx}_${match.index}`;

      if (kind === "sym") {
        parts.push(
          <span
            key={key}
            className="sym-token nodrag"
            title="点击向右生长出该对象的结构卡片"
            onClick={() => onSproutSymbol(targetId, id)}
          >
            {label}
          </span>
        );
      } else {
        const card = concepts[targetId];
        const visible = card ? activeLenses.includes(card.lens) : false;
        if (!visible) {
          parts.push(<span key={key}>{label}</span>);
        } else {
          const sup =
            card.lens === "pregel_paper"
              ? "论文"
              : card.lens === "python_syntax"
                ? "语法"
                : "契约";
          parts.push(
            <span
              key={key}
              className="concept-token nodrag"
              title="点击向右展开通俗背景小抄与试跑沙盒"
              onClick={() => onSproutConcept(targetId, id)}
            >
              {label}
              <sup className="concept-sup">{sup}</sup>
            </span>
          );
        }
      }
      lastIndex = regex.lastIndex;
    }

    if (lastIndex < text.length) {
      parts.push(
        <InlineMarkdown
          key={`tail_${pIdx}_${lastIndex}`}
          text={text.slice(lastIndex)}
        />
      );
    }
    return parts;
  };

  const handleSubmitQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!questionText.trim()) return;
    const q = questionText.trim();
    setQuestionText("");
    setComposerOpen(false);
    await onAskAiFromNode(
      id,
      q,
      section.heading,
      `${chapter.chapter_id}#${section.block_id}`
    );
  };

  return (
    <div className={`mm-spine-card ${isActiveStepSection ? "focused" : ""}`}>
      <Handle
        type="target"
        position={Position.Left}
        className={`mm-handle ${isActiveStepSection ? "active" : ""}`}
      />

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 8,
          marginBottom: 10,
        }}
      >
        <h3 className="mm-spine-heading">{section.heading}</h3>
        <button
          type="button"
          className="nodrag"
          onClick={() => onToggleSection(section.block_id)}
          title="收起本节卡片"
          style={{
            border: "none",
            background: "var(--bg-subtle)",
            borderRadius: 99,
            padding: "2px 8px",
            fontSize: 11,
            color: "var(--ink-muted)",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          收起 ⊖
        </button>
      </div>

      <div className="nodrag" style={{ userSelect: "text" }}>
        {section.paragraphs.map((p, idx) => (
          <p key={idx} className="mm-prose-p">
            {renderRichParagraph(p, idx)}
          </p>
        ))}
      </div>

      {section.margin_note && (
        <div
          className="nodrag"
          style={{
            marginTop: 8,
            padding: "8px 11px",
            borderRadius: 10,
            background: "var(--bg-subtle)",
            border: "1px solid var(--border-soft)",
          }}
        >
          <button
            type="button"
            onClick={() => setQaOpen((o) => !o)}
            style={{
              width: "100%",
              border: "none",
              background: "transparent",
              padding: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 6,
              textAlign: "left",
              fontSize: 12,
              fontWeight: 500,
              color: "var(--ink-body)",
              cursor: "pointer",
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <HelpCircle
                size={13}
                strokeWidth={1.8}
                color="var(--clay)"
                style={{ flexShrink: 0 }}
              />
              <span>常见疑问：{section.margin_note.q}</span>
            </span>
            {qaOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
          {qaOpen && (
            <div
              style={{
                marginTop: 7,
                paddingTop: 7,
                borderTop: "1px dashed var(--border-medium)",
                fontSize: 12.2,
                lineHeight: 1.65,
                color: "var(--ink-body)",
              }}
            >
              {section.margin_note.a}
            </div>
          )}
        </div>
      )}

      {/* Mind-Map Curiosity Spark Buds */}
      <div className="mm-bud-row nodrag">
        {curatedInsights.map((ins) => {
          const isOpen = openLeafIds.has(ins.id);
          return (
            <button
              key={ins.id}
              type="button"
              className={`mm-bud ${isOpen ? "open" : ""}`}
              onClick={() => onToggleInsightLeaf(ins.id, id)}
              title="点击在右侧展开这张深度思考卡"
            >
              <span style={{ color: "var(--clay)", fontWeight: 700 }}>
                {isOpen ? "✓" : "+"}
              </span>
              <span>{ins.title}</span>
            </button>
          );
        })}

        <button
          type="button"
          className={`mm-bud ${composerOpen ? "open" : ""}`}
          onClick={() => setComposerOpen((o) => !o)}
        >
          <Sparkles size={12} strokeWidth={1.8} color="var(--clay)" />
          <span>{isSprouting ? "正在生长新卡片…" : "自由追问 AI…"}</span>
        </button>
      </div>

      {composerOpen && (
        <form
          onSubmit={handleSubmitQuestion}
          className="nodrag"
          style={{
            marginTop: 10,
            padding: 10,
            borderRadius: 10,
            background: "var(--bg-subtle)",
            border: "1px solid var(--border-medium)",
          }}
        >
          <textarea
            value={questionText}
            onChange={(e) => setQuestionText(e.target.value)}
            placeholder="写下你的好奇或疑惑，直接向右长出一张新思考卡片…"
            rows={2}
            style={{
              width: "100%",
              border: "1px solid var(--border-soft)",
              borderRadius: 8,
              padding: "7px 9px",
              fontSize: 12.2,
              background: "var(--bg-card)",
              color: "var(--ink)",
              resize: "none",
              outline: "none",
            }}
          />
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 6,
              marginTop: 6,
            }}
          >
            <button
              type="button"
              className="subtle-btn"
              style={{ height: 26, fontSize: 11.5 }}
              onClick={() => setComposerOpen(false)}
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isSprouting}
              className="primary-cta"
              style={{ height: 26, fontSize: 11.5, padding: "0 11px" }}
            >
              <Plus size={12} strokeWidth={2} />
              向右生长卡片
            </button>
          </div>
        </form>
      )}

      <Handle
        type="source"
        position={Position.Right}
        className={`mm-handle ${isActiveStepSection ? "active" : ""}`}
      />
    </div>
  );
};

/* ============================================================================
   3. LEVEL 2A: LIVING FOCUSED CODE SLICE NODE (Haystack Style)
   ============================================================================ */

export interface CodeSliceNodeData extends Record<string, unknown> {
  availableSlices: SourceSlice[];
  activeSliceId: string;
  currentFrame: TraceFrame & { phase_label?: string };
  extraLinesRadius: number;
  onSelectSlice: (sliceId: string) => void;
  onExpandRadius: (delta: number) => void;
  onSproutSymbol: (symId: string, parentNodeId: string) => void;
  onOpenFullSourceDrawer: () => void;
}

export const CodeSliceNode: React.FC<NodeProps<Node<CodeSliceNodeData>>> = ({
  id,
  data,
}) => {
  const {
    availableSlices,
    activeSliceId,
    currentFrame,
    extraLinesRadius,
    onSelectSlice,
    onExpandRadius,
    onSproutSymbol,
    onOpenFullSourceDrawer,
  } = data;

  const [mode, setMode] = useState<"slice" | "skeleton">("slice");

  const activeSlice =
    availableSlices.find((s) => s.slice_id === activeSliceId) ??
    availableSlices[0];

  const [hlStart, hlEnd] = currentFrame.source_anchor.highlight_lines;
  const targetBlock: SourceBlock =
    activeSlice.blocks.find(
      (b) =>
        b.file_path === currentFrame.source_anchor.file &&
        hlStart >= b.start_line &&
        hlStart <= b.end_line
    ) ?? activeSlice.blocks[0];

  const isSameFile = targetBlock.file_path === currentFrame.source_anchor.file;
  const centerLine = isSameFile
    ? Math.floor((hlStart + hlEnd) / 2)
    : targetBlock.start_line + 7;

  const halfWindow = 7 + extraLinesRadius;
  const winStartLine = Math.max(
    targetBlock.start_line,
    centerLine - halfWindow
  );
  const winEndLine = Math.min(targetBlock.end_line, centerLine + halfWindow);

  const canExpandUp = winStartLine > targetBlock.start_line;
  const canExpandDown = winEndLine < targetBlock.end_line;

  const renderTokenizedLine = (lineText: string, lineNumber: number) => {
    const commentIdx = lineText.indexOf("#");
    const codePart = commentIdx >= 0 ? lineText.slice(0, commentIdx) : lineText;
    const commentPart = commentIdx >= 0 ? lineText.slice(commentIdx) : "";

    const lineLinks = targetBlock.token_links.filter(
      (t) => t.line === lineNumber
    );
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
        const shortSym =
          semLink.target_symbol.split(".").pop() ?? semLink.target_symbol;
        segments.push(
          <span
            key={key}
            className={`${semLink.inferred_local ? "tok-var" : "tok-class"} nodrag`}
            style={{ color: semLink.inferred_local ? undefined : "var(--syn-fn)" }}
            title={`点击向右生长出 ${shortSym} 结构卡片`}
            onClick={() => onSproutSymbol(semLink.target_symbol, id)}
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

  const renderFocusedRows = () => {
    const rows: React.ReactNode[] = [];
    let lineNum = winStartLine;
    while (lineNum <= winEndLine) {
      const fold = targetBlock.l2_folds.find(
        (f) => f.start_line <= lineNum && f.end_line >= lineNum
      );
      if (fold && !(isSameFile && hlStart >= fold.start_line && hlStart <= fold.end_line)) {
        rows.push(
          <div
            key={`fold_${fold.start_line}`}
            style={{
              padding: "2px 14px 2px 44px",
              fontSize: 11,
              color: "var(--ink-muted)",
              fontFamily: "var(--font-sans)",
            }}
          >
            ▸ {fold.summary_label.replace(/^已折叠\s*/, "已省略 ")}
          </div>
        );
        lineNum = fold.end_line + 1;
        continue;
      }

      const arrIdx = lineNum - targetBlock.start_line;
      const text = targetBlock.lines[arrIdx] ?? "";
      const isExec = isSameFile && lineNum >= hlStart && lineNum <= hlEnd;

      rows.push(
        <div key={lineNum} className={`code-row ${isExec ? "exec-line" : ""}`}>
          <span className="gutter-num">{lineNum}</span>
          <span style={{ whiteSpace: "pre", userSelect: "text" }}>
            {renderTokenizedLine(text, lineNum)}
          </span>
        </div>
      );
      lineNum += 1;
    }
    return rows;
  };

  return (
    <div className="mm-code-card">
      <Handle
        type="target"
        position={Position.Left}
        className="mm-handle active"
      />

      <div className="mm-card-bar nodrag">
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {availableSlices.map((sl) => {
            const active = sl.slice_id === activeSlice.slice_id;
            return (
              <button
                key={sl.slice_id}
                type="button"
                onClick={() => onSelectSlice(sl.slice_id)}
                className="mono"
                style={{
                  border: "none",
                  borderRadius: 7,
                  padding: "3px 8px",
                  fontSize: 11.3,
                  fontWeight: active ? 600 : 500,
                  background: active ? "var(--bg-sand)" : "transparent",
                  color: active ? "var(--ink)" : "var(--ink-muted)",
                  cursor: "pointer",
                }}
              >
                {shortSliceName(sl)}
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div className="seg-control" style={{ height: 24, padding: 2 }}>
            <button
              type="button"
              className={`seg-item ${mode === "slice" ? "active" : ""}`}
              style={{ height: 20, padding: "0 8px", fontSize: 11 }}
              onClick={() => setMode("slice")}
            >
              聚焦切片
            </button>
            <button
              type="button"
              className={`seg-item ${mode === "skeleton" ? "active" : ""}`}
              style={{ height: 20, padding: "0 8px", fontSize: 11 }}
              onClick={() => setMode("skeleton")}
            >
              算法骨架
            </button>
          </div>

          <button
            type="button"
            className="subtle-btn"
            style={{ height: 24, padding: "0 8px", fontSize: 11 }}
            onClick={onOpenFullSourceDrawer}
            title="打开右侧完整源码文件抽屉（支持 L0–L3 与变量内存悬停）"
          >
            全览
            <Maximize2 size={11} strokeWidth={1.8} />
          </button>
        </div>
      </div>

      <div
        style={{
          padding: "5px 14px",
          background: "var(--bg-subtle)",
          borderBottom: "1px solid var(--border-soft)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 11.2,
          color: "var(--ink-muted)",
        }}
      >
        <span className="mono" style={{ color: "var(--ink)", fontWeight: 600 }}>
          {targetBlock.qualname}
        </span>
        <span>点蓝字向右长出结构卡 ↘</span>
      </div>

      {mode === "skeleton" ? (
        <pre
          className="mm-code-body nodrag nowheel"
          style={{
            margin: 0,
            padding: "10px 14px",
            maxHeight: 260,
            overflow: "auto",
          }}
        >
          {activeSlice.l1_skeleton_code}
        </pre>
      ) : (
        <div className="nodrag nowheel">
          {canExpandUp && (
            <button
              type="button"
              className="code-expand-strip"
              onClick={() => onExpandRadius(8)}
            >
              <ChevronUp size={12} />
              <span>向上展开更多上下文（当前聚焦第 {winStartLine}–{winEndLine} 行）</span>
            </button>
          )}

          <div
            className="mm-code-body"
            style={{ maxHeight: 310, overflowY: "auto" }}
          >
            {renderFocusedRows()}
          </div>

          {canExpandDown && (
            <button
              type="button"
              className="code-expand-strip"
              onClick={() => onExpandRadius(8)}
            >
              <ChevronDown size={12} />
              <span>向下展开更多源码 · 或点右上「完整文件」看全貌</span>
            </button>
          )}
        </div>
      )}

      <Handle type="source" position={Position.Right} className="mm-handle" />
    </div>
  );
};

/* ============================================================================
   4. LEVEL 2B: LIVE RUNTIME PULSE NODE
   ============================================================================ */

export interface RuntimePulseNodeData extends Record<string, unknown> {
  currentFrame: TraceFrame & { phase_label?: string };
  prevFrame: (TraceFrame & { phase_label?: string }) | null;
  topologyNodes: string[];
  onOpenFullRuntimeDrawer: () => void;
}

export const RuntimePulseNode: React.FC<
  NodeProps<Node<RuntimePulseNodeData>>
> = ({ data }) => {
  const { currentFrame, prevFrame, topologyNodes, onOpenFullRuntimeDrawer } =
    data;
  const [tab, setTab] = useState<"pulse" | "matrix" | "channels">("pulse");

  const mem = currentFrame.memory_snapshot;
  const allChannels = Object.keys(mem.channel_versions).filter(
    (c) => c !== "__start__"
  );
  const realNodes = topologyNodes.filter(
    (n) => n !== "__start__" && n !== "__end__"
  );

  const scheduledTriggersByNode = new Map<string, Set<string>>();
  for (const t of mem.tasks_queue) {
    scheduledTriggersByNode.set(t.name, new Set(t.triggers));
  }

  // Distill focused key observations for default "pulse" mode
  const pulseBullets: Array<{ dot: string; content: React.ReactNode }> = [];

  if (currentFrame.lifecycle_phase === "compile") {
    pulseBullets.push({
      dot: "var(--clay)",
      content: (
        <span>
          当前在 <strong>静态编译期</strong>：节点与边已装配为底层通道订阅关系，点底部{" "}
          <strong style={{ color: "var(--clay)" }}>下一步 ›</strong> 启动第 0 超步。
        </span>
      ),
    });
  } else {
    if (mem.tasks_queue.length > 0) {
      pulseBullets.push({
        dot: "var(--ink-blue)",
        content: (
          <span>
            <strong>本轮排期任务：</strong>
            {mem.tasks_queue.map((t) => (
              <span key={t.name} className="mono" style={{ marginRight: 6 }}>
                {t.name}(由 {t.triggers.join(",")} 唤醒)
              </span>
            ))}
          </span>
        ),
      });
    } else if (currentFrame.lifecycle_phase === "stream_or_interrupt") {
      const intr = Object.entries(currentFrame.node_statuses).find(
        ([, s]) => s === "interrupted"
      );
      pulseBullets.push({
        dot: intr ? "var(--ink-coral)" : "var(--ink-sage)",
        content: intr ? (
          <span>
            节点 <strong className="mono">{intr[0]}</strong> 抛出{" "}
            <code className="mono">GraphInterrupt</code>，跳过屏障安全挂起等待恢复。
          </span>
        ) : (
          <span>
            无任何节点满足 <code className="mono">ver &gt; seen</code>，全图达成{" "}
            <strong>Vote to Halt 收敛停机</strong>。
          </span>
        ),
      });
    }

    if (mem.pending_writes.length > 0) {
      pulseBullets.push({
        dot: "var(--ink-amber)",
        content: (
          <span>
            <strong>屏障外私有暂存 ({mem.pending_writes.length} 条)：</strong>
            {mem.pending_writes
              .slice(0, 2)
              .map((pw) => `${pw.task_name}→${pw.channel}`)
              .join("，")}{" "}
            （同轮并发节点互不可见）
          </span>
        ),
      });
    }

    const bumpedChannels = allChannels.filter((ch) => {
      const prev = prevFrame?.memory_snapshot.channel_versions[ch];
      return prev !== undefined && prev !== mem.channel_versions[ch];
    });
    if (bumpedChannels.length > 0) {
      pulseBullets.push({
        dot: "var(--ink-sage)",
        content: (
          <span>
            <strong>同步屏障刚刚推进版本：</strong>
            {bumpedChannels
              .map((c) => `${c} → v${mem.channel_versions[c]}`)
              .join(" · ")}
          </span>
        ),
      });
    }

    if (pulseBullets.length === 0) {
      pulseBullets.push({
        dot: "var(--ink-sage)",
        content: (
          <span>
            当前已落盘通道数：<strong>{Object.keys(mem.channel_values).length}</strong>{" "}
            个 · 可切换至「唤醒表」查看完整版本比对。
          </span>
        ),
      });
    }
  }

  return (
    <div className="mm-pulse-card">
      <Handle type="target" position={Position.Left} className="mm-handle" />

      <div className="mm-card-bar nodrag">
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className="chapter-num-badge" style={{ fontSize: 10.8 }}>
            第 {currentFrame.superstep} 轮超步
          </span>
          <span style={{ fontSize: 12, fontWeight: 600 }}>运行现场脉搏</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div className="seg-control" style={{ height: 24, padding: 2 }}>
            {(
              [
                ["pulse", "本幕焦点"],
                ["matrix", "唤醒表"],
                ["channels", "通道值"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                className={`seg-item ${tab === k ? "active" : ""}`}
                style={{ height: 20, padding: "0 8px", fontSize: 11 }}
                onClick={() => setTab(k)}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="ghost-icon-btn"
            style={{ width: 24, height: 24 }}
            onClick={onOpenFullRuntimeDrawer}
            title="在侧边抽屉展开全量内存快照与断点草稿"
          >
            <Maximize2 size={11} strokeWidth={1.8} />
          </button>
        </div>
      </div>

      <div
        style={{
          padding: "5px 14px",
          background: "var(--bg-subtle)",
          borderBottom: "1px solid var(--border-soft)",
          fontSize: 11.4,
          color: "var(--ink-muted)",
        }}
      >
        {currentFrame.phase_label ?? currentFrame.lifecycle_phase}
      </div>

      <div className="nodrag nowheel">
        {tab === "pulse" && (
          <div>
            {pulseBullets.map((b, idx) => (
              <div key={idx} className="pulse-item">
                <span
                  className="dot"
                  style={{ background: b.dot, marginTop: 6 }}
                />
                <div>{b.content}</div>
              </div>
            ))}
          </div>
        )}

        {tab === "matrix" &&
          (allChannels.length === 0 ? (
            <div style={{ padding: 12, fontSize: 12, color: "var(--ink-muted)" }}>
              编译阶段尚无运行时通道版本号。
            </div>
          ) : (
            <div style={{ overflowX: "auto", maxHeight: 220 }}>
              <table className="clean-matrix mono">
                <thead>
                  <tr>
                    <th>通道</th>
                    <th>版本</th>
                    {realNodes.map((n) => (
                      <th key={n}>{n}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allChannels.map((ch) => {
                    const gv = mem.channel_versions[ch];
                    return (
                      <tr key={ch}>
                        <td style={{ color: "var(--ink)", fontWeight: 600 }}>
                          {ch}
                        </td>
                        <td>v{gv}</td>
                        {realNodes.map((n) => {
                          const sv = mem.versions_seen[n]?.[ch];
                          const hot =
                            Boolean(scheduledTriggersByNode.get(n)?.has(ch)) &&
                            Number(gv) > (sv === undefined ? 0 : Number(sv));
                          return (
                            <td key={n} className={hot ? "unseen-hot" : ""}>
                              {hot
                                ? `${sv ?? 0}→${gv}`
                                : sv === undefined
                                  ? "·"
                                  : `v${sv}`}
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

        {tab === "channels" && (
          <div style={{ maxHeight: 220, overflowY: "auto", padding: "4px 14px" }}>
            {Object.entries(mem.channel_values).map(([k, v]) => (
              <div key={k} className="kv-mini-row mono" style={{ fontSize: 11.3 }}>
                <span style={{ fontWeight: 600, color: "var(--ink)" }}>{k}: </span>
                <span style={{ color: "var(--ink-body)", wordBreak: "break-all" }}>
                  {JSON.stringify(v)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

/* ============================================================================
   5. LEVEL 3+: POLYMORPHIC SPROUTED LEAF NODE (Struct / Concept / Insight / L0 / Forest)
   ============================================================================ */

export type SproutLeafVariant =
  | { kind: "symbol"; symbol: SymbolBlueprint; currentFrame: TraceFrame }
  | { kind: "concept"; card: ConceptCardConfig }
  | { kind: "insight"; node: ExtendedGraphNode }
  | { kind: "l0_probe"; probe: ProbeBundle }
  | { kind: "forest_card"; node: ExtendedGraphNode };

export interface SproutLeafNodeData extends Record<string, unknown> {
  leafId: string;
  variant: SproutLeafVariant;
  isSprouting?: boolean;
  onClose?: (leafId: string) => void;
  onSparkClick?: (parentNodeId: string, spark: SuggestedSpark) => void;
  onCustomFollowUp?: (parentNodeId: string, question: string) => Promise<void>;
  onEndorse?: (node: ExtendedGraphNode) => void;
  onTeleportToChapter?: (chapterId: string, symbolId?: string) => void;
}

export const SproutLeafNode: React.FC<NodeProps<Node<SproutLeafNodeData>>> = ({
  id,
  data,
}) => {
  const {
    leafId,
    variant,
    isSprouting,
    onClose,
    onSparkClick,
    onCustomFollowUp,
    onEndorse,
    onTeleportToChapter,
  } = data;

  const [symTab, setSymTab] = useState<"fusion" | "raw">("fusion");
  const [concTier, setConcTier] = useState<1 | 2>(1);
  const [sandboxCode, setSandboxCode] = useState(
    variant.kind === "concept" && variant.card.tier2_slice.type === "python_sandbox"
      ? variant.card.tier2_slice.minimal_code
      : ""
  );
  const [stdout, setStdout] = useState(
    variant.kind === "concept" && variant.card.tier2_slice.type === "python_sandbox"
      ? variant.card.tier2_slice.expected_stdout
      : ""
  );
  const [runningPy, setRunningPy] = useState(false);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [followUpQ, setFollowUpQ] = useState("");

  const runPyodide = async (fallbackOut: string) => {
    setRunningPy(true);
    setStdout("正在浏览器启动 Python 3.12…");
    try {
      if (!window.__pyodideInstance) {
        if (!window.loadPyodide) {
          await new Promise<void>((resolve, reject) => {
            const s = document.createElement("script");
            s.src = "https://cdn.jsdelivr.net/pyodide/v0.27.2/full/pyodide.js";
            s.onload = () => resolve();
            s.onerror = () => reject(new Error("CDN unreachable"));
            document.head.appendChild(s);
          });
        }
        window.__pyodideInstance = await window.loadPyodide!({
          indexURL: "https://cdn.jsdelivr.net/pyodide/v0.27.2/full/",
        });
      }
      const lines: string[] = [];
      window.__pyodideInstance.setStdout({
        batched: (m: string) => lines.push(m),
      });
      await window.__pyodideInstance.runPythonAsync(sandboxCode);
      setStdout(lines.join("\n") || "(运行完成)");
    } catch {
      setStdout(fallbackOut);
    } finally {
      setRunningPy(false);
    }
  };

  if (variant.kind === "forest_card") {
    const { node } = variant;
    const KIND_MAP: Record<string, { label: string; dot: string }> = {
      spine: { label: "章节主干", dot: "var(--clay)" },
      insight: { label: "延伸思考", dot: "var(--ink-sage)" },
      symbol: { label: "核心结构", dot: "var(--ink-blue)" },
      theory: { label: "论文溯源", dot: "var(--ink-amber)" },
      syntax: { label: "Python 机制", dot: "var(--ink-amber)" },
    };
    const info = KIND_MAP[node.kind] ?? {
      label: "知识卡片",
      dot: "var(--ink-muted)",
    };

    return (
      <div
        className="mm-leaf-card"
        style={{
          width: 274,
          background: node.kind === "spine" ? "#fdf9f3" : "var(--bg-card)",
          borderColor:
            node.kind === "spine" ? "var(--clay-border)" : "var(--border-medium)",
        }}
      >
        <Handle type="target" position={Position.Left} className="mm-handle" />
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span className="kg-badge">
            <span className="dot" style={{ background: info.dot }} />
            {info.label}
          </span>
          {node.heat_score ? (
            <span style={{ fontSize: 10.5, color: "var(--ink-muted)" }}>
              +{node.heat_score}
            </span>
          ) : null}
        </div>
        <div className="kg-card-title" style={{ fontSize: 13.8 }}>
          {node.title}
        </div>
        <div
          className="kg-card-body"
          style={{
            fontSize: 11.8,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          <InlineMarkdown text={node.concise_markdown} />
        </div>
        <div
          className="nodrag"
          style={{
            marginTop: 9,
            paddingTop: 7,
            borderTop: "1px solid var(--border-soft)",
            textAlign: "right",
          }}
        >
          <button
            type="button"
            onClick={() =>
              onTeleportToChapter?.(
                node.chapter_id,
                node.kind === "symbol" ? node.id : undefined
              )
            }
            style={{
              border: "none",
              background: "transparent",
              padding: 0,
              fontSize: 11.5,
              fontWeight: 600,
              color: "var(--clay)",
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
              cursor: "pointer",
            }}
          >
            聚焦伴读此关 <ArrowUpRight size={12} strokeWidth={1.8} />
          </button>
        </div>
        <Handle type="source" position={Position.Right} className="mm-handle" />
      </div>
    );
  }

  if (variant.kind === "l0_probe") {
    const { probe } = variant;
    return (
      <div className="mm-leaf-card" style={{ width: 390 }}>
        <Handle type="target" position={Position.Left} className="mm-handle" />
        <div
          className="nodrag"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 6,
          }}
        >
          <span className="kg-badge">
            <span className="dot" style={{ background: "var(--clay)" }} />
            业务层探针示例 (L0)
          </span>
          {onClose && (
            <button
              type="button"
              className="ghost-icon-btn"
              style={{ width: 24, height: 24 }}
              onClick={() => onClose(leafId)}
            >
              <X size={13} />
            </button>
          )}
        </div>
        <pre
          className="mono nodrag nowheel"
          style={{
            margin: "6px 0 8px",
            padding: "8px 10px",
            borderRadius: 8,
            background: "var(--bg-code)",
            border: "1px solid var(--border-soft)",
            fontSize: 11,
            lineHeight: 1.55,
            maxHeight: 170,
            overflow: "auto",
          }}
        >
          {probe.l0_view.probe_code}
        </pre>
        <div
          className="mono"
          style={{
            fontSize: 11,
            padding: "6px 8px",
            borderRadius: 8,
            background: "var(--ink-sage-tint)",
            color: "var(--ink-sage)",
            overflowX: "auto",
          }}
        >
          收敛结果：{JSON.stringify(probe.l0_view.output_state)}
        </div>
      </div>
    );
  }

  if (variant.kind === "symbol") {
    const { symbol, currentFrame } = variant;
    const mem = currentFrame.memory_snapshot as unknown as Record<string, unknown>;
    const liveStr = (k?: string) => {
      if (!k || mem[k] === undefined) return "";
      const s = JSON.stringify(mem[k]);
      return s.length > 34 ? `${s.slice(0, 32)}…` : s;
    };

    return (
      <div className="mm-leaf-card symbol">
        <Handle type="target" position={Position.Left} className="mm-handle" />
        <div
          className="nodrag"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span className="kg-badge">
            <span className="dot" style={{ background: "var(--ink-blue)" }} />
            手边结构卡 · {symbol.kind}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div className="seg-control" style={{ height: 22, padding: 2 }}>
              <button
                type="button"
                className={`seg-item ${symTab === "fusion" ? "active" : ""}`}
                style={{ height: 18, padding: "0 7px", fontSize: 10.5 }}
                onClick={() => setSymTab("fusion")}
              >
                字段解读
              </button>
              <button
                type="button"
                className={`seg-item ${symTab === "raw" ? "active" : ""}`}
                style={{ height: 18, padding: "0 7px", fontSize: 10.5 }}
                onClick={() => setSymTab("raw")}
              >
                源码定义
              </button>
            </div>
            {onClose && (
              <button
                type="button"
                className="ghost-icon-btn"
                style={{ width: 24, height: 24 }}
                onClick={() => onClose(leafId)}
                title="收起此结构卡"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        <div className="kg-card-title mono" style={{ fontSize: 14 }}>
          {symbol.name}
        </div>

        {symTab === "raw" ? (
          <pre
            className="mono nodrag nowheel"
            style={{
              margin: 0,
              padding: "8px 10px",
              borderRadius: 8,
              background: "var(--bg-code)",
              fontSize: 10.8,
              lineHeight: 1.55,
              maxHeight: 195,
              overflow: "auto",
            }}
          >
            {symbol.raw_excerpt}
          </pre>
        ) : (
          <div
            className="nodrag nowheel"
            style={{ maxHeight: 220, overflowY: "auto" }}
          >
            {symbol.fields.map((f) => {
              const lv = liveStr(f.live_key);
              return (
                <div key={f.name} className="kv-mini-row">
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span
                      className="mono"
                      style={{
                        fontSize: 11.3,
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {f.name}
                    </span>
                    {lv && (
                      <span
                        className="mono"
                        style={{
                          fontSize: 10.4,
                          padding: "1px 6px",
                          borderRadius: 5,
                          background: "var(--bg-code)",
                          color: "var(--ink-blue)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          maxWidth: 128,
                          flexShrink: 0,
                        }}
                      >
                        {lv}
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 11.8,
                      color: "var(--ink-muted)",
                      marginTop: 2,
                    }}
                  >
                    {f.duty_cn}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  if (variant.kind === "concept") {
    const { card } = variant;
    const badgeLabel =
      card.lens === "pregel_paper"
        ? "论文溯源 · Pregel"
        : card.lens === "python_syntax"
          ? "Python 语法小抄"
          : "底层运行契约";

    return (
      <div className="mm-leaf-card concept" style={{ width: 356 }}>
        <Handle type="target" position={Position.Left} className="mm-handle" />
        <div
          className="nodrag"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span className="kg-badge">
            <span className="dot" style={{ background: "var(--ink-amber)" }} />
            {badgeLabel}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div className="seg-control" style={{ height: 22, padding: 2 }}>
              <button
                type="button"
                className={`seg-item ${concTier === 1 ? "active" : ""}`}
                style={{ height: 18, padding: "0 7px", fontSize: 10.5 }}
                onClick={() => setConcTier(1)}
              >
                通俗解读
              </button>
              <button
                type="button"
                className={`seg-item ${concTier === 2 ? "active" : ""}`}
                style={{ height: 18, padding: "0 7px", fontSize: 10.5 }}
                onClick={() => setConcTier(2)}
              >
                {card.tier2_slice.type === "paper_bridge" ? "论文原话" : "试跑"}
              </button>
            </div>
            {onClose && (
              <button
                type="button"
                className="ghost-icon-btn"
                style={{ width: 24, height: 24 }}
                onClick={() => onClose(leafId)}
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        <div className="kg-card-title">{card.title}</div>

        {concTier === 1 ? (
          <div className="kg-card-body">
            <p style={{ margin: "0 0 8px" }}>{card.tier1_tldr}</p>
            <div
              style={{
                paddingTop: 7,
                borderTop: "1px solid var(--border-soft)",
                fontSize: 11.8,
                color: "var(--ink-muted)",
              }}
            >
              <strong style={{ color: "var(--ink)" }}>跨语言类比：</strong>
              {card.tier1_analogy}
            </div>
          </div>
        ) : card.tier2_slice.type === "paper_bridge" ? (
          <div className="kg-card-body nodrag">
            <blockquote
              style={{
                margin: "0 0 8px",
                padding: "7px 10px",
                borderRadius: 8,
                background: "var(--bg-callout)",
                borderLeft: "3px solid var(--clay)",
                fontStyle: "italic",
                fontSize: 12,
              }}
            >
              “{card.tier2_slice.original_quote}”
            </blockquote>
            <div style={{ fontSize: 12 }}>
              <strong>工程演进：</strong>
              {card.tier2_slice.langgraph_adaptation}
            </div>
          </div>
        ) : (
          <div className="nodrag nowheel" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <textarea
              className="mono"
              value={sandboxCode}
              onChange={(e) => setSandboxCode(e.target.value)}
              rows={5}
              style={{
                width: "100%",
                background: "var(--bg-code)",
                border: "1px solid var(--border-medium)",
                borderRadius: 8,
                padding: "6px 8px",
                fontSize: 11.2,
                outline: "none",
              }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "var(--ink-muted)" }}>
                浏览器内置 Python
              </span>
              <button
                type="button"
                className="subtle-btn"
                style={{ height: 24, fontSize: 11 }}
                disabled={runningPy}
                onClick={() => runPyodide(card.tier2_slice.type === "python_sandbox" ? card.tier2_slice.expected_stdout : "")}
              >
                <Play size={10} />
                {runningPy ? "运行中…" : "运行小代码"}
              </button>
            </div>
            <pre
              className="mono"
              style={{
                margin: 0,
                padding: "6px 8px",
                borderRadius: 6,
                background: "var(--bg-code)",
                color: "var(--ink-sage)",
                fontSize: 11,
                overflowX: "auto",
              }}
            >
              {stdout}
            </pre>
          </div>
        )}
      </div>
    );
  }

  // Variant: "insight" (Crystallized or AI-Sprouted Branch Card)
  const { node } = variant;
  return (
    <div className="mm-leaf-card insight">
      <Handle type="target" position={Position.Left} className="mm-handle" />
      <div
        className="nodrag"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span className="kg-badge">
          <span className="dot" style={{ background: "var(--ink-sage)" }} />
          {node.visibility === "local_personal" ? "我的追问笔记" : "延伸思考"}
        </span>
        {onClose && (
          <button
            type="button"
            className="ghost-icon-btn"
            style={{ width: 24, height: 24 }}
            onClick={() => onClose(leafId)}
            title="收起此分支"
          >
            <X size={13} />
          </button>
        )}
      </div>

      <div className="kg-card-title">{node.title}</div>
      <div className="kg-card-body">
        <InlineMarkdown text={node.concise_markdown} />
      </div>

      <div className="mm-bud-row nodrag">
        {node.suggested_sparks?.slice(0, 2).map((sp, i) => (
          <button
            key={i}
            type="button"
            className="mm-bud"
            disabled={isSprouting}
            onClick={() => onSparkClick?.(id, sp)}
          >
            <CornerDownRight size={11} color="var(--clay)" />
            <span>{sp.label}</span>
          </button>
        ))}
        <button
          type="button"
          className="mm-bud"
          onClick={() => setFollowUpOpen((o) => !o)}
        >
          <Plus size={11} color="var(--clay)" />
          <span>顺着这里继续问…</span>
        </button>
      </div>

      {followUpOpen && (
        <form
          className="nodrag"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!followUpQ.trim()) return;
            const q = followUpQ.trim();
            setFollowUpQ("");
            setFollowUpOpen(false);
            await onCustomFollowUp?.(id, q);
          }}
          style={{ marginTop: 8 }}
        >
          <input
            type="text"
            value={followUpQ}
            onChange={(e) => setFollowUpQ(e.target.value)}
            placeholder="回车向右继续生长下一层卡片…"
            style={{
              width: "100%",
              height: 30,
              padding: "0 9px",
              borderRadius: 8,
              border: "1px solid var(--border-medium)",
              fontSize: 11.8,
              outline: "none",
            }}
          />
        </form>
      )}

      <div
        className="nodrag"
        style={{
          marginTop: 9,
          paddingTop: 7,
          borderTop: "1px solid var(--border-soft)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 11.2,
          color: "var(--ink-muted)",
        }}
      >
        <button
          type="button"
          onClick={() => onEndorse?.(node)}
          style={{
            border: "none",
            background: "transparent",
            padding: 0,
            color: node.endorsed ? "var(--ink-sage)" : "var(--ink-muted)",
            fontWeight: 500,
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            cursor: "pointer",
          }}
        >
          <ThumbsUp size={11} />
          {node.endorsed ? "已标记启发" : "很有启发"}
        </button>
        {node.heat_score !== undefined && <span>+{node.heat_score} 共鸣</span>}
      </div>

      <Handle type="source" position={Position.Right} className="mm-handle" />
    </div>
  );
};

export const MIND_CANVAS_NODE_TYPES = {
  chapterRoot: ChapterRootNode,
  spineSection: SpineSectionNode,
  codeSlice: CodeSliceNode,
  runtimePulse: RuntimePulseNode,
  sproutLeaf: SproutLeafNode,
};
