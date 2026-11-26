"""Deterministic 6-Chapter Python Probe Graphs for LangGraph X-Ray (Zero LLM Noise)."""

import operator
from importlib.metadata import version as pkg_version
from typing import Annotated, Any, Literal, TypedDict

from langgraph.checkpoint.memory import InMemorySaver
from langgraph.constants import END, START
from langgraph.graph import StateGraph
from langgraph.types import Command, Send, interrupt

from .recorder import PregelTraceRecorder, safe_json_value

LANGGRAPH_VER = pkg_version("langgraph")


class IntakeState(TypedDict):
    ticket_tier: str
    priority_score: int
    audit_log: Annotated[list[str], operator.add]


class BarrierState(TypedDict):
    count: int
    logs: Annotated[list[str], operator.add]


class MapReduceState(TypedDict):
    shards: list[str]
    processed: Annotated[list[str], operator.add]
    status: str


class ApprovalState(TypedDict):
    wire_amount: int
    decision: str
    events: Annotated[list[str], operator.add]


class EssayState(TypedDict):
    topic: str
    quality_score: int
    revisions: Annotated[list[str], operator.add]


class ChildResearchState(TypedDict):
    query: str
    findings: Annotated[list[str], operator.add]


class ParentSupervisorState(TypedDict):
    topic: str
    report: Annotated[list[str], operator.add]


def run_ch01_compile_magic() -> dict[str, Any]:
    """Ch.1: StateGraph -> CompiledStateGraph (Pregel) with LastValue + BinaryOperatorAggregate + conditional edge."""

    def classify_ticket(state: IntakeState) -> dict[str, Any]:
        score = 90 if state["ticket_tier"] == "enterprise" else 35
        return {"priority_score": score, "audit_log": [f"classified:{score}"]}

    def route_by_score(state: IntakeState) -> Literal["vip_lane", "standard_lane"]:
        return "vip_lane" if state["priority_score"] >= 80 else "standard_lane"

    def vip_lane(state: IntakeState) -> dict[str, Any]:
        return {"audit_log": ["routed:vip_fast_track"]}

    def standard_lane(state: IntakeState) -> dict[str, Any]:
        return {"audit_log": ["routed:standard_queue"]}

    builder = StateGraph(IntakeState)
    builder.add_node("classify_ticket", classify_ticket)
    builder.add_node("vip_lane", vip_lane)
    builder.add_node("standard_lane", standard_lane)
    builder.add_edge(START, "classify_ticket")
    builder.add_conditional_edges("classify_ticket", route_by_score)
    builder.add_edge("vip_lane", END)
    builder.add_edge("standard_lane", END)

    graph = builder.compile()
    rec = PregelTraceRecorder("ch01_compile_magic", LANGGRAPH_VER)
    rec.record_compile_frame(graph)

    initial_input: IntakeState = {
        "ticket_tier": "enterprise",
        "priority_score": 0,
        "audit_log": ["received"],
    }
    with rec.capture_execution():
        final_state = graph.invoke(initial_input)

    return {
        "trace": rec.to_dict(),
        "l0_view": {
            "probe_code": (
                "class IntakeState(TypedDict):\n"
                "    ticket_tier: str                              # -> LastValue 覆盖通道\n"
                "    priority_score: int                           # -> LastValue 覆盖通道\n"
                "    audit_log: Annotated[list[str], operator.add] # -> BinaryOperatorAggregate 归约通道\n\n"
                "builder = StateGraph(IntakeState)\n"
                "builder.add_node('classify_ticket', classify_ticket)\n"
                "builder.add_node('vip_lane', vip_lane)\n"
                "builder.add_node('standard_lane', standard_lane)\n"
                "builder.add_edge(START, 'classify_ticket')\n"
                "builder.add_conditional_edges('classify_ticket', route_by_score)\n"
                "graph = builder.compile()"
            ),
            "input_state": safe_json_value(initial_input),
            "output_state": safe_json_value(final_state),
        },
    }


def run_ch02_superstep_barrier() -> dict[str, Any]:
    """Ch.2: Diamond Fan-out / Fan-in A -> [B, C] -> D demonstrating BSP Superstep Barrier & NamedBarrierValue."""

    def node_a(state: BarrierState) -> dict[str, Any]:
        return {"count": state["count"] + 1, "logs": ["from_a"]}

    def node_b(state: BarrierState) -> dict[str, Any]:
        return {"logs": [f"b_saw_count_{state['count']}"]}

    def node_c(state: BarrierState) -> dict[str, Any]:
        return {"logs": [f"c_saw_count_{state['count']}"]}

    def node_d(state: BarrierState) -> dict[str, Any]:
        return {"count": state["count"] + 10, "logs": [f"d_merged_{len(state['logs'])}_items"]}

    builder = StateGraph(BarrierState)
    builder.add_node("node_a", node_a)
    builder.add_node("node_b", node_b)
    builder.add_node("node_c", node_c)
    builder.add_node("node_d", node_d)
    builder.add_edge(START, "node_a")
    builder.add_edge("node_a", "node_b")
    builder.add_edge("node_a", "node_c")
    builder.add_edge(["node_b", "node_c"], "node_d")
    builder.add_edge("node_d", END)

    graph = builder.compile()
    rec = PregelTraceRecorder("ch02_superstep_barrier", LANGGRAPH_VER)
    rec.record_compile_frame(graph)

    initial_input: BarrierState = {"count": 0, "logs": ["init"]}
    with rec.capture_execution():
        final_state = graph.invoke(initial_input)

    return {
        "trace": rec.to_dict(),
        "l0_view": {
            "probe_code": (
                "class BarrierState(TypedDict):\n"
                "    count: int\n"
                "    logs: Annotated[list[str], operator.add]\n\n"
                "builder = StateGraph(BarrierState)\n"
                "builder.add_edge(START, 'node_a')\n"
                "builder.add_edge('node_a', 'node_b')              # 扇出并行分支 1\n"
                "builder.add_edge('node_a', 'node_c')              # 扇出并行分支 2\n"
                "builder.add_edge(['node_b', 'node_c'], 'node_d')  # NamedBarrierValue 扇入汇聚屏障!\n"
                "builder.add_edge('node_d', END)\n"
                "graph = builder.compile()"
            ),
            "input_state": safe_json_value(initial_input),
            "output_state": safe_json_value(final_state),
        },
    }


def run_ch03_send_and_command() -> dict[str, Any]:
    """Ch.3: Dynamic Map-Reduce via Send (TASKS Topic channel) + Command(update=..., goto=...) topology bypass."""

    def plan_shards(state: MapReduceState) -> dict[str, Any]:
        return {"status": "dispatching"}

    def fanout_sends(state: MapReduceState) -> list[Send]:
        return [Send("worker_shard", {"shard_id": s}) for s in state["shards"]]

    def worker_shard(arg: dict[str, str]) -> dict[str, Any]:
        return {"processed": [f"done:{arg['shard_id']}"]}

    def inspect_and_jump(state: MapReduceState) -> Command[Literal["fast_commit", "audit_alert"]]:
        if len(state["processed"]) >= 2:
            return Command(update={"status": "command_jumped_to_commit"}, goto="fast_commit")
        return Command(update={"status": "insufficient"}, goto="audit_alert")

    def fast_commit(state: MapReduceState) -> dict[str, Any]:
        return {"processed": ["committed_via_command"]}

    def audit_alert(state: MapReduceState) -> dict[str, Any]:
        return {"processed": ["alert_triggered"]}

    builder = StateGraph(MapReduceState)
    builder.add_node("plan_shards", plan_shards)
    builder.add_node("worker_shard", worker_shard)
    builder.add_node("inspect_and_jump", inspect_and_jump)
    builder.add_node("fast_commit", fast_commit)
    builder.add_node("audit_alert", audit_alert)
    builder.add_edge(START, "plan_shards")
    builder.add_conditional_edges("plan_shards", fanout_sends, ["worker_shard"])
    builder.add_edge("worker_shard", "inspect_and_jump")
    builder.add_edge("fast_commit", END)
    builder.add_edge("audit_alert", END)

    graph = builder.compile()
    rec = PregelTraceRecorder("ch03_send_and_command", LANGGRAPH_VER)
    rec.record_compile_frame(graph)

    initial_input: MapReduceState = {
        "shards": ["shard_alpha", "shard_beta"],
        "processed": [],
        "status": "idle",
    }
    with rec.capture_execution():
        final_state = graph.invoke(initial_input)

    return {
        "trace": rec.to_dict(),
        "l0_view": {
            "probe_code": (
                "def fanout_sends(state: MapReduceState) -> list[Send]:\n"
                "    # 动态向 __pregel_tasks (Topic 通道) 投递任意数量 PUSH 任务\n"
                "    return [Send('worker_shard', {'shard_id': s}) for s in state['shards']]\n\n"
                "def inspect_and_jump(state: MapReduceState) -> Command[Literal['fast_commit', 'audit_alert']]:\n"
                "    # 同时携带状态更新与动态路由跳转，无需声明静态条件边函数\n"
                "    return Command(update={'status': 'command_jumped_to_commit'}, goto='fast_commit')"
            ),
            "input_state": safe_json_value(initial_input),
            "output_state": safe_json_value(final_state),
        },
    }


def run_ch04_interrupt_replay() -> dict[str, Any]:
    """Ch.4: interrupt() raises GraphInterrupt -> pending_writes saved -> Command(resume=...) replays node idempotently."""

    def stage_transfer(state: ApprovalState) -> dict[str, Any]:
        return {"events": [f"staged:${state['wire_amount']}"]}

    def human_risk_gate(state: ApprovalState) -> dict[str, Any]:
        verdict = interrupt({"prompt": "Approve wire?", "amount": state["wire_amount"]})
        return {"decision": str(verdict), "events": [f"gate_resolved:{verdict}"]}

    def execute_wire(state: ApprovalState) -> dict[str, Any]:
        return {"events": [f"settled:{state['decision']}"]}

    builder = StateGraph(ApprovalState)
    builder.add_node("stage_transfer", stage_transfer)
    builder.add_node("human_risk_gate", human_risk_gate)
    builder.add_node("execute_wire", execute_wire)
    builder.add_edge(START, "stage_transfer")
    builder.add_edge("stage_transfer", "human_risk_gate")
    builder.add_edge("human_risk_gate", "execute_wire")
    builder.add_edge("execute_wire", END)

    saver = InMemorySaver()
    graph = builder.compile(checkpointer=saver)
    rec = PregelTraceRecorder("ch04_interrupt_replay", LANGGRAPH_VER)
    rec.record_compile_frame(graph)

    config = {"configurable": {"thread_id": "tx-thread-04"}}
    initial_input: ApprovalState = {
        "wire_amount": 50000,
        "decision": "pending",
        "events": ["initiated"],
    }

    with rec.capture_execution("Run1·首次执行至挂起"):
        paused_state = graph.invoke(initial_input, config=config)

    with rec.capture_execution("Run2·Resume重放恢复"):
        final_state = graph.invoke(Command(resume="APPROVED_BY_CFO"), config=config)

    return {
        "trace": rec.to_dict(),
        "l0_view": {
            "probe_code": (
                "def human_risk_gate(state: ApprovalState) -> dict:\n"
                "    # 首次执行：抛出 GraphInterrupt 异常中断超步，节点返回值未合入 Channel\n"
                "    # Resume 恢复：节点从函数第 1 行重头重跑，scratchpad 命中缓存直接返回审批结果!\n"
                "    verdict = interrupt({'prompt': 'Approve wire?', 'amount': state['wire_amount']})\n"
                "    return {'decision': str(verdict), 'events': [f'gate_resolved:{verdict}']}\n\n"
                "# Phase 1: 触发中断挂起\n"
                "graph.invoke(initial_input, config=thread_cfg)\n"
                "# Phase 2: 注入恢复值重放\n"
                "graph.invoke(Command(resume='APPROVED_BY_CFO'), config=thread_cfg)"
            ),
            "input_state": safe_json_value({"run1_paused": paused_state}),
            "output_state": safe_json_value(final_state),
        },
    }


def run_ch05_checkpoint_timetravel() -> dict[str, Any]:
    """Ch.5: Checkpointer 4-tuple anatomy + historical checkpoint rewind + update_state Fork timeline."""

    def write_draft(state: EssayState) -> dict[str, Any]:
        return {"quality_score": 62, "revisions": [f"draft:{state['topic']}"]}

    def peer_review(state: EssayState) -> dict[str, Any]:
        tag = "publish_ready" if state["quality_score"] >= 85 else "needs_polish"
        return {"revisions": [f"review:{tag}(score={state['quality_score']})"]}

    builder = StateGraph(EssayState)
    builder.add_node("write_draft", write_draft)
    builder.add_node("peer_review", peer_review)
    builder.add_edge(START, "write_draft")
    builder.add_edge("write_draft", "peer_review")
    builder.add_edge("peer_review", END)

    saver = InMemorySaver()
    graph = builder.compile(checkpointer=saver)
    rec = PregelTraceRecorder("ch05_checkpoint_timetravel", LANGGRAPH_VER)
    rec.record_compile_frame(graph)

    base_cfg = {"configurable": {"thread_id": "timetravel-thread-05"}}
    initial_input: EssayState = {"topic": "Pregel-BSP", "quality_score": 0, "revisions": []}

    with rec.capture_execution("Timeline-A·原始时间线"):
        first_timeline = graph.invoke(initial_input, config=base_cfg)

    history = list(graph.get_state_history(base_cfg))
    after_draft_snapshot = next(s for s in history if s.next == ("peer_review",))

    forked_cfg = graph.update_state(
        after_draft_snapshot.config,
        {"quality_score": 95, "revisions": ["fork_injected_boost"]},
        as_node="write_draft",
    )

    with rec.capture_execution("Timeline-B·分叉重跑时间线"):
        forked_timeline = graph.invoke(None, config=forked_cfg)

    return {
        "trace": rec.to_dict(),
        "l0_view": {
            "probe_code": (
                "# 1. 跑完原始时间线 Timeline-A (score=62 -> needs_polish)\n"
                "graph.invoke({'topic': 'Pregel-BSP', 'quality_score': 0, 'revisions': []}, base_cfg)\n\n"
                "# 2. 从 Checkpointer 历史快照栈定位 write_draft 刚结束的时间点\n"
                "after_draft = next(s for s in graph.get_state_history(base_cfg) if s.next == ('peer_review',))\n\n"
                "# 3. 修改历史状态生成分叉 Checkpoint (Fork)，仅重跑下游 peer_review!\n"
                "forked_cfg = graph.update_state(after_draft.config, {'quality_score': 95}, as_node='write_draft')\n"
                "graph.invoke(None, config=forked_cfg)"
            ),
            "input_state": safe_json_value({"timeline_a_result": first_timeline}),
            "output_state": safe_json_value({"timeline_b_forked_result": forked_timeline}),
        },
    }


def run_ch06_subgraph_streaming() -> dict[str, Any]:
    """Ch.6: Compiled Subgraph nested inside Parent Node, isolating checkpoint_ns & streaming hierarchical events."""

    def fetch_papers(state: ChildResearchState) -> dict[str, Any]:
        return {"findings": [f"paper_on:{state['query']}"]}

    def distill_notes(state: ChildResearchState) -> dict[str, Any]:
        return {"findings": [f"distilled:{len(state['findings'])}"]}

    sub_builder = StateGraph(ChildResearchState)
    sub_builder.add_node("fetch_papers", fetch_papers)
    sub_builder.add_node("distill_notes", distill_notes)
    sub_builder.add_edge(START, "fetch_papers")
    sub_builder.add_edge("fetch_papers", "distill_notes")
    sub_builder.add_edge("distill_notes", END)
    compiled_subgraph = sub_builder.compile()

    def prepare_brief(state: ParentSupervisorState) -> dict[str, Any]:
        return {"report": [f"brief:{state['topic']}"]}

    def run_research_subgraph(state: ParentSupervisorState) -> dict[str, Any]:
        child_out = compiled_subgraph.invoke({"query": state["topic"], "findings": []})
        return {"report": [f"sub_returned:{','.join(child_out['findings'])}"]}

    def publish_report(state: ParentSupervisorState) -> dict[str, Any]:
        return {"report": ["published_ok"]}

    parent_builder = StateGraph(ParentSupervisorState)
    parent_builder.add_node("prepare_brief", prepare_brief)
    parent_builder.add_node("run_research_subgraph", run_research_subgraph)
    parent_builder.add_node("publish_report", publish_report)
    parent_builder.add_edge(START, "prepare_brief")
    parent_builder.add_edge("prepare_brief", "run_research_subgraph")
    parent_builder.add_edge("run_research_subgraph", "publish_report")
    parent_builder.add_edge("publish_report", END)

    saver = InMemorySaver()
    parent_graph = parent_builder.compile(checkpointer=saver)
    rec = PregelTraceRecorder("ch06_subgraph_streaming", LANGGRAPH_VER)
    rec.record_compile_frame(parent_graph)

    cfg = {"configurable": {"thread_id": "subgraph-thread-06"}}
    initial_input: ParentSupervisorState = {"topic": "BSP-Channels", "report": []}

    streamed_namespaces: list[str] = []
    with rec.capture_execution():
        for ns, _chunk in parent_graph.stream(
            initial_input, config=cfg, stream_mode="updates", subgraphs=True
        ):
            streamed_namespaces.append("/".join(ns) if ns else "root")
        final_state = parent_graph.get_state(cfg).values

    return {
        "trace": rec.to_dict(),
        "l0_view": {
            "probe_code": (
                "# 子图独立编译为 Pregel 实例，拥有隔离的私有 Channel 空间\n"
                "compiled_subgraph = sub_builder.compile()\n\n"
                "def run_research_subgraph(state: ParentSupervisorState) -> dict:\n"
                "    # 父图节点内部调用子图：自动继承 config 并派生 checkpoint_ns='run_research_subgraph:<task_id>'\n"
                "    child_out = compiled_subgraph.invoke({'query': state['topic'], 'findings': []})\n"
                "    return {'report': [f\"sub_returned:{','.join(child_out['findings'])}\"]}\n\n"
                "for ns, chunk in parent_graph.stream(input_data, cfg, stream_mode='updates', subgraphs=True):\n"
                "    print(ns, chunk)  # 透传父子两级命名空间流事件!"
            ),
            "input_state": safe_json_value(initial_input),
            "output_state": safe_json_value({**final_state, "streamed_namespaces": streamed_namespaces}),
        },
    }


ALL_PROBES = {
    "ch01_compile_magic": run_ch01_compile_magic,
    "ch02_superstep_barrier": run_ch02_superstep_barrier,
    "ch03_send_and_command": run_ch03_send_and_command,
    "ch04_interrupt_replay": run_ch04_interrupt_replay,
    "ch05_checkpoint_timetravel": run_ch05_checkpoint_timetravel,
    "ch06_subgraph_streaming": run_ch06_subgraph_streaming,
}
