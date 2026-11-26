"""AST + Inspect + Jedi static symbol blueprint & semantic token indexer over vendor/langgraph."""

from __future__ import annotations

import ast
import inspect
from pathlib import Path
from typing import Any

import jedi

from langgraph import errors, types
from langgraph._internal import _scratchpad as sp_mod
from langgraph.channels import (
    base as ch_base,
    binop as ch_binop,
    ephemeral_value as ch_ephem,
    last_value as ch_last,
    named_barrier_value as ch_barrier,
    topic as ch_topic,
)
from langgraph.checkpoint import base as cp_base
from langgraph.graph import state as graph_state
from langgraph.pregel import _algo, _loop, _read, _write


CURATED_SYMBOL_SPECS: list[dict[str, Any]] = [
    {
        "symbol_id": "langgraph.graph.state.StateGraph",
        "obj": graph_state.StateGraph,
        "kind": "class",
        "fields": [
            {"name": "nodes: dict[str, StateNodeSpec]", "type_repr": "dict[str, StateNodeSpec]", "duty_cn": "声明期注册的业务节点函数、输入 Schema 与重试/缓存策略", "live_key": "tasks_queue"},
            {"name": "edges: set[tuple[str, str]]", "type_repr": "set[tuple[str, str]]", "duty_cn": "静态有向边集合（包含单源边与多源扇入汇聚边）", "live_key": "channel_versions"},
            {"name": "branches: defaultdict[str, dict[str, BranchSpec]]", "type_repr": "dict[str, dict[str, BranchSpec]]", "duty_cn": "条件路由分支表（add_conditional_edges 注册的动态路由函数）", "live_key": "channel_versions"},
            {"name": "channels: dict[str, BaseChannel]", "type_repr": "dict[str, BaseChannel]", "duty_cn": "从 TypedDict/Pydantic State 反射提取出的底层通道规格表", "live_key": "channel_values"},
        ],
    },
    {
        "symbol_id": "langgraph.graph.state.CompiledStateGraph",
        "obj": graph_state.CompiledStateGraph,
        "kind": "class",
        "fields": [
            {"name": "nodes: dict[str, PregelNode]", "type_repr": "dict[str, PregelNode]", "duty_cn": "编译完成的可执行节点表（每个节点已绑定 triggers 与 ChannelWrite）", "live_key": "tasks_queue"},
            {"name": "channels: dict[str, BaseChannel]", "type_repr": "dict[str, BaseChannel]", "duty_cn": "包含用户状态通道 + 隐式边触发通道（如 branch:to:node_b）的完整通道表", "live_key": "channel_values"},
            {"name": "trigger_to_nodes: dict[str, list[str]]", "type_repr": "Mapping[str, Sequence[str]]", "duty_cn": "反向唤醒索引表：记录某通道更新后需要重点检查哪些候选节点", "live_key": "channel_versions"},
            {"name": "checkpointer: BaseCheckpointSaver | None", "type_repr": "BaseCheckpointSaver | None", "duty_cn": "可选持久化器（开启后支持 interrupt 挂起恢复与时间旅行分叉）", "live_key": "scratchpad"},
        ],
    },
    {
        "symbol_id": "langgraph.pregel._read.PregelNode",
        "obj": _read.PregelNode,
        "kind": "class",
        "fields": [
            {"name": "triggers: list[str]", "type_repr": "list[str]", "duty_cn": "唤醒触发器：任一通道最新版本号 > versions_seen[node] 即在本超步唤醒", "live_key": "tasks_queue"},
            {"name": "channels: list[str] | str", "type_repr": "list[str] | str", "duty_cn": "数据读取订阅源：启动前由 _proc_input 从这些通道拷贝私有输入快照", "live_key": "channel_values"},
            {"name": "writers: list[Runnable]", "type_repr": "list[ChannelWrite]", "duty_cn": "后置写入管道：将业务节点返回的 dict/Command 转化为通道写指令", "live_key": "pending_writes"},
            {"name": "bound: Runnable", "type_repr": "Runnable", "duty_cn": "包裹的用户节点可执行体（支持同步/异步函数或嵌套子图 Pregel）", "live_key": "tasks_queue"},
        ],
    },
    {
        "symbol_id": "langgraph.pregel._write.ChannelWrite",
        "obj": _write.ChannelWrite,
        "kind": "class",
        "fields": [
            {"name": "writes: list[ChannelWriteEntry | ChannelWriteTupleEntry | Send]", "type_repr": "Sequence[ChannelWriteEntry | Send]", "duty_cn": "静态字段映射器列表：把节点返回字典拆解为 (channel, value) 对", "live_key": "pending_writes"},
            {"name": "do_write(config, values)", "type_repr": "staticmethod", "duty_cn": "通过 config[CONFIG_KEY_SEND] 回调将写操作压入当前 Task 私有 deque 缓冲", "live_key": "pending_writes"},
        ],
    },
    {
        "symbol_id": "langgraph.channels.base.BaseChannel",
        "obj": ch_base.BaseChannel,
        "kind": "ABC",
        "fields": [
            {"name": "get() -> Value", "type_repr": "Callable[[], Value]", "duty_cn": "读取当前通道快照值（通道为空时抛出 EmptyChannelError）", "live_key": "channel_values"},
            {"name": "update(values: Sequence[Update]) -> bool", "type_repr": "Callable[[Sequence[Update]], bool]", "duty_cn": "超步屏障 apply_writes 阶段批量合入本轮所有写入；有状态更新返回 True", "live_key": "channel_versions"},
            {"name": "consume() -> bool", "type_repr": "Callable[[], bool]", "duty_cn": "触发型通道被消费后自清理钩子（如 NamedBarrierValue 清空已到达集合）", "live_key": "channel_versions"},
            {"name": "is_available() -> bool", "type_repr": "Callable[[], bool]", "duty_cn": "快速判定通道当前是否持有可读有效值", "live_key": "channel_values"},
        ],
        "subclasses_summary": [
            {"name": "LastValue", "behavior_diff_cn": "State 普通字段默认通道：同一超步最多允许 1 次写入，新值直接覆盖旧值（并发多写抛 InvalidUpdateError）"},
            {"name": "BinaryOperatorAggregate", "behavior_diff_cn": "Annotated[T, reducer] 对应通道：用二元归约函数（如 operator.add）按任务路径确定性顺序合并多分支并发写入"},
            {"name": "EphemeralValue", "behavior_diff_cn": "单跳边触发通道（如 branch:to:node_b）：当前超步写入、下一超步触发目标节点后立即自动清空"},
            {"name": "NamedBarrierValue", "behavior_diff_cn": "多源扇入汇聚屏障（如 join:b+c:d）：内部用 seen 集合攒齐 names 全集后才变为 available，被消费后立即清零"},
            {"name": "Topic", "behavior_diff_cn": "多值发布订阅队列（如 __pregel_tasks）：接收 Send 动态裂变任务包，支持单超步压入任意数量消息"},
        ],
    },
    {
        "symbol_id": "langgraph.channels.last_value.LastValue",
        "obj": ch_last.LastValue,
        "kind": "class",
        "fields": [
            {"name": "value: Value | Any", "type_repr": "Value", "duty_cn": "当前最新标量/对象值（初始为 MISSING 哨兵）", "live_key": "channel_values"},
            {"name": "update(values)", "type_repr": "bool", "duty_cn": "若 len(values) > 1 立即抛 InvalidUpdateError 防止并发写覆盖丢失", "live_key": "channel_versions"},
        ],
    },
    {
        "symbol_id": "langgraph.channels.binop.BinaryOperatorAggregate",
        "obj": ch_binop.BinaryOperatorAggregate,
        "kind": "class",
        "fields": [
            {"name": "value: Value", "type_repr": "Value", "duty_cn": "累积归约状态值（例如不断追加的日志或消息列表）", "live_key": "channel_values"},
            {"name": "operator: Callable[[Value, Value], Value]", "type_repr": "Callable", "duty_cn": "从 Annotated 元数据提取的二元合并算子（如 operator.add 或 add_messages）", "live_key": "channel_values"},
        ],
    },
    {
        "symbol_id": "langgraph.channels.named_barrier_value.NamedBarrierValue",
        "obj": ch_barrier.NamedBarrierValue,
        "kind": "class",
        "fields": [
            {"name": "names: set[Value]", "type_repr": "set[str]", "duty_cn": "必须全部到达才能放行的上游前置节点全集（如 {'node_b', 'node_c'}）", "live_key": "channel_versions"},
            {"name": "seen: set[Value]", "type_repr": "set[str]", "duty_cn": "目前已写入到达的前置节点集合；当 seen == names 时 is_available() 为真", "live_key": "channel_values"},
            {"name": "consume() -> bool", "type_repr": "bool", "duty_cn": "下游汇聚节点启动后清空 seen = set()，确保循环图中下轮可重新同步等待", "live_key": "channel_versions"},
        ],
    },
    {
        "symbol_id": "langgraph.channels.topic.Topic",
        "obj": ch_topic.Topic,
        "kind": "class",
        "fields": [
            {"name": "values: list[Value]", "type_repr": "list[Value]", "duty_cn": "本轮累积的消息队列（承载 __pregel_tasks 中的 Send 动态任务包）", "live_key": "tasks_queue"},
            {"name": "accumulate: bool", "type_repr": "bool", "duty_cn": "默认 False（每轮超步自动清空上一轮已消费的动态任务）", "live_key": "tasks_queue"},
        ],
    },
    {
        "symbol_id": "langgraph.channels.ephemeral_value.EphemeralValue",
        "obj": ch_ephem.EphemeralValue,
        "kind": "class",
        "fields": [
            {"name": "value: Value", "type_repr": "Value", "duty_cn": "仅存活一个超步的瞬态触发信标（如 branch:to:node_b），下轮空更新即擦除", "live_key": "channel_versions"},
            {"name": "guard: bool", "type_repr": "bool", "duty_cn": "控制是否限制同一超步内多次重复触发写入", "live_key": "channel_versions"},
        ],
    },
    {
        "symbol_id": "langgraph.types.PregelExecutableTask",
        "obj": types.PregelExecutableTask,
        "kind": "NamedTuple",
        "fields": [
            {"name": "name: str", "type_repr": "str", "duty_cn": "被排期执行的节点名称", "live_key": "tasks_queue"},
            {"name": "input: Any", "type_repr": "Any", "duty_cn": "Plan 阶段从订阅通道拷贝出的私有只读输入快照（保障并发读隔离）", "live_key": "tasks_queue"},
            {"name": "writes: deque[tuple[str, Any]]", "type_repr": "deque[tuple[str, Any]]", "duty_cn": "Execute 阶段暂存本节点产出的写操作队列，等屏障阶段统一提交", "live_key": "pending_writes"},
            {"name": "triggers: Sequence[str]", "type_repr": "Sequence[str]", "duty_cn": "唤醒本次任务的触发通道列表（用于屏障阶段更新 versions_seen）", "live_key": "tasks_queue"},
            {"name": "id: str", "type_repr": "str", "duty_cn": "由 checkpoint_id + step + path 确定性哈希生成的任务唯一 ID", "live_key": "scratchpad"},
        ],
    },
    {
        "symbol_id": "langgraph.types.Send",
        "obj": types.Send,
        "kind": "class",
        "fields": [
            {"name": "node: str", "type_repr": "str", "duty_cn": "动态派发的目标工作节点名（无需预先存在对应的静态输入状态键）", "live_key": "tasks_queue"},
            {"name": "arg: Any", "type_repr": "Any", "duty_cn": "直接注入给该目标节点实例的私有参数载荷（支持 Map-Reduce 分片）", "live_key": "tasks_queue"},
        ],
    },
    {
        "symbol_id": "langgraph.types.Command",
        "obj": types.Command,
        "kind": "class",
        "fields": [
            {"name": "update: Any | None", "type_repr": "dict[str, Any] | None", "duty_cn": "伴随跳转一同提交的状态通道增量更新字典", "live_key": "pending_writes"},
            {"name": "goto: Send | Sequence[Send | str] | str", "type_repr": "str | Send | Sequence", "duty_cn": "绕过静态边直接指定下一超步要唤醒的目标节点或 Send 任务", "live_key": "pending_writes"},
            {"name": "resume: dict[str, Any] | Any | None", "type_repr": "Any | None", "duty_cn": "恢复挂起图时注入给 interrupt() 调用点的返回值（支持多中断哈希字典）", "live_key": "scratchpad"},
            {"name": "graph: Literal['__parent__'] | None", "type_repr": "str | None", "duty_cn": "子图向父图跨层级跳转控制标示（Command.PARENT）", "live_key": "scratchpad"},
        ],
    },
    {
        "symbol_id": "langgraph.errors.GraphInterrupt",
        "obj": errors.GraphInterrupt,
        "kind": "class",
        "fields": [
            {"name": "args[0]: Sequence[Interrupt]", "type_repr": "Sequence[Interrupt]", "duty_cn": "携带挂起载荷冒泡跳出节点执行栈的控制流异常（继承自 GraphBubbleUp / BaseException）", "live_key": "pending_writes"},
        ],
    },
    {
        "symbol_id": "langgraph._internal._scratchpad.PregelScratchpad",
        "obj": sp_mod.PregelScratchpad,
        "kind": "class",
        "fields": [
            {"name": "interrupt_counter: LazyAtomicCounter", "type_repr": "Callable[[], int]", "duty_cn": "记录当前节点内部第几次调用 interrupt()，重放时按序号精确匹配历史恢复值", "live_key": "scratchpad"},
            {"name": "resume: list[Any]", "type_repr": "list[Any]", "duty_cn": "当前任务已解答的 interrupt 返回值有序缓存列表", "live_key": "scratchpad"},
            {"name": "get_null_resume: Callable[[bool], Any]", "type_repr": "Callable", "duty_cn": "消费最新传入的 Command(resume=...) 全局待恢复值并写入任务绑定缓存", "live_key": "scratchpad"},
            {"name": "subgraph_counter: LazyAtomicCounter", "type_repr": "Callable[[], int]", "duty_cn": "追踪同一节点内多次调用子图的命名空间递增序号", "live_key": "scratchpad"},
        ],
    },
    {
        "symbol_id": "langgraph.checkpoint.base.Checkpoint",
        "obj": cp_base.Checkpoint,
        "kind": "TypedDict",
        "fields": [
            {"name": "id: str", "type_repr": "str", "duty_cn": "单调时间序 UUIDv6 快照主键（决定时间旅行历史排序）", "live_key": "scratchpad"},
            {"name": "channel_values: dict[str, Any]", "type_repr": "dict[str, Any]", "duty_cn": "当前超步落盘的所有持久化通道数据载荷", "live_key": "channel_values"},
            {"name": "channel_versions: ChannelVersions", "type_repr": "dict[str, int | str]", "duty_cn": "全局通道最新版本号账本（每次有效 update 递增）", "live_key": "channel_versions"},
            {"name": "versions_seen: dict[str, ChannelVersions]", "type_repr": "dict[str, dict[str, int | str]]", "duty_cn": "每个节点上次成功执行时已消费过的触发通道版本快照", "live_key": "versions_seen"},
        ],
    },
    {
        "symbol_id": "langgraph.checkpoint.base.CheckpointTuple",
        "obj": cp_base.CheckpointTuple,
        "kind": "NamedTuple",
        "fields": [
            {"name": "config: RunnableConfig", "type_repr": "RunnableConfig", "duty_cn": "唯一定位该快照的坐标（含 thread_id、checkpoint_ns、checkpoint_id）", "live_key": "scratchpad"},
            {"name": "checkpoint: Checkpoint", "type_repr": "Checkpoint", "duty_cn": "核心状态通道值与版本矩阵字典", "live_key": "channel_values"},
            {"name": "metadata: CheckpointMetadata", "type_repr": "CheckpointMetadata", "duty_cn": "记录快照来源（input / loop / update / fork）与超步 step 编号", "live_key": "scratchpad"},
            {"name": "parent_config: RunnableConfig | None", "type_repr": "RunnableConfig | None", "duty_cn": "指向父快照的前向指针，串联起支持时间分叉（Fork）的快照树", "live_key": "scratchpad"},
            {"name": "pending_writes: list[PendingWrite] | None", "type_repr": "list[tuple[str, str, Any]] | None", "duty_cn": "超步中途因异常或 interrupt 未合入主快照的增量写记录", "live_key": "pending_writes"},
        ],
    },
    {
        "symbol_id": "langgraph.checkpoint.base.BaseCheckpointSaver",
        "obj": cp_base.BaseCheckpointSaver,
        "kind": "ABC",
        "fields": [
            {"name": "get_tuple(config) -> CheckpointTuple | None", "type_repr": "Method", "duty_cn": "在循环启动或时间旅行时加载指定 thread_id / checkpoint_id 的完整四元组", "live_key": "scratchpad"},
            {"name": "put(config, checkpoint, metadata, new_versions)", "type_repr": "Method", "duty_cn": "在每轮 apply_writes 屏障完成后持久化新超步快照", "live_key": "channel_versions"},
            {"name": "put_writes(config, writes, task_id, task_path)", "type_repr": "Method", "duty_cn": "在节点刚跑完（屏障前或抛 GraphInterrupt 时）实时保存任务级中间写入", "live_key": "pending_writes"},
        ],
    },
    {
        "symbol_id": "langgraph.pregel._loop.PregelLoop",
        "obj": _loop.PregelLoop,
        "kind": "class",
        "fields": [
            {"name": "step: int", "type_repr": "int", "duty_cn": "当前超步递增计数器（超上限 stop 抛出 GraphRecursionError）", "live_key": "scratchpad"},
            {"name": "tasks: dict[str, PregelExecutableTask]", "type_repr": "dict[str, PregelExecutableTask]", "duty_cn": "本轮 Plan 阶段选出的待并发执行活跃任务表", "live_key": "tasks_queue"},
            {"name": "checkpoint_pending_writes: list[PendingWrite]", "type_repr": "list[tuple[str, str, Any]]", "duty_cn": "暂存本轮已完成任务写入或挂起中断数据的内存缓冲区", "live_key": "pending_writes"},
            {"name": "updated_channels: set[str] | None", "type_repr": "set[str] | None", "duty_cn": "上一轮屏障合入后实际发生变更的通道集合，加速下一轮唤醒剪枝", "live_key": "channel_versions"},
        ],
    },
]


# Local variable & identifier heuristics backed by Jedi + AST context
LOCAL_TOKEN_SYMBOL_MAP: dict[str, str] = {
    "StateGraph": "langgraph.graph.state.StateGraph",
    "CompiledStateGraph": "langgraph.graph.state.CompiledStateGraph",
    "PregelNode": "langgraph.pregel._read.PregelNode",
    "proc": "langgraph.pregel._read.PregelNode",
    "proc_": "langgraph.pregel._read.PregelNode",
    "processes": "langgraph.pregel._read.PregelNode",
    "ChannelWrite": "langgraph.pregel._write.ChannelWrite",
    "BaseChannel": "langgraph.channels.base.BaseChannel",
    "channels": "langgraph.channels.base.BaseChannel",
    "chan": "langgraph.channels.base.BaseChannel",
    "LastValue": "langgraph.channels.last_value.LastValue",
    "BinaryOperatorAggregate": "langgraph.channels.binop.BinaryOperatorAggregate",
    "NamedBarrierValue": "langgraph.channels.named_barrier_value.NamedBarrierValue",
    "Topic": "langgraph.channels.topic.Topic",
    "tasks_channel": "langgraph.channels.topic.Topic",
    "EphemeralValue": "langgraph.channels.ephemeral_value.EphemeralValue",
    "PregelExecutableTask": "langgraph.types.PregelExecutableTask",
    "task": "langgraph.types.PregelExecutableTask",
    "tasks": "langgraph.types.PregelExecutableTask",
    "pushed": "langgraph.types.PregelExecutableTask",
    "Send": "langgraph.types.Send",
    "packet": "langgraph.types.Send",
    "Command": "langgraph.types.Command",
    "GraphInterrupt": "langgraph.errors.GraphInterrupt",
    "PregelScratchpad": "langgraph._internal._scratchpad.PregelScratchpad",
    "scratchpad": "langgraph._internal._scratchpad.PregelScratchpad",
    "Checkpoint": "langgraph.checkpoint.base.Checkpoint",
    "checkpoint": "langgraph.checkpoint.base.Checkpoint",
    "CheckpointTuple": "langgraph.checkpoint.base.CheckpointTuple",
    "BaseCheckpointSaver": "langgraph.checkpoint.base.BaseCheckpointSaver",
    "checkpointer": "langgraph.checkpoint.base.BaseCheckpointSaver",
    "PregelLoop": "langgraph.pregel._loop.PregelLoop",
    "SyncPregelLoop": "langgraph.pregel._loop.PregelLoop",
    "pending_writes": "langgraph.checkpoint.base.CheckpointTuple",
    "writes": "langgraph.pregel._write.ChannelWrite",
}

CLASS_NAMES = {
    "StateGraph",
    "CompiledStateGraph",
    "PregelNode",
    "ChannelWrite",
    "BaseChannel",
    "LastValue",
    "BinaryOperatorAggregate",
    "NamedBarrierValue",
    "Topic",
    "EphemeralValue",
    "PregelExecutableTask",
    "Send",
    "Command",
    "GraphInterrupt",
    "PregelScratchpad",
    "Checkpoint",
    "CheckpointTuple",
    "BaseCheckpointSaver",
    "PregelLoop",
    "SyncPregelLoop",
}


def extract_symbols() -> dict[str, dict[str, Any]]:
    """Build all SymbolBlueprint records from live vendor/langgraph source code."""
    symbols: dict[str, dict[str, Any]] = {}
    for spec in CURATED_SYMBOL_SPECS:
        obj = spec["obj"]
        src_file = inspect.getsourcefile(obj) or ""
        rel_file = src_file.split("vendor/langgraph/")[-1]
        lines, start_line = inspect.getsourcelines(obj)
        end_line = start_line + len(lines) - 1
        raw_excerpt = "".join(lines[:38]).rstrip()
        if len(lines) > 38:
            raw_excerpt += f"\n    # ... (共 {len(lines)} 行，详见 L3 源码视窗)"

        symbols[spec["symbol_id"]] = {
            "symbol_id": spec["symbol_id"],
            "name": obj.__name__,
            "kind": spec["kind"],
            "defined_in": {
                "file": rel_file,
                "start_line": start_line,
                "end_line": end_line,
            },
            "fields": spec["fields"],
            "subclasses_summary": spec.get("subclasses_summary", []),
            "raw_excerpt": raw_excerpt,
        }
    return symbols


# Focused real kernel source slices per file so learners inspect real vendor/langgraph code without loading 2,200-line monoliths all at once
KERNEL_SOURCE_SLICES: list[dict[str, Any]] = [
    {
        "slice_id": "state_compile",
        "chapter_ids": ["ch01_compile_magic"],
        "title": "StateGraph.compile & attach_edge / attach_branch",
        "mod": graph_state,
        "targets": ["StateGraph.compile", "CompiledStateGraph.attach_node", "CompiledStateGraph.attach_edge"],
        "l1_skeleton_code": (
            "def compile(self, checkpointer=None) -> CompiledStateGraph:\n"
            "    self.validate()\n"
            "    # 1. 将 State 字典字段映射为 LastValue 或 BinaryOperatorAggregate 通道\n"
            "    compiled = CompiledStateGraph(channels=self.channels.copy(), checkpointer=checkpointer, ...)\n"
            "    # 2. 为每个节点包裹 PregelNode (挂载订阅源与 ChannelWrite 写入器)\n"
            "    for key, node_spec in self.nodes.items():\n"
            "        compiled.attach_node(key, node_spec)\n"
            "    # 3. 将静态边编译为 EphemeralValue (单源) 或 NamedBarrierValue (多源扇入汇聚)\n"
            "    for start, end in self.edges:\n"
            "        compiled.attach_edge(start, end)\n"
            "    # 4. 将条件边编译为节点尾部的动态 ChannelWrite 路由分支\n"
            "    for start, branches in self.branches.items():\n"
            "        for name, branch in branches.items():\n"
            "            compiled.attach_branch(start, name, branch)\n"
            "    return compiled"
        ),
    },
    {
        "slice_id": "channels_core",
        "chapter_ids": ["ch01_compile_magic", "ch02_superstep_barrier"],
        "title": "LastValue · BinaryOperatorAggregate · NamedBarrierValue",
        "mod": ch_barrier,
        "targets": ["NamedBarrierValue"],
        "extra_mods": [(ch_last, "LastValue"), (ch_binop, "BinaryOperatorAggregate")],
        "l1_skeleton_code": (
            "# 1. LastValue: 单值覆盖通道（同超步禁止并发双写）\n"
            "class LastValue(BaseChannel):\n"
            "    def update(self, values: Sequence[Value]) -> bool:\n"
            "        if len(values) > 1: raise InvalidUpdateError('Concurrent write!')\n"
            "        self.value = values[-1]; return True\n\n"
            "# 2. BinaryOperatorAggregate: 二元归约通道 (Annotated[list, operator.add])\n"
            "class BinaryOperatorAggregate(BaseChannel):\n"
            "    def update(self, values: Sequence[Value]) -> bool:\n"
            "        for v in values: self.value = self.operator(self.value, v)\n"
            "        return True\n\n"
            "# 3. NamedBarrierValue: 扇入同步屏障 (集齐所有前置节点才放行)\n"
            "class NamedBarrierValue(BaseChannel):\n"
            "    def update(self, values: Sequence[str]) -> bool:\n"
            "        self.seen.update(values)  # 当 self.seen == self.names 时变为可读!\n"
            "    def consume(self) -> bool:\n"
            "        if self.seen == self.names: self.seen.clear(); return True"
        ),
    },
    {
        "slice_id": "pregel_algo",
        "chapter_ids": ["ch02_superstep_barrier", "ch03_send_and_command"],
        "title": "_algo.py · prepare_next_tasks / _triggers / apply_writes",
        "mod": _algo,
        "targets": ["apply_writes", "prepare_next_tasks", "prepare_single_task", "_triggers"],
        "l1_skeleton_code": (
            "def prepare_next_tasks(checkpoint, processes, channels, updated_channels):\n"
            "    tasks = []\n"
            "    # 1. PUSH 通道：消费 __pregel_tasks (Topic) 中动态投递的 Send 任务包\n"
            "    for idx, packet in enumerate(channels[TASKS].get_if_available()):\n"
            "        tasks.append(prepare_push_task_send(idx, packet, channels))\n"
            "    # 2. PULL 通道：仅唤醒存在 channel_versions[c] > versions_seen[node][c] 的节点\n"
            "    for name, proc in processes.items():\n"
            "        if any(channels[c].is_available() and versions[c] > seen[name].get(c, 0)\n"
            "               for c in proc.triggers):\n"
            "            private_input = _proc_input(proc, channels)  # 拷贝只读快照，隔离并发读写\n"
            "            tasks.append(PregelExecutableTask(name, private_input, proc, deque()))\n"
            "    return tasks\n\n"
            "def apply_writes(checkpoint, channels, tasks, get_next_version):\n"
            "    # 超步同步屏障：统一记录 versions_seen -> 消费屏障通道 -> 批量 update 并递增版本号\n"
            "    for t in tasks:\n"
            "        for ch in t.triggers: checkpoint['versions_seen'][t.name][ch] = checkpoint['channel_versions'][ch]\n"
            "    next_ver = get_next_version(max(checkpoint['channel_versions'].values(), default=0))\n"
            "    for ch, vals in group_writes_by_channel(tasks).items():\n"
            "        if channels[ch].update(vals): checkpoint['channel_versions'][ch] = next_ver"
        ),
    },
    {
        "slice_id": "pregel_loop",
        "chapter_ids": ["ch02_superstep_barrier", "ch04_interrupt_replay", "ch06_subgraph_streaming"],
        "title": "_loop.py · PregelLoop.tick / after_tick / SyncPregelLoop.put_writes",
        "mod": _loop,
        "targets": ["PregelLoop.tick", "PregelLoop.after_tick", "PregelLoop._prepare_tasks_and_emit_checkpoint", "SyncPregelLoop.put_writes"],
        "l1_skeleton_code": (
            "while loop.tick():  # 1. Plan 阶段：扫描触发器生成本轮并发任务队列\n"
            "    # 若 self.tasks 为空 -> 全员 Vote to Halt，status='done' 自然退出循环\n"
            "    # 2. Execute 阶段：PregelRunner 并发执行 self.tasks，结果暂存各任务私有 deque\n"
            "    runner.tick(loop.tasks.values())\n"
            "    #    若某节点中途调用 interrupt() -> 写入 INTERRUPT 记录并抛出 GraphInterrupt 跳过屏障!\n"
            "    # 3. Apply Writes 屏障阶段：全员无异常跑完后，统一合并写入并保存新 Checkpoint\n"
            "    loop.after_tick()"
        ),
    },
    {
        "slice_id": "send_command_write",
        "chapter_ids": ["ch03_send_and_command"],
        "title": "types.py & _write.py · Send / Command / ChannelWrite",
        "mod": types,
        "targets": ["Send", "Command"],
        "extra_mods": [(_write, "ChannelWrite._write"), (_write, "ChannelWrite.do_write")],
        "l1_skeleton_code": (
            "# 1. Send(node, arg): 向内置 TASKS ('__pregel_tasks') Topic 通道压入动态任务实例\n"
            "Send(node='worker_shard', arg={'shard_id': 'alpha'})\n\n"
            "# 2. Command(update=..., goto=..., resume=...): 节点直接返回状态增量 + 动态路由指令\n"
            "def map_command(cmd: Command) -> list[tuple[str, Any]]:\n"
            "    writes = list(cmd.update.items())\n"
            "    if isinstance(cmd.goto, Send):\n"
            "        writes.append(('__pregel_tasks', cmd.goto))\n"
            "    elif isinstance(cmd.goto, str):\n"
            "        writes.append((f'branch:to:{cmd.goto}', '__root__'))  # 直接点亮目标节点触发通道!\n"
            "    return writes"
        ),
    },
    {
        "slice_id": "interrupt_scratchpad",
        "chapter_ids": ["ch04_interrupt_replay"],
        "title": "types.py & errors.py · interrupt() 幂等重放与 GraphInterrupt",
        "mod": types,
        "targets": ["interrupt"],
        "extra_mods": [(errors, "GraphInterrupt"), (_algo, "_scratchpad")],
        "l1_skeleton_code": (
            "def interrupt(value: Any) -> Any:\n"
            "    conf = get_config()['configurable']\n"
            "    scratchpad = conf[CONFIG_KEY_SCRATCHPAD]\n"
            "    # 1. 原子递增当前节点内 interrupt() 调用序号 idx (0, 1, 2...)\n"
            "    idx = scratchpad.interrupt_counter()\n"
            "    # 2. 若在重放恢复中且历史缓存已有第 idx 个答案，直接原地返回，不抛异常!\n"
            "    if idx < len(scratchpad.resume):\n"
            "        return scratchpad.resume[idx]\n"
            "    # 3. 检查本轮新注入的 Command(resume=...) 值，命中则缓存并返回\n"
            "    if (v := scratchpad.get_null_resume(consume=True)) is not None:\n"
            "        scratchpad.resume.append(v)\n"
            "        return v\n"
            "    # 4. 首次遇到未决中断：立刻抛出 GraphInterrupt 冒泡终止当前超步!\n"
            "    raise GraphInterrupt([Interrupt(value=value, id=interrupt_id)])"
        ),
    },
    {
        "slice_id": "checkpoint_saver",
        "chapter_ids": ["ch05_checkpoint_timetravel", "ch06_subgraph_streaming"],
        "title": "checkpoint/base · Checkpoint / CheckpointTuple / BaseCheckpointSaver",
        "mod": cp_base,
        "targets": ["Checkpoint", "CheckpointTuple", "BaseCheckpointSaver.get_tuple", "BaseCheckpointSaver.put"],
        "l1_skeleton_code": (
            "class Checkpoint(TypedDict):\n"
            "    id: str                                     # 单调递增 UUIDv6\n"
            "    channel_values: dict[str, Any]              # 实际状态快照\n"
            "    channel_versions: dict[str, int]            # 全局通道最新版本号\n"
            "    versions_seen: dict[str, dict[str, int]]    # 各节点已消费版本号账本\n\n"
            "# 时间旅行与分叉 (Fork) 核心机制：\n"
            "# 1. get_state_history(thread_id) 逆序遍历 parent_config 链表\n"
            "# 2. update_state(past_cfg, patch, as_node='write_draft') 伪装指定节点写入，生成新分支 checkpoint_id\n"
            "# 3. invoke(None, forked_cfg) 仅唤醒版本号落后的下游节点重跑，上游历史零重复计算!"
        ),
    },
]


def _detect_l2_folds_in_block(code_lines: list[str], base_start_line: int) -> list[dict[str, Any]]:
    """Use AST over a function/class snippet (dedented) to generate genuine L2 semantic fold capsules."""
    import textwrap

    snippet = textwrap.dedent("".join(code_lines))
    folds: list[dict[str, Any]] = []
    try:
        tree = ast.parse(snippet)
    except SyntaxError:
        return folds

    for node in ast.walk(tree):
        # 1. Fold multi-line docstrings (>= 3 lines)
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)) and node.body:
            first_stmt = node.body[0]
            if (
                isinstance(first_stmt, ast.Expr)
                and isinstance(first_stmt.value, ast.Constant)
                and isinstance(first_stmt.value.value, str)
                and first_stmt.end_lineno
                and (first_stmt.end_lineno - first_stmt.lineno + 1) >= 3
            ):
                s = base_start_line + first_stmt.lineno - 1
                e = base_start_line + first_stmt.end_lineno - 1
                folds.append(
                    {
                        "start_line": s,
                        "end_line": e,
                        "category": "boilerplate",
                        "summary_label": f"已折叠 {e - s + 1} 行：Google-Style 参数与返回值文档注释",
                    }
                )

        # 2. Fold telemetry / debug stream `_emit(...)`, `DeltaChannel`, breakpoints, validation, or cache side-branches
        if isinstance(node, (ast.If, ast.For, ast.Try)) and node.end_lineno and (node.end_lineno - node.lineno + 1) >= 4:
            src_seg = "".join(code_lines[node.lineno - 1 : node.end_lineno])
            s = base_start_line + node.lineno - 1
            e = base_start_line + node.end_lineno - 1
            if "_emit(" in src_seg or "map_debug_" in src_seg or "output_writes" in src_seg:
                folds.append(
                    {
                        "start_line": s,
                        "end_line": e,
                        "category": "telemetry",
                        "summary_label": f"已折叠 {e - s + 1} 行：Stream / Debug 观测回调与事件发射",
                    }
                )
            elif "_exit_delta_writes" in src_seg or "_resume_loaded_writes" in src_seg or "DeltaChannel" in src_seg:
                folds.append(
                    {
                        "start_line": s,
                        "end_line": e,
                        "category": "async_compat",
                        "summary_label": f"已折叠 {e - s + 1} 行：DeltaChannel 增量累加与历史重放清理",
                    }
                )
            elif "cache_policy" in src_seg or "self.cache" in src_seg or "retry_policy" in src_seg:
                folds.append(
                    {
                        "start_line": s,
                        "end_line": e,
                        "category": "retry_policy",
                        "summary_label": f"已折叠 {e - s + 1} 行：CachePolicy / RetryPolicy 缓存与重试包装",
                    }
                )
            elif "validate(" in src_seg or "isinstance(" in src_seg and "TypeError" in src_seg or "ValueError" in src_seg:
                folds.append(
                    {
                        "start_line": s,
                        "end_line": e,
                        "category": "type_validation",
                        "summary_label": f"已折叠 {e - s + 1} 行：运行期类型契约与边界参数防御校验",
                    }
                )
            elif "drain_requested" in src_seg or "interrupt_before" in src_seg or "interrupt_after" in src_seg:
                folds.append(
                    {
                        "start_line": s,
                        "end_line": e,
                        "category": "boilerplate",
                        "summary_label": f"已折叠 {e - s + 1} 行：静态断点 (interrupt_before/after) 与排空检查",
                    }
                )

    # Deduplicate overlapping folds (keep outermost / non-overlapping sorted)
    folds.sort(key=lambda f: (f["start_line"], -(f["end_line"] - f["start_line"])))
    deduped: list[dict[str, Any]] = []
    last_end = -1
    for f in folds:
        if f["start_line"] > last_end:
            deduped.append(f)
            last_end = f["end_line"]
    return deduped


_JEDI_SCRIPT_CACHE: dict[str, jedi.Script] = {}


def _extract_tokens_with_jedi_and_ast(
    abs_file: str,
    code_lines: list[str],
    base_start_line: int,
    valid_symbol_ids: set[str],
) -> list[dict[str, Any]]:
    """Extract clickable class & local-variable token coordinates backed by Jedi + AST identifier scanning."""
    links: list[dict[str, Any]] = []
    if abs_file not in _JEDI_SCRIPT_CACHE:
        full_source = Path(abs_file).read_text(encoding="utf-8")
        _JEDI_SCRIPT_CACHE[abs_file] = jedi.Script(code=full_source, path=abs_file)
    jedi_script = _JEDI_SCRIPT_CACHE[abs_file]

    import io
    import tokenize

    seen_coords: set[tuple[int, int]] = set()
    resolved_per_name: dict[str, str] = {}
    reader = io.StringIO("".join(code_lines)).readline

    try:
        for tok in tokenize.generate_tokens(reader):
            if tok.type != tokenize.NAME:
                continue
            name = tok.string
            if name not in LOCAL_TOKEN_SYMBOL_MAP:
                continue
            real_line = base_start_line + tok.start[0] - 1
            col_start = tok.start[1]
            col_end = tok.end[1]
            if (real_line, col_start) in seen_coords:
                continue

            if name not in resolved_per_name:
                target_sym = LOCAL_TOKEN_SYMBOL_MAP[name]
                try:
                    for inf in jedi_script.infer(real_line, col_start):
                        full_name = getattr(inf, "full_name", "") or ""
                        if full_name in valid_symbol_ids:
                            target_sym = full_name
                            break
                except Exception:
                    pass
                resolved_per_name[name] = target_sym

            target_sym = resolved_per_name[name]
            if target_sym in valid_symbol_ids:
                seen_coords.add((real_line, col_start))
                links.append(
                    {
                        "line": real_line,
                        "col_start": col_start,
                        "col_end": col_end,
                        "token": name,
                        "target_symbol": target_sym,
                        "inferred_local": name not in CLASS_NAMES,
                    }
                )
    except tokenize.TokenError:
        pass

    return links


def build_source_slices(valid_symbol_ids: set[str]) -> list[dict[str, Any]]:
    """Extract authentic source blocks, AST L2 fold capsules, L1 skeletons, and Jedi token links."""
    slices_out: list[dict[str, Any]] = []

    for spec in KERNEL_SOURCE_SLICES:
        blocks: list[dict[str, Any]] = []
        target_pairs: list[tuple[Any, str]] = [(spec["mod"], t) for t in spec["targets"]]
        target_pairs.extend(spec.get("extra_mods", []))

        for mod, attr_path in target_pairs:
            obj = mod
            for part in attr_path.split("."):
                obj = getattr(obj, part)
            abs_file = inspect.getsourcefile(obj) or ""
            rel_file = abs_file.split("vendor/langgraph/")[-1]
            raw_lines, start_line = inspect.getsourcelines(obj)
            # Cap single method view to 125 lines max so UI stays ultra-snappy while preserving 100% real line numbers
            capped_lines = raw_lines[:125]
            end_line = start_line + len(capped_lines) - 1

            folds = _detect_l2_folds_in_block(capped_lines, start_line)
            token_links = _extract_tokens_with_jedi_and_ast(
                abs_file, capped_lines, start_line, valid_symbol_ids
            )

            blocks.append(
                {
                    "qualname": attr_path,
                    "file_path": rel_file,
                    "start_line": start_line,
                    "end_line": end_line,
                    "lines": [ln.rstrip("\n") for ln in capped_lines],
                    "l2_folds": folds,
                    "token_links": token_links,
                }
            )

        slices_out.append(
            {
                "slice_id": spec["slice_id"],
                "chapter_ids": spec["chapter_ids"],
                "title": spec["title"],
                "primary_file": blocks[0]["file_path"] if blocks else "",
                "l1_skeleton_code": spec["l1_skeleton_code"],
                "blocks": blocks,
            }
        )

    return slices_out
