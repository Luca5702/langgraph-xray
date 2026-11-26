"""L2 Self-Evolution Maintainer Agent (PRD v1.2 §4.7).

Reads clustered confusion signals exported from Cloudflare D1 (`confusion_logs`),
partitions them by `confusion_type`:
  - `langgraph_logic` / `edge_case` -> distills a <= 150-word `InsightNode` + semantic edges into `content/graph/public_graph.json`
  - `prerequisite_python` / `prerequisite_theory` -> creates an orthogonal `content/concepts/<slug>.json` ConceptCard
Optionally invokes Google Gemini 2.5 Pro when `GEMINI_API_KEY` is present, with deterministic structured synthesis fallback for CI dry-runs.
"""

from __future__ import annotations

import json
import os
import re
import urllib.request
from pathlib import Path
from typing import Any


def slugify(text: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9\u4e00-\u9fa5]+", "-", text.lower()).strip("-")
    return cleaned[:42] or "grown-node"


def call_gemini_maintainer_if_available(cluster: dict[str, Any]) -> dict[str, Any] | None:
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        return None
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key={api_key}"
    prompt = (
        "You are the LangGraph X-Ray Maintainer Agent. Distill the following reader confusion cluster "
        "into an atomic knowledge graph node (title <= 18 Chinese chars, concise_markdown <= 150 Chinese chars "
        "strictly grounded in LangGraph source lines).\n\n"
        f"Cluster JSON:\n{json.dumps(cluster, ensure_ascii=False)}"
    )
    payload = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": 0.2,
        },
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            body = json.loads(resp.read().decode("utf-8"))
            txt = body["candidates"][0]["content"]["parts"][0]["text"]
            return json.loads(txt)
    except Exception:
        return None


def evolve_from_clusters(
    clusters: list[dict[str, Any]],
    repo_root: Path,
    min_count: int = 3,
) -> dict[str, list[str]]:
    """Process confusion clusters and write new ConceptCard JSONs or Public Knowledge Graph nodes."""
    concepts_dir = repo_root / "content" / "concepts"
    graph_file = repo_root / "content" / "graph" / "public_graph.json"
    concepts_dir.mkdir(parents=True, exist_ok=True)
    graph_file.parent.mkdir(parents=True, exist_ok=True)

    public_graph: dict[str, Any] = {"nodes": [], "edges": []}
    if graph_file.exists():
        public_graph = json.loads(graph_file.read_text(encoding="utf-8"))

    existing_node_ids = {n["id"] for n in public_graph.get("nodes", [])}
    created_concepts: list[str] = []
    created_insights: list[str] = []

    for cluster in clusters:
        count = int(cluster.get("count", 1))
        endorsed = bool(cluster.get("endorsed_for_graph", False))
        if count < min_count and not endorsed:
            continue

        ctype = cluster.get("confusion_type", "langgraph_logic")
        llm_distilled = call_gemini_maintainer_if_available(cluster)

        if ctype in ("prerequisite_python", "prerequisite_theory"):
            cid = cluster.get("concept_id") or f"auto-{slugify(cluster.get('selected_text', 'concept'))}"
            card_path = concepts_dir / f"{cid}.json"
            if not card_path.exists():
                is_py = ctype == "prerequisite_python"
                card = {
                    "concept_id": cid,
                    "node_kind": "syntax" if is_py else "theory",
                    "lens": "python_syntax" if is_py else "pregel_paper",
                    "title": (llm_distilled or {}).get("title") or cluster.get("title") or f"自动沉淀：{cluster.get('selected_text', '')[:16]}",
                    "tier1_tldr": (llm_distilled or {}).get("concise_markdown") or cluster.get("distilled_answer", "由高频读者追问自动提炼的前置背景知识卡。"),
                    "tier1_analogy": cluster.get("analogy", "跨语言等价心智模型对照。"),
                    "tier2_slice": (
                        {
                            "type": "python_sandbox",
                            "minimal_code": cluster.get("minimal_code", "x = [1, 2]\nprint(len(x))"),
                            "expected_stdout": cluster.get("expected_stdout", "2"),
                        }
                        if is_py
                        else {
                            "type": "paper_bridge",
                            "citation": "Google Pregel (SIGMOD 2010)",
                            "original_quote": cluster.get("quote", "Barrier-synchronized supersteps."),
                            "langgraph_adaptation": cluster.get("adaptation", "LangGraph 基于命名状态通道实现了该机制。"),
                        }
                    ),
                    "ast_matchers": [cluster.get("selected_text", "")[:24]],
                }
                card_path.write_text(json.dumps(card, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
                created_concepts.append(str(card_path.relative_to(repo_root)))
        else:
            nid = cluster.get("node_id") or f"insight_auto_{slugify(cluster.get('target_ref', 'anchor'))}"
            if nid not in existing_node_ids:
                node = {
                    "id": nid,
                    "kind": "insight",
                    "visibility": "crystallized_public",
                    "chapter_id": cluster.get("chapter_id", "ch02_superstep_barrier"),
                    "origin_anchor": cluster.get("target_ref", ""),
                    "title": (llm_distilled or {}).get("title") or cluster.get("title") or "高频追问结晶剖析",
                    "concise_markdown": (llm_distilled or {}).get("concise_markdown") or cluster.get("distilled_answer", ""),
                    "heat_score": count,
                }
                public_graph.setdefault("nodes", []).append(node)
                parent_spine = cluster.get("spine_node_id") or f"spine_{cluster.get('chapter_id', 'ch02_superstep_barrier')}"
                public_graph.setdefault("edges", []).append(
                    {
                        "id": f"edge_{parent_spine}_to_{nid}",
                        "source": parent_spine,
                        "target": nid,
                        "relation": "evolves_to",
                        "style": "solid",
                    }
                )
                for sym_id in cluster.get("referenced_symbols", []):
                    public_graph["edges"].append(
                        {
                            "id": f"edge_{nid}_ref_{sym_id.split('.')[-1]}",
                            "source": nid,
                            "target": sym_id,
                            "relation": "references_symbol",
                            "style": "dashed",
                        }
                    )
                existing_node_ids.add(nid)
                created_insights.append(nid)

    if created_insights:
        graph_file.write_text(json.dumps(public_graph, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    return {
        "created_concepts": created_concepts,
        "created_insights": created_insights,
    }
