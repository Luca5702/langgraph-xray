import React, { useState } from "react";
import { ArrowUpRight, ChevronDown, ChevronRight } from "lucide-react";
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
  const [expandedMargins, setExpandedMargins] = useState<Record<string, boolean>>({});
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
        x: Math.min(window.innerWidth - 220, Math.max(16, e.clientX - 60)),
        y: Math.max(52, e.clientY - 40),
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
            title="点击在右侧静态蓝图栏查看字段契约"
            onClick={() => onInspectSymbol(targetId, `Referenced in ${chapter.number}`)}
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
              ? "PAPER"
              : card.lens === "python_syntax"
                ? "PY"
                : "SPEC";
          const isSelected =
            openConceptKey?.blockId === blockId &&
            openConceptKey?.conceptId === targetId;
          parts.push(
            <span
              key={key}
              className={`concept-token ${isSelected ? "open" : ""}`}
              title="点击原位展开背景知识切片"
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
    <section className="pane-col" aria-label="主脊柱精读讲义">
      <div className="col-bar">
        <span className="eyebrow">Guide · {chapter.number}</span>
        <button
          type="button"
          onClick={() =>
            onOpenCanvasFromSpine(chapter.sections[0]?.spine_node_id ?? "")
          }
          style={{
            border: "none",
            background: "transparent",
            padding: 0,
            color: "var(--ink-muted)",
            fontSize: 11.5,
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            cursor: "pointer",
          }}
        >
          <span>{branchCountByChapter} branches in Canvas</span>
          <ArrowUpRight size={12} strokeWidth={1.5} />
        </button>
      </div>

      <div
        className="pane-scroll editorial-scroll"
        onScroll={() => setSelectionPopup(null)}
      >
        <header className="editorial-header">
          <div className="eyebrow">
            {chapter.number.replace("Ch.", "CHAPTER 0")} · KERNEL ANATOMY
          </div>
          <h2 className="editorial-title">{chapter.title}</h2>
          <p className="editorial-lede">
            <strong>核心命题 — </strong>
            {chapter.core_question}
          </p>
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
                  title="在语义画布展开本节探索脉络"
                  style={{
                    border: "none",
                    background: "transparent",
                    padding: 0,
                    fontSize: 11,
                    color: "var(--ink-faint)",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  Explore ↗
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
                    <span>Q&amp;A · {sec.margin_note.q}</span>
                    {marginOpen ? (
                      <ChevronDown size={13} strokeWidth={1.5} />
                    ) : (
                      <ChevronRight size={13} strokeWidth={1.5} />
                    )}
                  </button>
                  {marginOpen && <div className="qa-answer">{sec.margin_note.a}</div>}
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
            推入生长画布追问 ↗
          </button>
        </div>
      )}
    </section>
  );
};
