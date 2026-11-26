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
  const [apiHealth, setApiHealth] = useState<string>("Checking runtime...");
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
              `Connected · Cloudflare D1 Edge API (langgraph ${d.langgraph_version})`
            );
          } else {
            setApiOnline(false);
            setApiHealth("Standalone Static Mode (Local Heuristic Engine)");
          }
        }
      )
      .catch(() => {
        setApiOnline(false);
        setApiHealth("Standalone Static Mode (Local Heuristic Engine)");
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
            marginBottom: 14,
          }}
        >
          <div>
            <div className="eyebrow">CONFIGURATION</div>
            <div style={{ fontSize: 15, fontWeight: 600, marginTop: 2 }}>
              Engine &amp; Knowledge Graph Settings
            </div>
          </div>
          <button
            type="button"
            className="ghost-icon-btn"
            onClick={onClose}
            aria-label="Close settings"
          >
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>

        <div
          style={{
            padding: "8px 11px",
            borderRadius: 7,
            background: "var(--bg-surface-1)",
            border: "1px solid var(--hairline)",
            fontSize: 11.5,
            color: "var(--ink-secondary)",
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span
            className="dot"
            style={{
              background: apiOnline ? "var(--sig-green)" : "var(--sig-amber)",
            }}
          />
          <span className="mono">{apiHealth}</span>
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
                fontSize: 12,
                fontWeight: 500,
                color: "var(--ink-secondary)",
                marginBottom: 6,
              }}
            >
              Google Gemini API Key{" "}
              <span style={{ color: "var(--ink-faint)", fontWeight: 400 }}>
                (Optional · Browser localStorage only)
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
                height: 32,
                padding: "0 10px",
                borderRadius: 6,
                background: "var(--bg-canvas)",
                color: "var(--ink)",
                border: "1px solid var(--hairline-strong)",
                fontSize: 12,
                outline: "none",
              }}
            />
          </div>

          <div>
            <label
              htmlFor="input-edge-url"
              style={{
                display: "block",
                fontSize: 12,
                fontWeight: 500,
                color: "var(--ink-secondary)",
                marginBottom: 6,
              }}
            >
              Cloudflare Edge API Base URL{" "}
              <span style={{ color: "var(--ink-faint)", fontWeight: 400 }}>
                (Default same-origin /api)
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
                height: 32,
                padding: "0 10px",
                borderRadius: 6,
                background: "var(--bg-canvas)",
                color: "var(--ink)",
                border: "1px solid var(--hairline-strong)",
                fontSize: 12,
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
              borderTop: "1px solid var(--hairline)",
              marginTop: 4,
            }}
          >
            <button
              type="button"
              className="subtle-btn"
              onClick={handleExportPersonalGraph}
            >
              <Download size={12} strokeWidth={1.5} />
              Export Drafts ({personalGraph.nodes.length})
            </button>

            <button
              type="submit"
              className="primary-cta"
              style={{ height: 30, padding: "0 14px" }}
            >
              <Check size={13} strokeWidth={1.8} />
              {savedToast ? "Saved" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
