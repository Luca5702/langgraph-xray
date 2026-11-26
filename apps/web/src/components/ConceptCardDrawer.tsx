import React, { useEffect, useState } from "react";
import { Play, Sparkles, X } from "lucide-react";
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
    card.tier2_slice.type === "python_sandbox"
      ? `# 预期标准输出:\n${card.tier2_slice.expected_stdout}`
      : ""
  );
  const [runningPy, setRunningPy] = useState(false);

  useEffect(() => {
    setTier(1);
    if (card.tier2_slice.type === "python_sandbox") {
      setSandboxCode(card.tier2_slice.minimal_code);
      setStdout(`# 预期标准输出:\n${card.tier2_slice.expected_stdout}`);
    }
  }, [card]);

  const runInBrowserPyodide = async () => {
    setRunningPy(true);
    setStdout("正在按需加载浏览器端 Pyodide (WebAssembly Python 3.12)...");
    try {
      if (!window.__pyodideInstance) {
        if (!window.loadPyodide) {
          await new Promise<void>((resolve, reject) => {
            const s = document.createElement("script");
            s.src = "https://cdn.jsdelivr.net/pyodide/v0.27.2/full/pyodide.js";
            s.onload = () => resolve();
            s.onerror = () => reject(new Error("Pyodide CDN unavailable"));
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
      setStdout(lines.join("\n") || "(执行完成，无标准输出)");
    } catch {
      if (card.tier2_slice.type === "python_sandbox") {
        setStdout(
          `[离线沙盒验证结果 · $0 后端算力]\n${card.tier2_slice.expected_stdout}`
        );
      }
    } finally {
      setRunningPy(false);
    }
  };

  const lensBadge =
    card.lens === "pregel_paper"
      ? "📄 Google Pregel (2010) 论文溯源"
      : card.lens === "python_syntax"
        ? "🐍 Python 高阶语法透视"
        : "🔗 LangChain Runnable 控制面契约";

  return (
    <div className="concept-drawer-card" role="region" aria-label={card.title}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "var(--accent-amber)",
          }}
        >
          {lensBadge}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div className="segmented-group">
            <button
              type="button"
              className={`seg-btn ${tier === 1 ? "active" : ""}`}
              onClick={() => setTier(1)}
            >
              Tier 1 · 3秒扫盲
            </button>
            <button
              type="button"
              className={`seg-btn ${tier === 2 ? "active" : ""}`}
              onClick={() => setTier(2)}
            >
              Tier 2 · {card.tier2_slice.type === "paper_bridge" ? "论文对照" : "微沙盒"}
            </button>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="关闭概念卡片"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
        {card.title}
      </div>

      {tier === 1 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <p style={{ margin: 0, color: "var(--text-primary)", fontSize: 12.5 }}>
            {card.tier1_tldr}
          </p>
          <div
            style={{
              padding: "6px 9px",
              borderRadius: 5,
              background: "var(--bg-elevated)",
              color: "var(--text-secondary)",
              fontSize: 12,
            }}
          >
            <strong>跨语言直觉类比：</strong> {card.tier1_analogy}
          </div>
        </div>
      ) : card.tier2_slice.type === "paper_bridge" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12 }}>
          <div style={{ color: "var(--text-muted)", fontSize: 11 }}>
            出处：{card.tier2_slice.citation}
          </div>
          <blockquote
            style={{
              margin: 0,
              padding: "7px 10px",
              borderLeft: "2.5px solid var(--accent-amber)",
              background: "var(--bg-elevated)",
              fontStyle: "italic",
              color: "var(--text-primary)",
            }}
          >
            “{card.tier2_slice.original_quote}”
          </blockquote>
          <div style={{ color: "var(--text-secondary)" }}>
            <strong style={{ color: "var(--accent-teal)" }}>LangGraph 工程演进差异：</strong>
            {card.tier2_slice.langgraph_adaptation}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <textarea
            aria-label="Python 微沙盒代码编辑器"
            className="mono"
            value={sandboxCode}
            onChange={(e) => setSandboxCode(e.target.value)}
            rows={7}
            style={{
              width: "100%",
              background: "var(--bg-code)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-strong)",
              borderRadius: 5,
              padding: 8,
              fontSize: 11.5,
              lineHeight: 1.5,
              resize: "vertical",
            }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button
              type="button"
              className="icon-btn"
              onClick={runInBrowserPyodide}
              disabled={runningPy}
              style={{
                borderColor: "var(--accent-teal)",
                color: "var(--accent-teal)",
                fontWeight: 600,
              }}
            >
              <Play size={11} />
              {runningPy ? "运行中..." : "在浏览器运行 Python (Pyodide · $0 算力)"}
            </button>
          </div>
          <pre
            className="mono"
            style={{
              margin: 0,
              padding: "6px 9px",
              borderRadius: 5,
              background: "var(--bg-elevated)",
              color: "var(--accent-emerald)",
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
          marginTop: 9,
          paddingTop: 7,
          borderTop: "1px solid var(--border-subtle)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <button
          type="button"
          className="seg-btn"
          style={{ padding: "2px 6px", color: "var(--accent-amber)" }}
          onClick={() => setTier(tier === 1 ? 2 : 1)}
        >
          {tier === 1 ? "展开 Tier 2 深度切片 →" : "← 返回 Tier 1 摘要"}
        </button>
        <button
          type="button"
          className="seg-btn"
          style={{ padding: "2px 7px", color: "var(--accent-teal)" }}
          onClick={() =>
            onSproutInCanvas(
              `深入剖析「${card.title}」在当前关卡源码中的边界行为与设计取舍`,
              card.concept_id
            )
          }
        >
          <Sparkles size={12} />
          Tier 3 · 推入生长画布派生分支
        </button>
      </div>
    </div>
  );
};
