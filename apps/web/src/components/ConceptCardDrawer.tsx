import React, { useEffect, useState } from "react";
import { ArrowUpRight, Play, X } from "lucide-react";
import type { ConceptCardConfig } from "../types/bundle";

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

interface ConceptCardDrawerProps {
  card: ConceptCardConfig;
  onClose: () => void;
  onSproutInCanvas: (question: string, conceptId: string) => void;
}

export const ConceptCardDrawer: React.FC<ConceptCardDrawerProps> = ({
  card,
  onClose,
  onSproutInCanvas,
}) => {
  const [tier, setTier] = useState<1 | 2>(1);
  const [sandboxCode, setSandboxCode] = useState(
    card.tier2_slice.type === "python_sandbox"
      ? card.tier2_slice.minimal_code
      : ""
  );
  const [stdout, setStdout] = useState(
    card.tier2_slice.type === "python_sandbox"
      ? card.tier2_slice.expected_stdout
      : ""
  );
  const [runningPy, setRunningPy] = useState(false);

  useEffect(() => {
    setTier(1);
    if (card.tier2_slice.type === "python_sandbox") {
      setSandboxCode(card.tier2_slice.minimal_code);
      setStdout(card.tier2_slice.expected_stdout);
    }
  }, [card]);

  const runInBrowserPyodide = async () => {
    setRunningPy(true);
    setStdout("正在浏览器中启动 Python 3.12 环境…");
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
        batched: (msg: string) => lines.push(msg),
      });
      await window.__pyodideInstance.runPythonAsync(sandboxCode);
      setStdout(lines.join("\n") || "(运行完毕，无输出)");
    } catch {
      if (card.tier2_slice.type === "python_sandbox") {
        setStdout(card.tier2_slice.expected_stdout);
      }
    } finally {
      setRunningPy(false);
    }
  };

  const lensLabel =
    card.lens === "pregel_paper"
      ? "论文溯源 · Google Pregel (2010)"
      : card.lens === "python_syntax"
        ? "Python 语法小抄"
        : "底层运行契约";

  return (
    <div className="concept-inline-panel" role="region" aria-label={card.title}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          marginBottom: 10,
        }}
      >
        <span className="chapter-kicker" style={{ fontSize: 11 }}>
          {lensLabel}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div className="seg-control" style={{ height: 26 }}>
            <button
              type="button"
              className={`seg-item ${tier === 1 ? "active" : ""}`}
              style={{ height: 20, fontSize: 11.2, padding: "0 9px" }}
              onClick={() => setTier(1)}
            >
              通俗解读
            </button>
            <button
              type="button"
              className={`seg-item ${tier === 2 ? "active" : ""}`}
              style={{ height: 20, fontSize: 11.2, padding: "0 9px" }}
              onClick={() => setTier(2)}
            >
              {card.tier2_slice.type === "paper_bridge" ? "论文原话" : "动手试跑"}
            </button>
          </div>
          <button
            type="button"
            className="ghost-icon-btn"
            style={{ width: 26, height: 26 }}
            onClick={onClose}
            aria-label="收起小抄"
          >
            <X size={14} strokeWidth={1.6} />
          </button>
        </div>
      </div>

      <div
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: 15,
          fontWeight: 600,
          marginBottom: 8,
          color: "var(--ink)",
        }}
      >
        {card.title}
      </div>

      {tier === 1 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p
            style={{
              margin: 0,
              fontSize: 13,
              lineHeight: 1.72,
              color: "var(--ink-body)",
            }}
          >
            {card.tier1_tldr}
          </p>
          <div
            style={{
              paddingTop: 9,
              borderTop: "1px solid var(--border-soft)",
              fontSize: 12.4,
              color: "var(--ink-muted)",
              lineHeight: 1.6,
            }}
          >
            <span style={{ color: "var(--ink)", fontWeight: 600 }}>
              熟悉其他语言？可以这样类比：
            </span>
            {card.tier1_analogy}
          </div>
        </div>
      ) : card.tier2_slice.type === "paper_bridge" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 11.5, color: "var(--ink-muted)" }}>
            出处：{card.tier2_slice.citation}
          </div>
          <blockquote
            style={{
              margin: 0,
              padding: "10px 14px",
              borderRadius: 8,
              background: "var(--bg-callout)",
              borderLeft: "3px solid var(--clay)",
              fontFamily: "var(--font-serif)",
              fontStyle: "italic",
              fontSize: 13,
              lineHeight: 1.65,
              color: "var(--ink)",
            }}
          >
            “{card.tier2_slice.original_quote}”
          </blockquote>
          <div
            style={{
              fontSize: 12.8,
              lineHeight: 1.68,
              color: "var(--ink-body)",
            }}
          >
            <span style={{ color: "var(--ink)", fontWeight: 600 }}>
              LangGraph 的工程改良：
            </span>
            {card.tier2_slice.langgraph_adaptation}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <textarea
            aria-label="Python 微沙盒代码"
            className="mono"
            value={sandboxCode}
            onChange={(e) => setSandboxCode(e.target.value)}
            rows={7}
            style={{
              width: "100%",
              background: "var(--bg-code)",
              color: "var(--ink)",
              border: "1px solid var(--border-medium)",
              borderRadius: 8,
              padding: "9px 11px",
              fontSize: 12,
              lineHeight: 1.58,
              resize: "vertical",
              outline: "none",
            }}
          />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span className="eyebrow">运行输出（浏览器内置 Python）</span>
            <button
              type="button"
              className="subtle-btn"
              onClick={runInBrowserPyodide}
              disabled={runningPy}
            >
              <Play size={11} strokeWidth={1.8} />
              {runningPy ? "正在运行…" : "在浏览器里跑一下"}
            </button>
          </div>
          <pre
            className="mono"
            style={{
              margin: 0,
              padding: "8px 11px",
              borderRadius: 8,
              background: "var(--bg-code)",
              border: "1px solid var(--border-soft)",
              color: "var(--ink-sage)",
              fontSize: 11.8,
              overflowX: "auto",
            }}
          >
            {stdout}
          </pre>
        </div>
      )}

      <div
        style={{
          marginTop: 12,
          paddingTop: 10,
          borderTop: "1px solid var(--border-soft)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <button
          type="button"
          onClick={() => setTier(tier === 1 ? 2 : 1)}
          style={{
            border: "none",
            background: "transparent",
            padding: 0,
            fontSize: 12,
            color: "var(--ink-muted)",
            cursor: "pointer",
          }}
        >
          {tier === 1 ? "看看代码/原话 →" : "← 回到通俗解读"}
        </button>

        <button
          type="button"
          onClick={() =>
            onSproutInCanvas(
              `深入聊聊「${card.title}」在当前关卡源码里的边界细节与设计考量`,
              card.concept_id
            )
          }
          style={{
            border: "none",
            background: "transparent",
            padding: 0,
            fontSize: 12,
            fontWeight: 600,
            color: "var(--clay)",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            cursor: "pointer",
          }}
        >
          放到思维画布里深聊 <ArrowUpRight size={13} strokeWidth={1.8} />
        </button>
      </div>
    </div>
  );
};
