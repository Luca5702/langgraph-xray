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
    card.tier2_slice.type === "python_sandbox" ? card.tier2_slice.minimal_code : ""
  );
  const [stdout, setStdout] = useState(
    card.tier2_slice.type === "python_sandbox" ? card.tier2_slice.expected_stdout : ""
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
    setStdout("Initializing Pyodide (WebAssembly Python 3.12)...");
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
      setStdout(lines.join("\n") || "(exit 0)");
    } catch {
      if (card.tier2_slice.type === "python_sandbox") {
        setStdout(card.tier2_slice.expected_stdout);
      }
    } finally {
      setRunningPy(false);
    }
  };

  const lensEyebrow =
    card.lens === "pregel_paper"
      ? "PAPER · GOOGLE PREGEL (SIGMOD '10)"
      : card.lens === "python_syntax"
        ? "PYTHON · RUNTIME MECHANISM"
        : "CONTRACT · LANGCHAIN RUNNABLE";

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
        <span className="eyebrow">{lensEyebrow}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div className="seg-control" style={{ height: 24 }}>
            <button
              type="button"
              className={`seg-item ${tier === 1 ? "active" : ""}`}
              style={{ height: 18, fontSize: 11, padding: "0 8px" }}
              onClick={() => setTier(1)}
            >
              Overview
            </button>
            <button
              type="button"
              className={`seg-item ${tier === 2 ? "active" : ""}`}
              style={{ height: 18, fontSize: 11, padding: "0 8px" }}
              onClick={() => setTier(2)}
            >
              {card.tier2_slice.type === "paper_bridge" ? "Paper Quote" : "Playground"}
            </button>
          </div>
          <button
            type="button"
            className="ghost-icon-btn"
            style={{ width: 24, height: 24 }}
            onClick={onClose}
            aria-label="Close"
          >
            <X size={13} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      <div
        style={{
          fontSize: 13.5,
          fontWeight: 600,
          letterSpacing: "-0.01em",
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
              fontSize: 12.8,
              lineHeight: 1.65,
              color: "var(--ink-secondary)",
            }}
          >
            {card.tier1_tldr}
          </p>
          <div
            style={{
              paddingTop: 8,
              borderTop: "1px solid var(--hairline)",
              fontSize: 12,
              color: "var(--ink-muted)",
            }}
          >
            <span style={{ color: "var(--ink)", fontWeight: 500 }}>跨语言对照：</span>
            {card.tier1_analogy}
          </div>
        </div>
      ) : card.tier2_slice.type === "paper_bridge" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="mono" style={{ fontSize: 11, color: "var(--ink-faint)" }}>
            {card.tier2_slice.citation}
          </div>
          <blockquote
            style={{
              margin: 0,
              paddingLeft: 12,
              borderLeft: "1.5px solid var(--ink-muted)",
              fontStyle: "italic",
              fontSize: 12.5,
              lineHeight: 1.6,
              color: "var(--ink)",
            }}
          >
            “{card.tier2_slice.original_quote}”
          </blockquote>
          <div style={{ fontSize: 12.5, lineHeight: 1.62, color: "var(--ink-secondary)" }}>
            <span style={{ color: "var(--ink)", fontWeight: 500 }}>工程演进差异：</span>
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
              border: "1px solid var(--hairline-strong)",
              borderRadius: 6,
              padding: "8px 10px",
              fontSize: 11.8,
              lineHeight: 1.55,
              resize: "vertical",
              outline: "none",
            }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="eyebrow">STDOUT · WASM PYTHON</span>
            <button
              type="button"
              className="subtle-btn"
              onClick={runInBrowserPyodide}
              disabled={runningPy}
            >
              <Play size={11} strokeWidth={1.6} />
              {runningPy ? "Running..." : "Run in Browser"}
            </button>
          </div>
          <pre
            className="mono"
            style={{
              margin: 0,
              padding: "7px 10px",
              borderRadius: 6,
              background: "var(--bg-code)",
              border: "1px solid var(--hairline)",
              color: "var(--sig-green)",
              fontSize: 11.5,
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
          paddingTop: 9,
          borderTop: "1px solid var(--hairline)",
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
            fontSize: 11.5,
            color: "var(--ink-muted)",
            cursor: "pointer",
          }}
        >
          {tier === 1 ? "查看深度切片 →" : "← 返回摘要"}
        </button>

        <button
          type="button"
          onClick={() =>
            onSproutInCanvas(
              `深入剖析「${card.title}」在当前关卡源码中的边界行为与设计取舍`,
              card.concept_id
            )
          }
          style={{
            border: "none",
            background: "transparent",
            padding: 0,
            fontSize: 11.5,
            fontWeight: 500,
            color: "var(--ink)",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            cursor: "pointer",
          }}
        >
          在生长画布继续派生 <ArrowUpRight size={12} strokeWidth={1.6} />
        </button>
      </div>
    </div>
  );
};
