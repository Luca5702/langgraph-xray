import React, { useEffect, useState } from "react";
import { Check, Download, X } from "lucide-react";
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
  const [apiHealth, setApiHealth] = useState<string>("正在检查连接状态…");
  const [apiOnline, setApiOnline] = useState<boolean>(false);
  const [savedToast, setSavedToast] = useState(false);

  useEffect(() => {
    const base = edgeApiBaseUrl.trim().replace(/\/$/, "");
    fetch(`${base}/api/health`)
      .then((r) => r.json())
      .then(
        (d: {
          ok?: boolean;
          langgraph_version?: string;
          gemini_configured?: boolean;
        }) => {
          if (d.ok) {
            setApiOnline(true);
            setApiHealth(
              `已连接边缘知识库 · 内核版本 langgraph ${d.langgraph_version}`
            );
          } else {
            setApiOnline(false);
            setApiHealth("离线伴读模式 · 本地启发式引擎已就绪");
          }
        }
      )
      .catch(() => {
        setApiOnline(false);
        setApiHealth("离线伴读模式 · 本地启发式引擎已就绪");
      });
  }, [edgeApiBaseUrl]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    saveEngineSettings({ geminiApiKey, edgeApiBaseUrl });
    setSavedToast(true);
    setTimeout(() => {
      setSavedToast(false);
      onClose();
    }, 500);
  };

  const handleExportPersonalGraph = () => {
    const blob = new Blob([JSON.stringify(personalGraph, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "langgraph-companion-notes.json";
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
            marginBottom: 14,
          }}
        >
          <div>
            <span className="chapter-num-badge" style={{ fontSize: 11 }}>
              伴读偏好设置
            </span>
            <div
              style={{
                fontFamily: "var(--font-serif)",
                fontSize: 17,
                fontWeight: 600,
                marginTop: 6,
              }}
            >
              AI 追问引擎与个人笔记管理
            </div>
          </div>
          <button
            type="button"
            className="ghost-icon-btn"
            onClick={onClose}
            aria-label="关闭设置窗口"
          >
            <X size={15} strokeWidth={1.7} />
          </button>
        </div>

        <div
          style={{
            padding: "9px 12px",
            borderRadius: 10,
            background: "var(--bg-subtle)",
            border: "1px solid var(--border-soft)",
            fontSize: 12,
            color: "var(--ink-body)",
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span
            className="dot"
            style={{
              background: apiOnline ? "var(--ink-sage)" : "var(--ink-amber)",
            }}
          />
          <span>{apiHealth}</span>
        </div>

        <form
          onSubmit={handleSave}
          style={{ display: "flex", flexDirection: "column", gap: 14 }}
        >
          <div>
            <label
              htmlFor="input-gemini-key"
              style={{
                display: "block",
                fontSize: 12.5,
                fontWeight: 600,
                color: "var(--ink-body)",
                marginBottom: 6,
              }}
            >
              Google Gemini API Key{" "}
              <span style={{ color: "var(--ink-muted)", fontWeight: 400 }}>
                （选填 · 仅保存在你的浏览器本地）
              </span>
            </label>
            <input
              id="input-gemini-key"
              type="password"
              value={geminiApiKey}
              onChange={(e) => setGeminiApiKey(e.target.value)}
              placeholder="AIzaSy..."
              className="mono"
              style={{
                width: "100%",
                height: 36,
                padding: "0 12px",
                borderRadius: 9,
                background: "var(--bg-card)",
                color: "var(--ink)",
                border: "1px solid var(--border-medium)",
                fontSize: 12.5,
                outline: "none",
              }}
            />
          </div>

          <div>
            <label
              htmlFor="input-edge-url"
              style={{
                display: "block",
                fontSize: 12.5,
                fontWeight: 600,
                color: "var(--ink-body)",
                marginBottom: 6,
              }}
            >
              边缘服务地址{" "}
              <span style={{ color: "var(--ink-muted)", fontWeight: 400 }}>
                （留空则默认使用同源 /api）
              </span>
            </label>
            <input
              id="input-edge-url"
              type="text"
              value={edgeApiBaseUrl}
              onChange={(e) => setEdgeApiBaseUrl(e.target.value)}
              placeholder="https://langgraph-xray-api.workers.dev"
              className="mono"
              style={{
                width: "100%",
                height: 36,
                padding: "0 12px",
                borderRadius: 9,
                background: "var(--bg-card)",
                color: "var(--ink)",
                border: "1px solid var(--border-medium)",
                fontSize: 12.5,
                outline: "none",
              }}
            />
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              paddingTop: 14,
              borderTop: "1px solid var(--border-soft)",
              marginTop: 4,
            }}
          >
            <button
              type="button"
              className="subtle-btn"
              onClick={handleExportPersonalGraph}
            >
              <Download size={13} strokeWidth={1.6} />
              导出我的画布笔记（{personalGraph.nodes.length}）
            </button>

            <button
              type="submit"
              className="primary-cta"
              style={{ height: 32, padding: "0 16px" }}
            >
              <Check size={14} strokeWidth={1.9} />
              {savedToast ? "已保存" : "保存设置"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
