import React, { useEffect, useState } from "react";
import { Check, Download, Server, X } from "lucide-react";
import {
  loadEngineSettings,
  saveEngineSettings,
  type PersonalGraphStore,
} from "../store/storage";

interface SettingsModalProps {
  onClose: () => void;
  personalGraph: PersonalGraphStore;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  onClose,
  personalGraph,
}) => {
  const initial = loadEngineSettings();
  const [geminiApiKey, setGeminiApiKey] = useState(initial.geminiApiKey);
  const [edgeApiBaseUrl, setEdgeApiBaseUrl] = useState(initial.edgeApiBaseUrl);
  const [apiHealth, setApiHealth] = useState<string>("检测中...");
  const [savedToast, setSavedToast] = useState(false);

  useEffect(() => {
    const base = edgeApiBaseUrl.trim().replace(/\/$/, "");
    fetch(`${base}/api/health`)
      .then((r) => r.json())
      .then((d: { ok?: boolean; langgraph_version?: string; gemini_configured?: boolean }) => {
        if (d.ok) {
          setApiHealth(
            `已连接 Cloudflare Edge API (内核 v${d.langgraph_version} · 服务端密钥: ${
              d.gemini_configured ? "已配置" : "按需使用浏览器端 Key 或启发式引擎"
            })`
          );
        } else {
          setApiHealth("未检测到边缘后端，自动启用纯静态本地锚定引擎");
        }
      })
      .catch(() => {
        setApiHealth("静态独立运行态（无需后端服务器即可完整体验沙盒与本地分支生长）");
      });
  }, [edgeApiBaseUrl]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    saveEngineSettings({ geminiApiKey, edgeApiBaseUrl });
    setSavedToast(true);
    setTimeout(() => {
      setSavedToast(false);
      onClose();
    }, 600);
  };

  const handleExportPersonalGraph = () => {
    const blob = new Blob([JSON.stringify(personalGraph, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "langgraph-xray-personal-graph.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <strong style={{ fontSize: 14 }}>
            ⚙️ AI 生长引擎与边缘云配置 (Cloudflare + Gemini)
          </strong>
          <button type="button" className="icon-btn" onClick={onClose}>
            <X size={13} />
          </button>
        </div>

        <div
          style={{
            padding: "8px 10px",
            borderRadius: 6,
            background: "var(--bg-elevated)",
            fontSize: 11.5,
            color: "var(--accent-teal)",
            marginBottom: 12,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Server size={13} />
          <span>{apiHealth}</span>
        </div>

        <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <label
              htmlFor="input-gemini-key"
              style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}
            >
              Google Gemini API Key（可选 · 仅保存在当前浏览器 localStorage）
            </label>
            <input
              id="input-gemini-key"
              type="password"
              value={geminiApiKey}
              onChange={(e) => setGeminiApiKey(e.target.value)}
              placeholder="AIzaSy... (留空则使用源码锚定离线启发式引擎)"
              className="mono"
              style={{
                width: "100%",
                padding: "7px 9px",
                borderRadius: 5,
                background: "var(--bg-canvas)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-strong)",
                fontSize: 12,
              }}
            />
          </div>

          <div>
            <label
              htmlFor="input-edge-url"
              style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}
            >
              Cloudflare Workers API 地址（留空默认同源 `/api` 代理）
            </label>
            <input
              id="input-edge-url"
              type="text"
              value={edgeApiBaseUrl}
              onChange={(e) => setEdgeApiBaseUrl(e.target.value)}
              placeholder="例如 https://langgraph-xray-api.your-subdomain.workers.dev"
              className="mono"
              style={{
                width: "100%",
                padding: "7px 9px",
                borderRadius: 5,
                background: "var(--bg-canvas)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-strong)",
                fontSize: 12,
              }}
            />
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              paddingTop: 10,
              borderTop: "1px solid var(--border-subtle)",
              marginTop: 4,
            }}
          >
            <button
              type="button"
              className="icon-btn"
              onClick={handleExportPersonalGraph}
            >
              <Download size={12} /> 导出个人图谱 JSON ({personalGraph.nodes.length} 节点)
            </button>

            <button type="submit" className="seg-btn active" style={{ padding: "6px 14px" }}>
              <Check size={13} />
              {savedToast ? "已保存!" : "保存配置"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
