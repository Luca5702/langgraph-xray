import React, { useState } from "react";
import { BookOpen, GitBranch, MessageSquareQuote, Sparkles } from "lucide-react";
import type {
  ChapterCurriculum,
  ConceptCardConfig,
  KnowledgeLens,
} from "../types/bundle";
import { ConceptCardDrawer } from "./ConceptCardDrawer";

interface TutorialPaneProps {
  chapter: ChapterCurriculum;
  concepts: Record<string, ConceptCardConfig>;
  activeLenses: KnowledgeLens[];
  onInspectSymbol: (symbolId: string, provenance?: string) => void;
  onOpenCanvasFromSpine: (spineNodeId: string) => void;
  onSproutFromSelection: (
    selectedText: string,
    targetRef: string,
    anchorType: "tutorial_mdx" | "source_code",
    customQuestion?: string
  ) => void;
  branchCountByChapter: number;
}

const TOKEN_REGEX = /\[\[(sym|concept):([^|\]]+)\|([^\]]+)\]\]/g;

export const TutorialPane: React.FC<TutorialPaneProps> = ({
  chapter,
  concepts,
  activeLenses,
  onInspectSymbol,
  onOpenCanvasFromSpine,
  onSproutFromSelection,
  branchCountByChapter,
}) => {
  const [openConceptKey, setOpenConceptKey] = useState<{
    blockId: string;
    conceptId: string;
  } | null>(null);
  const [expandedMargins, setExpandedMargins] = useState<Record<string, boolean>>({
    [chapter.sections[0]?.block_id ?? ""]: true,
  });
  const [selectionPopup, setSelectionPopup] = useState<{
    x: number;
    y: number;
    text: string;
    blockId: string;
  } | null>(null);

  const handleMouseUp = (blockId: string, e: React.MouseEvent) => {
    const sel = window.getSelection();
    const txt = sel?.toString().trim() ?? "";
    if (txt.length >= 4 && txt.length <= 260) {
      setSelectionPopup({
        x: Math.min(window.innerWidth - 260, Math.max(16, e.clientX - 60)),
        y: Math.max(52, e.clientY - 42),
        text: txt,
        blockId,
      });
    } else {
      setSelectionPopup(null);
    }
  };

  const renderRichParagraph = (text: string, blockId: string) => {
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    const regex = new RegExp(TOKEN_REGEX.source, "g");

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index));
      }
      const [, kind, targetId, label] = match;
      const key = `${blockId}_${match.index}`;

      if (kind === "sym") {
        parts.push(
          <span
            key={key}
            className="inline-sym-chip"
            title="点击在右侧「手边器械盘」零跳转展开静态结构契约"
            onClick={() =>
              onInspectSymbol(targetId, `教程正文引用 · ${label}`)
            }
          >
            📌 {label}
          </span>
        );
      } else if (kind === "concept") {
        const card = concepts[targetId];
        const lensVisible = card ? activeLenses.includes(card.lens) : false;
        if (!lensVisible) {
          // Pure / filtered mode: zero visual noise for experienced developers
          parts.push(<span key={key}>{label}</span>);
        } else {
          const icon =
            card.lens === "pregel_paper"
              ? "📄"
              : card.lens === "python_syntax"
                ? "🐍"
                : "🔗";
          const isSelected =
            openConceptKey?.blockId === blockId &&
            openConceptKey?.conceptId === targetId;
          parts.push(
            <span
              key={key}
              className={`inline-concept-chip ${isSelected ? "selected" : ""}`}
              title="点击原位展开三级背景知识切片（不跳离当前阅读位置）"
              onClick={() =>
                setOpenConceptKey(
                  isSelected ? null : { blockId, conceptId: targetId }
                )
              }
            >
              {icon} {label}
            </span>
          );
        }
      }
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }
    return parts;
  };

  return (
    <section className="pane-col" aria-label="交互式精读教程区">
      <div className="pane-header">
        <div className="pane-title">
          <BookOpen size={14} color="var(--accent-teal)" />
          <span>{chapter.number} · 主脊柱精读讲义</span>
        </div>
        <button
          type="button"
          className="icon-btn"
          onClick={() =>
            onOpenCanvasFromSpine(chapter.sections[0]?.spine_node_id ?? "")
          }
          title="切换到受控生长语义画布查看本关全部衍生脉络"
        >
          <GitBranch size={12} color="var(--accent-emerald)" />
          <span>🌿 {branchCountByChapter} 条衍生支线</span>
        </button>
      </div>

      <div className="pane-scroll" onScroll={() => setSelectionPopup(null)}>
        {/* Chapter Core Question Banner */}
        <div
          style={{
            padding: "10px 12px",
            borderRadius: 6,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-subtle)",
            marginBottom: 16,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--accent-teal)",
              marginBottom: 3,
            }}
          >
            本关核心灵魂拷问
          </div>
          <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}>
            {chapter.core_question}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 4 }}>
            提示：点亮虚线词条可原位展开论文/语法实验；鼠标划选任意文字可向画布派生新分支。
          </div>
        </div>

        {chapter.sections.map((sec) => {
          const activeConcept =
            openConceptKey?.blockId === sec.block_id
              ? concepts[openConceptKey.conceptId]
              : undefined;
          const marginOpen = Boolean(expandedMargins[sec.block_id]);

          return (
            <article
              key={sec.block_id}
              data-block-id={sec.block_id}
              onMouseUp={(e) => handleMouseUp(sec.block_id, e)}
              style={{ marginBottom: 22 }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                <h2
                  style={{
                    margin: 0,
                    fontSize: 13.8,
                    fontWeight: 700,
                    color: "var(--text-primary)",
                  }}
                >
                  {sec.heading}
                </h2>
                <button
                  type="button"
                  className="icon-btn"
                  style={{ padding: "2px 7px", fontSize: 11 }}
                  onClick={() => onOpenCanvasFromSpine(sec.spine_node_id)}
                  title="以本节为主干锚点推开语义生长画布"
                >
                  <GitBranch size={11} color="var(--accent-teal)" />
                  展开脉络
                </button>
              </div>

              {sec.paragraphs.map((p, idx) => (
                <p
                  key={idx}
                  style={{
                    margin: "0 0 10px",
                    color: "var(--text-secondary)",
                    lineHeight: 1.68,
                    userSelect: "text",
                  }}
                >
                  {renderRichParagraph(p, sec.block_id)}
                </p>
              ))}

              {/* In-Place Progressive Concept Unfolding (Tier 1 & Tier 2) */}
              {activeConcept && (
                <ConceptCardDrawer
                  card={activeConcept}
                  onClose={() => setOpenConceptKey(null)}
                  onSproutInCanvas={(q, cid) =>
                    onSproutFromSelection(
                      activeConcept.title,
                      `concept:${cid}`,
                      "tutorial_mdx",
                      q
                    )
                  }
                />
              )}

              {/* L1 Margin High-Frequency Confusion Capsule */}
              {sec.margin_note && (
                <div className="margin-capsule">
                  <div
                    onClick={() =>
                      setExpandedMargins((prev) => ({
                        ...prev,
                        [sec.block_id]: !prev[sec.block_id],
                      }))
                    }
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      cursor: "pointer",
                      fontWeight: 600,
                      color: "var(--text-primary)",
                    }}
                  >
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <MessageSquareQuote size={13} color="var(--accent-teal)" />
                      高频卡点剖析：{sec.margin_note.q}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {marginOpen ? "收起" : "展开"}
                    </span>
                  </div>
                  {marginOpen && (
                    <div
                      style={{
                        marginTop: 6,
                        color: "var(--text-secondary)",
                        lineHeight: 1.55,
                      }}
                    >
                      {sec.margin_note.a}
                    </div>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>

      {/* Floating Selection Sprout Pill */}
      {selectionPopup && (
        <div
          className="selection-floating-bar"
          style={{ left: selectionPopup.x, top: selectionPopup.y }}
        >
          <button
            type="button"
            className="seg-btn active"
            onClick={() => {
              const { text, blockId } = selectionPopup;
              setSelectionPopup(null);
              window.getSelection()?.removeAllRanges();
              onSproutFromSelection(
                text,
                `${chapter.chapter_id}#${blockId}`,
                "tutorial_mdx"
              );
            }}
          >
            <Sparkles size={12} />
            🌱 划词推入画布生长新分支
          </button>
        </div>
      )}
    </section>
  );
};
