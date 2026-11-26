"""Non-invasive half-step TraceRecording hook for LangGraph SyncPregelLoop (1.2.x)."""

from __future__ import annotations

import inspect
from contextlib import contextmanager
from copy import deepcopy
from typing import Any, Callable

from langgraph._internal._constants import (
    CONF,
    CONFIG_KEY_CHECKPOINT_NS,
    CONFIG_KEY_SCRATCHPAD,
    INTERRUPT,
)
from langgraph.channels.base import BaseChannel, EmptyChannelError
from langgraph.pregel import _algo, _loop


def safe_json_value(val: Any, depth: int = 0) -> Any:
    """Deterministically serialize arbitrary runtime Python objects into clean JSON-safe structures."""
    if depth > 5:
        return repr(val)
    if val is None or isinstance(val, (bool, int, float, str)):
        return val
    if isinstance(val, (list, tuple, set, frozenset)):
        items = sorted(val, key=repr) if isinstance(val, (set, frozenset)) else list(val)
        return [safe_json_value(x, depth + 1) for x in items[:20]]
    if isinstance(val, dict):
        return {
            str(k): safe_json_value(v, depth + 1)
            for k, v in list(val.items())[:30]
            if not str(k).startswith("__pregel")
        }
    cls_name = type(val).__name__
    if hasattr(val, "_asdict"):
        d = val._asdict()
        return {k: safe_json_value(v, depth + 1) for k, v in d.items()}
    if hasattr(val, "__dict__") and cls_name in ("Send", "Command", "Interrupt", "GraphInterrupt"):
        return {
            "__type__": cls_name,
            **{
                k: safe_json_value(v, depth + 1)
                for k, v in vars(val).items()
                if not k.startswith("_")
            },
        }
    if hasattr(val, "value") and cls_name == "Interrupt":
        return {"__type__": "Interrupt", "value": safe_json_value(val.value, depth + 1)}
    return f"<{cls_name}>"


def snapshot_channels(channels: dict[str, BaseChannel]) -> dict[str, Any]:
    """Read available values from all live BaseChannel instances without mutating state."""
    out: dict[str, Any] = {}
    for name, ch in channels.items():
        try:
            if ch.is_available():
                out[name] = safe_json_value(ch.get())
        except EmptyChannelError:
            continue
        except Exception:
            out[name] = f"<{type(ch).__name__}:available>"
    return out


def find_func_lines(mod: Any, attr_path: str) -> tuple[str, str, list[int]]:
    """Return (repo_relative_file, func_qualname, [start_line, end_line]) from real vendor/langgraph."""
    obj = mod
    for part in attr_path.split("."):
        obj = getattr(obj, part)
    src_file = inspect.getsourcefile(obj) or ""
    rel_file = src_file.split("vendor/langgraph/")[-1] if "vendor/langgraph/" in src_file else src_file
    lines, start = inspect.getsourcelines(obj)
    # Highlight a focused window (first 32 lines of the function/method) for crisp UX scrolling
    end = min(start + len(lines) - 1, start + 34)
    return rel_file, attr_path, [start, end]


class PregelTraceRecorder:
    """Captures half-step (Plan -> Execute -> Apply Writes -> Checkpoint / Interrupt) frames from real SyncPregelLoop."""

    def __init__(self, chapter_id: str, langgraph_version: str) -> None:
        self.chapter_id = chapter_id
        self.langgraph_version = langgraph_version
        self.frames: list[dict[str, Any]] = []
        self._frame_seq = 0
        self._committed_nodes: set[str] = set()
        self._topology_nodes: list[str] = []
        self._topology_edges: list[list[str]] = []

        # Cache real source anchors from vendor/langgraph
        from langgraph.graph import state as state_mod

        self._anchors = {
            "compile": find_func_lines(state_mod, "StateGraph.compile"),
            "plan": find_func_lines(_algo, "prepare_next_tasks"),
            "triggers": find_func_lines(_algo, "_triggers"),
            "execute": find_func_lines(_loop, "SyncPregelLoop.put_writes"),
            "apply": find_func_lines(_algo, "apply_writes"),
            "tick_done": find_func_lines(_loop, "PregelLoop.tick"),
            "interrupt": find_func_lines(_loop, "PregelLoop.after_tick"),
        }

    def _next_id(self) -> int:
        fid = self._frame_seq
        self._frame_seq += 1
        return fid

    def record_compile_frame(self, compiled_graph: Any, custom_anchor: tuple[str, str, list[int]] | None = None) -> None:
        drawable = compiled_graph.get_graph()
        self._topology_nodes = list(drawable.nodes.keys())
        self._topology_edges = [[e.source, e.target] for e in drawable.edges]

        file_path, fn_name, hl = custom_anchor or self._anchors["compile"]
        channel_specs = {
            k: f"{type(v).__name__}"
            for k, v in getattr(compiled_graph, "channels", {}).items()
        }
        node_triggers = {
            name: list(proc.triggers)
            for name, proc in getattr(compiled_graph, "nodes", {}).items()
        }
        self.frames.append(
            {
                "frame_id": self._next_id(),
                "superstep": 0,
                "lifecycle_phase": "compile",
                "phase_label": "Compile · 编译构建通道与触发器",
                "source_anchor": {
                    "file": file_path,
                    "function": fn_name,
                    "highlight_lines": hl,
                },
                "node_statuses": {n: "idle" for n in self._topology_nodes},
                "memory_snapshot": {
                    "channel_values": {"__compiled_channels__": channel_specs},
                    "channel_versions": {},
                    "versions_seen": {n: {} for n in node_triggers},
                    "pending_writes": [],
                    "tasks_queue": [
                        {"name": n, "triggers": trigs, "input": {"subscribed_channels": list(compiled_graph.nodes[n].channels) if isinstance(compiled_graph.nodes[n].channels, list) else str(compiled_graph.nodes[n].channels)}}
                        for n, trigs in node_triggers.items()
                    ],
                    "scratchpad": {"compiled_node_count": len(node_triggers)},
                },
            }
        )

    def _build_node_statuses(
        self,
        planned_names: set[str] | None = None,
        active_names: set[str] | None = None,
        interrupted_names: set[str] | None = None,
    ) -> dict[str, str]:
        planned_names = planned_names or set()
        active_names = active_names or set()
        interrupted_names = interrupted_names or set()
        statuses: dict[str, str] = {}
        for n in self._topology_nodes:
            if n == "__start__":
                statuses[n] = "committed"
            elif n in interrupted_names:
                statuses[n] = "interrupted"
            elif n in active_names:
                statuses[n] = "active"
            elif n in planned_names:
                statuses[n] = "planned"
            elif n in self._committed_nodes:
                statuses[n] = "committed"
            else:
                statuses[n] = "idle"
        return statuses

    def _extract_scratchpad_info(self, loop_self: Any) -> dict[str, Any]:
        ns = loop_self.config.get(CONF, {}).get(CONFIG_KEY_CHECKPOINT_NS, "") or "root"
        pad_summary: dict[str, Any] = {
            "checkpoint_id": str(loop_self.checkpoint.get("id", ""))[:18],
            "checkpoint_ns": ns,
            "step": loop_self.step,
            "is_replaying": bool(getattr(loop_self, "is_replaying", False)),
        }
        task_pads: dict[str, Any] = {}
        for t in getattr(loop_self, "tasks", {}).values():
            sp = t.config.get(CONF, {}).get(CONFIG_KEY_SCRATCHPAD) if t.config else None
            if sp is not None:
                task_pads[t.name] = {
                    "resume_cache": safe_json_value(getattr(sp, "resume", [])),
                    "task_ns": t.config.get(CONF, {}).get(CONFIG_KEY_CHECKPOINT_NS, ""),
                }
        if task_pads:
            pad_summary["task_scratchpads"] = task_pads
        return pad_summary

    def _snapshot_loop(
        self,
        loop_self: Any,
        lifecycle_phase: str,
        phase_label: str,
        anchor: tuple[str, str, list[int]],
        statuses: dict[str, str],
        extra_pending: list[dict[str, Any]] | None = None,
    ) -> None:
        cp = loop_self.checkpoint
        tasks_list = [
            {
                "name": t.name,
                "triggers": [str(tr) for tr in t.triggers],
                "input": safe_json_value(t.input) if isinstance(t.input, dict) else {"value": safe_json_value(t.input)},
            }
            for t in getattr(loop_self, "tasks", {}).values()
        ]
        tid_to_name = {t.id: t.name for t in getattr(loop_self, "tasks", {}).values()}
        pending = []
        for tid, chan, val in getattr(loop_self, "checkpoint_pending_writes", []):
            pending.append(
                {
                    "task_name": tid_to_name.get(tid, str(tid)[:8]),
                    "channel": str(chan),
                    "value": safe_json_value(val),
                }
            )
        if extra_pending:
            pending.extend(extra_pending)

        self.frames.append(
            {
                "frame_id": self._next_id(),
                "superstep": int(loop_self.step),
                "lifecycle_phase": lifecycle_phase,
                "phase_label": phase_label,
                "source_anchor": {
                    "file": anchor[0],
                    "function": anchor[1],
                    "highlight_lines": anchor[2],
                },
                "node_statuses": deepcopy(statuses),
                "memory_snapshot": {
                    "channel_values": snapshot_channels(loop_self.channels),
                    "channel_versions": {str(k): (int(v) if isinstance(v, int) else str(v)) for k, v in cp.get("channel_versions", {}).items()},
                    "versions_seen": {
                        str(node): {str(ck): (int(cv) if isinstance(cv, int) else str(cv)) for ck, cv in seen.items()}
                        for node, seen in cp.get("versions_seen", {}).items()
                    },
                    "pending_writes": pending,
                    "tasks_queue": tasks_list,
                    "scratchpad": self._extract_scratchpad_info(loop_self),
                },
            }
        )

    @contextmanager
    def capture_execution(self, run_label: str = ""):
        """Temporarily wrap PregelLoop.tick, SyncPregelLoop.put_writes, and PregelLoop.after_tick."""
        orig_tick = _loop.PregelLoop.tick
        orig_after_tick = _loop.PregelLoop.after_tick
        orig_put_writes = _loop.SyncPregelLoop.put_writes

        recorder = self
        prefix = f"[{run_label}] " if run_label else ""

        def wrapped_tick(loop_self: Any) -> bool:
            has_more = orig_tick(loop_self)
            ns = loop_self.config.get(CONF, {}).get(CONFIG_KEY_CHECKPOINT_NS, "")
            ns_tag = f" (子图 {ns.split(':')[0]})" if ns else ""
            if has_more:
                planned = {t.name for t in loop_self.tasks.values()}
                recorder._snapshot_loop(
                    loop_self,
                    "superstep_plan",
                    f"{prefix}Step #{loop_self.step}{ns_tag} · Plan 唤醒判定与任务排期",
                    recorder._anchors["plan"],
                    recorder._build_node_statuses(planned_names=planned),
                )
            else:
                recorder._snapshot_loop(
                    loop_self,
                    "stream_or_interrupt",
                    f"{prefix}Step #{loop_self.step}{ns_tag} · Vote to Halt 全图无未见版本，收敛停机",
                    recorder._anchors["tick_done"],
                    recorder._build_node_statuses(),
                )
            return has_more

        def wrapped_put_writes(loop_self: Any, task_id: str, writes: Any, *, cached: bool = False) -> None:
            orig_put_writes(loop_self, task_id, writes, cached=cached)
            task = getattr(loop_self, "tasks", {}).get(task_id)
            if task is None:
                return
            ns = loop_self.config.get(CONF, {}).get(CONFIG_KEY_CHECKPOINT_NS, "")
            ns_tag = f" (子图 {ns.split(':')[0]})" if ns else ""
            channels_written = [str(c) for c, _ in writes]
            if INTERRUPT in channels_written:
                from langgraph import types as lg_types

                intr_anchor = find_func_lines(lg_types, "interrupt")
                recorder._snapshot_loop(
                    loop_self,
                    "stream_or_interrupt",
                    f"{prefix}Step #{loop_self.step}{ns_tag} · Interrupt! 节点 {task.name} 抛出 GraphInterrupt 挂起",
                    intr_anchor,
                    recorder._build_node_statuses(interrupted_names={task.name}),
                )
            else:
                active = {t.name for t in loop_self.tasks.values()}
                recorder._snapshot_loop(
                    loop_self,
                    "superstep_execute",
                    f"{prefix}Step #{loop_self.step}{ns_tag} · Execute 节点 {task.name} 写入私有缓冲 (尚未过屏障)",
                    recorder._anchors["execute"],
                    recorder._build_node_statuses(active_names=active),
                )

        def wrapped_after_tick(loop_self: Any) -> None:
            executed_names = {t.name for t in loop_self.tasks.values()}
            orig_after_tick(loop_self)
            recorder._committed_nodes.update(executed_names)
            ns = loop_self.config.get(CONF, {}).get(CONFIG_KEY_CHECKPOINT_NS, "")
            ns_tag = f" (子图 {ns.split(':')[0]})" if ns else ""
            recorder._snapshot_loop(
                loop_self,
                "superstep_apply_writes",
                f"{prefix}Step #{loop_self.step}{ns_tag} · Apply Writes 同步屏障合入与版本号递增",
                recorder._anchors["apply"],
                recorder._build_node_statuses(),
            )

        _loop.PregelLoop.tick = wrapped_tick  # type: ignore[assignment]
        _loop.SyncPregelLoop.put_writes = wrapped_put_writes  # type: ignore[assignment]
        _loop.PregelLoop.after_tick = wrapped_after_tick  # type: ignore[assignment]
        try:
            yield
        finally:
            _loop.PregelLoop.tick = orig_tick  # type: ignore[assignment]
            _loop.SyncPregelLoop.put_writes = orig_put_writes  # type: ignore[assignment]
            _loop.PregelLoop.after_tick = orig_after_tick  # type: ignore[assignment]

    def to_dict(self) -> dict[str, Any]:
        return {
            "chapter_id": self.chapter_id,
            "langgraph_version": self.langgraph_version,
            "topology": {
                "nodes": self._topology_nodes,
                "edges": self._topology_edges,
            },
            "frames": self.frames,
        }
