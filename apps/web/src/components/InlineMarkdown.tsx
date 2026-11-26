import React from "react";

const INLINE_MD_REGEX = /(`[^`]+`|\*\*[^*]+\*\*)/g;

/**
 * Lightweight inline formatter converting `code` spans and **bold** spans
 * into clean Geist Mono chips and medium-weight emphasis without raw markdown punctuation.
 */
export const InlineMarkdown: React.FC<{ text: string }> = ({ text }) => {
  const parts = text.split(INLINE_MD_REGEX);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
          return (
            <code
              key={i}
              className="mono"
              style={{
                fontSize: "0.9em",
                padding: "1px 4px",
                borderRadius: 4,
                background: "var(--bg-surface-1)",
                border: "1px solid var(--hairline)",
                color: "var(--ink)",
              }}
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
          return (
            <strong key={i} style={{ color: "var(--ink)", fontWeight: 600 }}>
              {part.slice(2, -2)}
            </strong>
          );
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </>
  );
};
