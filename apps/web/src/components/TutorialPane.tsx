import React, { useState } from "react";
import { ArrowUpRight, ChevronDown, ChevronRight, HelpCircle } from "lucide-react";
import type {
  ChapterCurriculum,
  ConceptCardConfig,
  KnowledgeLens,
} from "../types/bundle";
import { ConceptCardDrawer } from "./ConceptCardDrawer";
import { InlineMarkdown } from "./InlineMarkdown";

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

function formatChapterLabel(num: string): string {
  const n = num.replace(/[^0-9]/g, "");
  return `第 ${Number(n) || 1} 关`;
}

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
  const [expandedMargins, setExpandedMargins] = useState<Record<string, boolean>>(
    {}
  );
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
        x: Math.min(window.innerWidth - 230, Math.max(16, e.clientX - 60)),
        y: Math.max(58, e.clientY - 42),
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
        parts.push(
          <InlineMarkdown
            key={`txt_${blockId}_${lastIndex}`}
            text={text.slice(lastIndex, match.index)}
          />
        );
      }
      const [, kind, targetId, label] = match;
      const key = `${blockId}_${match.index}`;

      if (kind === "sym") {
        parts.push(
          <span
            key={key}
            className="sym-token"
            title="点击在右侧「手边结构卡」查看它的字段含义"
            onClick={() =>
              onInspectSymbol(
                targetId,
                `在${formatChapterLabel(chapter.number)}讲义中点选`
              )
            }
          >
            {label}
          </span>
        );
      } else if (kind === "concept") {
        const card = concepts[targetId];
        const lensVisible = card ? activeLenses.includes(card.lens) : false;
        if (!lensVisible) {
          parts.push(<span key={key}>{label}</span>);
        } else {
          const sup =
            card.lens === "pregel_paper"
              ? "论文"
              : card.lens === "python_syntax"
                ? "语法"
                : "契约";
          const isSelected =
            openConceptKey?.blockId === blockId &&
            openConceptKey?.conceptId === targetId;
          parts.push(
            <span
              key={key}
              className={`concept-token ${isSelected ? "open" : ""}`}
              title="点击原位展开通俗背景小抄"
              onClick={() =>
                setOpenConceptKey(
                  isSelected ? null : { blockId, conceptId: targetId }
                )
              }
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
          key={`tail_${blockId}_${lastIndex}`}
          text={text.slice(lastIndex)}
        />
      );
    }
    return parts;
  };

  return (
    <section className="pane-col" aria-label="伴读讲义">
      <div className="col-bar">
        <span className="section-tag">伴读讲义</span>
        <button
          type="button"
          onClick={() =>
            onOpenCanvasFromSpine(chapter.sections[0]?.spine_node_id ?? "")
          }
          style={{
            border: "none",
            background: "transparent",
            padding: 0,
            color: "var(--clay)",
            fontSize: 12,
            fontWeight: 500,
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            cursor: "pointer",
          }}
        >
          <span>画布已有 {branchCountByChapter} 张思考卡</span>
          <ArrowUpRight size={13} strokeWidth={1.7} />
        </button>
      </div>

      <div
        className="pane-scroll editorial-scroll"
        onScroll={() => setSelectionPopup(null)}
      >
        <header className="editorial-header">
          <span className="chapter-kicker">
            {formatChapterLabel(chapter.number)} · 边跑边读源码
          </span>
          <h2 className="editorial-title">{chapter.title}</h2>
          <div className="core-question-card">
            <span className="core-question-label">本关一起搞懂这个问题</span>
            {chapter.core_question}
          </div>
        </header>

        {chapter.sections.map((sec) => {
          const activeConcept =
            openConceptKey?.blockId === sec.block_id
              ? concepts[openConceptKey.conceptId]
              : undefined;
          const marginOpen = Boolean(expandedMargins[sec.block_id]);

          return (
            <article
              key={sec.block_id}
              className="editorial-section"
              data-block-id={sec.block_id}
              onMouseUp={(e) => handleMouseUp(sec.block_id, e)}
            >
              <div className="section-head-row">
                <h3 className="section-h2">{sec.heading}</h3>
                <button
                  type="button"
                  onClick={() => onOpenCanvasFromSpine(sec.spine_node_id)}
                  title="去思维生长画布顺着本节继续发散"
                  style={{
                    border: "none",
                    background: "transparent",
                    padding: "2px 6px",
                    borderRadius: 6,
                    fontSize: 11.5,
                    color: "var(--ink-muted)",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  展开聊聊 ↗
                </button>
              </div>

              {sec.paragraphs.map((p, idx) => (
                <p
                  key={idx}
                  className="editorial-p"
                  style={{ userSelect: "text" }}
                >
                  {renderRichParagraph(p, sec.block_id)}
                </p>
              ))}

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

              {sec.margin_note && (
                <div className="qa-disclosure">
                  <button
                    type="button"
                    className="qa-trigger"
                    onClick={() =>
                      setExpandedMargins((prev) => ({
                        ...prev,
                        [sec.block_id]: !prev[sec.block_id],
                      }))
                    }
                  >
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <HelpCircle
                        size={13}
                        strokeWidth={1.8}
                        color="var(--clay)"
                        style={{ flexShrink: 0 }}
                      />
                      <span>常见疑问：{sec.margin_note.q}</span>
                    </span>
                    {marginOpen ? (
                      <ChevronDown size={14} strokeWidth={1.6} />
                    ) : (
                      <ChevronRight size={14} strokeWidth={1.6} />
                    )}
                  </button>
                  {marginOpen && (
                    <div className="qa-answer">{sec.margin_note.a}</div>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>

      {selectionPopup && (
        <div
          className="selection-pill"
          style={{ left: selectionPopup.x, top: selectionPopup.y }}
        >
          <button
            type="button"
            className="primary-cta"
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
            把这段放入画布深聊 ↗
          </button>
        </div>
      )}
    </section>
  );
};
