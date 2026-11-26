"""CLI entrypoint for LangGraph X-Ray build-time kernel inspector & L2 maintainer."""

from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path
from typing import Any

from .maintainer import evolve_from_clusters
from .probes import ALL_PROBES, LANGGRAPH_VER
from .symbol_indexer import build_source_slices, extract_symbols


def get_repo_root() -> Path:
    return Path(__file__).resolve().parents[4]


def get_vendor_commit(repo_root: Path) -> str:
    vendor_dir = repo_root / "vendor" / "langgraph"
    try:
        out = subprocess.check_output(
            ["git", "-C", str(vendor_dir), "rev-parse", "--short", "HEAD"],
            text=True,
        ).strip()
        return out
    except Exception:
        return "pinned"


def build_all(repo_root: Path | None = None) -> dict[str, Any]:
    root = repo_root or get_repo_root()
    commit_sha = get_vendor_commit(root)

    # 1. Run all 6 real LangGraph kernel probes
    probe_results: dict[str, Any] = {}
    for chapter_id, probe_fn in ALL_PROBES.items():
        probe_results[chapter_id] = probe_fn()

    # 2. Extract authentic SymbolBlueprints & Jedi/AST source slices
    symbols = extract_symbols()
    slices = build_source_slices(set(symbols.keys()))
    slices_by_id = {s["slice_id"]: s for s in slices}

    # 3. Load declarative content (chapters, concepts, public graph)
    curriculum_path = root / "content" / "chapters" / "curriculum.json"
    chapters = json.loads(curriculum_path.read_text(encoding="utf-8"))

    concepts_dir = root / "content" / "concepts"
    concepts: dict[str, Any] = {}
    for p in sorted(concepts_dir.glob("*.json")):
        card = json.loads(p.read_text(encoding="utf-8"))
        concepts[card["concept_id"]] = card

    public_graph_path = root / "content" / "graph" / "public_graph.json"
    public_graph = json.loads(public_graph_path.read_text(encoding="utf-8"))

    # 4. Validate cross-references strictly
    all_valid_graph_targets = (
        {n["id"] for n in public_graph["nodes"]}
        | set(symbols.keys())
        | set(concepts.keys())
    )
    for edge in public_graph["edges"]:
        if edge["source"] not in all_valid_graph_targets:
            raise ValueError(f"Broken graph edge source: {edge['source']}")
        if edge["target"] not in all_valid_graph_targets:
            raise ValueError(f"Broken graph edge target: {edge['target']}")

    for ch in chapters:
        cid = ch["chapter_id"]
        if cid not in probe_results:
            raise ValueError(f"Missing probe recording for chapter: {cid}")
        for sid in ch["available_slice_ids"]:
            if sid not in slices_by_id:
                raise ValueError(f"Missing source slice {sid} for chapter {cid}")
        for sym_id in ch["default_pinned_symbols"]:
            if sym_id not in symbols:
                raise ValueError(f"Missing default pinned symbol {sym_id}")

    bundle = {
        "meta": {
            "langgraph_version": LANGGRAPH_VER,
            "vendor_commit": commit_sha,
            "chapter_count": len(chapters),
            "symbol_count": len(symbols),
            "concept_count": len(concepts),
        },
        "chapters": chapters,
        "probes": probe_results,
        "source_slices": slices_by_id,
        "symbols": symbols,
        "concepts": concepts,
        "public_graph": public_graph,
    }

    web_gen_dir = root / "apps" / "web" / "src" / "generated"
    web_gen_dir.mkdir(parents=True, exist_ok=True)
    (web_gen_dir / "kernel_bundle.json").write_text(
        json.dumps(bundle, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    # Also emit lightweight chapter source context for Cloudflare Worker Gemini Context Caching
    edge_context: dict[str, Any] = {
        "langgraph_version": LANGGRAPH_VER,
        "vendor_commit": commit_sha,
        "symbol_ids": list(symbols.keys()),
        "concept_ids": list(concepts.keys()),
        "chapter_sources": {},
    }
    for ch in chapters:
        cid = ch["chapter_id"]
        snippets = []
        for sid in ch["available_slice_ids"]:
            sl = slices_by_id[sid]
            for blk in sl["blocks"]:
                numbered = "\n".join(
                    f"{blk['start_line'] + idx}: {line}"
                    for idx, line in enumerate(blk["lines"][:60])
                )
                snippets.append(f"### {blk['file_path']} ({blk['qualname']})\n{numbered}")
        edge_context["chapter_sources"][cid] = "\n\n".join(snippets)

    api_gen_dir = root / "apps" / "edge-api" / "src" / "generated"
    api_gen_dir.mkdir(parents=True, exist_ok=True)
    (api_gen_dir / "source_context.json").write_text(
        json.dumps(edge_context, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    return bundle


def main() -> None:
    parser = argparse.ArgumentParser(description="LangGraph X-Ray Kernel Inspector CLI")
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("build-all", help="Execute all 6 real kernel probes, AST/Jedi indexers, and emit frontend/edge bundles")

    evolve_p = sub.add_parser("evolve", help="Run L2 Maintainer Agent over exported confusion clusters JSON")
    evolve_p.add_argument("--clusters-file", required=True, help="Path to exported D1 confusion clusters JSON")
    evolve_p.add_argument("--min-count", type=int, default=3)

    args = parser.parse_args()
    root = get_repo_root()

    if args.cmd == "build-all":
        bundle = build_all(root)
        meta = bundle["meta"]
        print(
            f"[OK] Built kernel_bundle.json | langgraph={meta['langgraph_version']} ({meta['vendor_commit']}) "
            f"| chapters={meta['chapter_count']} | symbols={meta['symbol_count']} | concepts={meta['concept_count']}"
        )
    elif args.cmd == "evolve":
        clusters = json.loads(Path(args.clusters_file).read_text(encoding="utf-8"))
        res = evolve_from_clusters(clusters, root, min_count=args.min_count)
        print(json.dumps(res, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
