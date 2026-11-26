"""Automated test suite for LangGraph X-Ray build-time kernel inspector & maintainer."""

from __future__ import annotations

import json
from pathlib import Path

from langgraph_xray_inspector.cli import build_all, get_repo_root
from langgraph_xray_inspector.maintainer import evolve_from_clusters


def test_build_all_generates_authentic_bundle() -> None:
    root = get_repo_root()
    bundle = build_all(root)

    assert bundle["meta"]["chapter_count"] == 6
    assert bundle["meta"]["symbol_count"] >= 18
    assert bundle["meta"]["concept_count"] >= 12

    # Ch.2 must capture diamond fan-out / fan-in and NamedBarrierValue channel
    ch2_trace = bundle["probes"]["ch02_superstep_barrier"]["trace"]
    assert "node_b" in ch2_trace["topology"]["nodes"]
    assert "node_c" in ch2_trace["topology"]["nodes"]
    assert "node_d" in ch2_trace["topology"]["nodes"]
    assert len(ch2_trace["frames"]) >= 12
    compiled_channels = ch2_trace["frames"][0]["memory_snapshot"]["channel_values"]["__compiled_channels__"]
    assert any(v == "NamedBarrierValue" for v in compiled_channels.values())

    # Ch.4 must include both Run1 interrupt suspension and Run2 resume completion
    ch4_frames = bundle["probes"]["ch04_interrupt_replay"]["trace"]["frames"]
    assert any(
        f["node_statuses"].get("human_risk_gate") == "interrupted"
        for f in ch4_frames
    )
    ch4_out = bundle["probes"]["ch04_interrupt_replay"]["l0_view"]["output_state"]
    assert ch4_out["decision"] == "APPROVED_BY_CFO"

    # Ch.5 must demonstrate fork timeline boosting quality_score from 62 to 95
    ch5_l0 = bundle["probes"]["ch05_checkpoint_timetravel"]["l0_view"]
    assert ch5_l0["input_state"]["timeline_a_result"]["quality_score"] == 62
    assert ch5_l0["output_state"]["timeline_b_forked_result"]["quality_score"] == 95

    # Source slices must contain real line numbers, L2 AST folds, and Jedi local-variable links
    algo_slice = bundle["source_slices"]["pregel_algo"]
    assert sum(len(b["l2_folds"]) for b in algo_slice["blocks"]) >= 3
    local_links = [
        t for b in algo_slice["blocks"] for t in b["token_links"] if t["inferred_local"]
    ]
    assert any(t["token"] == "proc" and t["target_symbol"] == "langgraph.pregel._read.PregelNode" for t in local_links)


def test_maintainer_agent_evolution_partitioning(tmp_path: Path) -> None:
    (tmp_path / "content" / "concepts").mkdir(parents=True)
    (tmp_path / "content" / "graph").mkdir(parents=True)
    (tmp_path / "content" / "graph" / "public_graph.json").write_text(
        json.dumps({"nodes": [], "edges": []}), encoding="utf-8"
    )

    sample_clusters = [
        {
            "count": 4,
            "confusion_type": "prerequisite_python",
            "concept_id": "py-mapping-proxy",
            "selected_text": "MappingProxyType",
            "title": "MappingProxyType 只读字典视图",
            "distilled_answer": "防止运行期意外篡改底层不可变映射表。",
        },
        {
            "count": 5,
            "confusion_type": "langgraph_logic",
            "node_id": "insight_test_barrier",
            "chapter_id": "ch02_superstep_barrier",
            "target_ref": "_algo.py#L264",
            "title": "versions_seen 何时写入？",
            "distilled_answer": "在 apply_writes 屏障阶段开头写入。",
            "referenced_symbols": ["langgraph.checkpoint.base.Checkpoint"],
        },
    ]

    result = evolve_from_clusters(sample_clusters, tmp_path, min_count=3)
    assert "content/concepts/py-mapping-proxy.json" in result["created_concepts"]
    assert "insight_test_barrier" in result["created_insights"]
