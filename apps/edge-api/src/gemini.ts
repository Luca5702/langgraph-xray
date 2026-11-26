import {
  GEMINI_SPROUT_RESPONSE_JSON_SCHEMA,
  type GeminiSproutResponse,
  type KnowledgeLens,
} from "@langgraph-xray/schema";
import sourceContextData from "./generated/source_context.json";

export interface SproutRequestPayload {
  chapter_id: string;
  anchor_type: "tutorial_mdx" | "source_code" | "graph_node";
  target_ref: string;
  zoom_level: "L0" | "L1" | "L2" | "L3";
  superstep_frame_id?: number;
  active_lenses: KnowledgeLens[];
  selected_text: string;
  user_question: string;
  memory_summary?: string;
}

const chapterCacheRegistry = new Map<string, { name: string; expiresAt: number }>();

/**
 * Optionally registers chapter kernel source in Gemini Context Caching when above Gemini's minimum token threshold,
 * or returns null to inline seamlessly for compact chapter slices.
 */
async function tryGetGeminiCachedContent(
  baseUrl: string,
  apiKey: string,
  chapterId: string,
  sourceText: string
): Promise<string | null> {
  // Gemini Context Caching requires >= 32,768 tokens; for smaller slices inline systemInstruction is faster and cheaper
  if (sourceText.length < 110_000) {
    return null;
  }
  const existing = chapterCacheRegistry.get(chapterId);
  if (existing && existing.expiresAt > Date.now()) {
    return existing.name;
  }
  try {
    const resp = await fetch(`${baseUrl}/cachedContents?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "models/gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: sourceText }] }],
        ttl: "3600s",
      }),
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { name?: string };
    if (data.name) {
      chapterCacheRegistry.set(chapterId, {
        name: data.name,
        expiresAt: Date.now() + 50 * 60 * 1000,
      });
      return data.name;
    }
  } catch {
    return null;
  }
  return null;
}

export async function generateStructuredSprout(
  req: SproutRequestPayload,
  options: { apiKey?: string; aiGatewayBaseUrl?: string }
): Promise<{ response: GeminiSproutResponse; mode: "gemini_live" | "grounded_heuristic" }> {
  const chapterSource =
    (sourceContextData.chapter_sources as Record<string, string>)[req.chapter_id] ?? "";

  const apiKey = options.apiKey?.trim();
  if (apiKey) {
    const baseUrl = (
      options.aiGatewayBaseUrl?.trim() || "https://generativelanguage.googleapis.com/v1beta"
    ).replace(/\/$/, "");

    const cachedName = await tryGetGeminiCachedContent(
      baseUrl,
      apiKey,
      req.chapter_id,
      chapterSource
    );

    const lensHint =
      req.active_lenses.length > 0
        ? `读者已开启背景透镜：${req.active_lenses.join(", ")}。若涉及语法或论文概念，请给出简洁跨语言类比并关联对应 concept_id。`
        : "读者处于资深纯净模式，请直击底层源码机制与行号，无需基础语法铺垫。";

    const systemPrompt = [
      `你是 LangGraph X-Ray 的内核源码解剖导师（当前基准版本 langgraph ${sourceContextData.langgraph_version}, commit ${sourceContextData.vendor_commit}）。`,
      `严禁脱离下方真实源码编造逻辑！回答必须控制为精悍的图谱原子卡片（180字以内），明确引用真实文件名与行号。`,
      lensHint,
      `可引用的合法 Symbol IDs: ${sourceContextData.symbol_ids.join(", ")}`,
      `可引用的合法 Concept IDs: ${sourceContextData.concept_ids.join(", ")}`,
      cachedName ? "" : `\n【当前关卡真实源码切片】:\n${chapterSource}`,
    ].join("\n");

    const userPrompt = [
      `关卡: ${req.chapter_id} | 观测层级: ${req.zoom_level} | 锚点: ${req.target_ref}`,
      req.memory_summary ? `当前沙盒超步内存摘要: ${req.memory_summary}` : "",
      `读者划选内容: """${req.selected_text}"""`,
      `读者追问: ${req.user_question}`,
    ]
      .filter(Boolean)
      .join("\n");

    try {
      const resp = await fetch(
        `${baseUrl}/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(cachedName ? { cachedContent: cachedName } : {}),
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: "user", parts: [{ text: userPrompt }] }],
            generationConfig: {
              responseMimeType: "application/json",
              responseSchema: GEMINI_SPROUT_RESPONSE_JSON_SCHEMA,
              temperature: 0.2,
            },
          }),
        }
      );

      if (resp.ok) {
        const json = (await resp.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawText) {
          const parsed = JSON.parse(rawText) as GeminiSproutResponse;
          return { response: parsed, mode: "gemini_live" };
        }
      }
    } catch {
      // Fall through cleanly to grounded deterministic heuristic engine
    }
  }

  return {
    response: synthesizeGroundedHeuristic(req, chapterSource),
    mode: "grounded_heuristic",
  };
}

/**
 * Deterministic source-grounded analyzer used when running locally without GEMINI_API_KEY,
 * ensuring every interactive canvas sprout works out-of-the-box with accurate symbol & concept cross-links.
 */
function synthesizeGroundedHeuristic(
  req: SproutRequestPayload,
  chapterSource: string
): GeminiSproutResponse {
  const combined = `${req.selected_text} ${req.user_question}`.toLowerCase();

  if (combined.includes("barrier") || combined.includes("汇聚") || combined.includes("node_d") || combined.includes("全跑完")) {
    return {
      title: "多源扇入屏障 NamedBarrierValue",
      concise_markdown:
        "在 `channels/named_barrier_value.py:L13-L81` 中，`add_edge(['node_b', 'node_c'], 'node_d')` 编译生成 `NamedBarrierValue` 通道：每轮 `apply_writes` 往 `self.seen` 并入已完成前置节点名，仅当 `self.seen == self.names` 时 `is_available()` 才变真唤醒 `node_d`，并在消费后由 `consume()` 清零。",
      confusion_type: "langgraph_logic",
      referenced_symbols: [
        "langgraph.channels.named_barrier_value.NamedBarrierValue",
        "langgraph.channels.base.BaseChannel",
      ],
      referenced_concepts: ["pregel-superstep-barrier"],
      suggested_sparks: [
        { label: "如果 B 和 C 不在同一个超步完成，NamedBarrierValue 还能等齐吗？", dimension: "edge_case" },
        { label: "consume() 是在哪个函数第几行调用的？", dimension: "mechanism" },
      ],
    };
  }

  if (combined.includes("interrupt") || combined.includes("resume") || combined.includes("重放") || combined.includes("scratchpad")) {
    return {
      title: "GraphInterrupt 冒泡与序号对表",
      concise_markdown:
        "见 `types.py:L983-L1128`：`interrupt()` 通过 `PregelScratchpad.interrupt_counter()` 获取节点内递增索引 `idx`。首次无恢复值时抛出 `GraphInterrupt` 跳过屏障直接落盘 `pending_writes`；`Command(resume=...)` 重跑节点函数时按 `idx` 直接返回历史答案实现幂等穿越。",
      confusion_type: "langgraph_logic",
      referenced_symbols: [
        "langgraph.errors.GraphInterrupt",
        "langgraph._internal._scratchpad.PregelScratchpad",
        "langgraph.types.Command",
      ],
      referenced_concepts: ["py-exception-control-flow", "py-contextvar-isolation"],
      suggested_sparks: [
        { label: "如果在 interrupt() 之前写了随机数或 API 请求会发生什么？", dimension: "edge_case" },
        { label: "并行节点一个抛 GraphInterrupt 另一个成功，成功节点会重跑吗？", dimension: "mechanism" },
      ],
    };
  }

  if (combined.includes("send") || combined.includes("command") || combined.includes("push") || combined.includes("topic")) {
    return {
      title: "PUSH 任务队列与动态跳转暗道",
      concise_markdown:
        "`Send` 对象被写入内置 `__pregel_tasks`（`Topic` 通道），在 `_algo.py:L443` 的 `prepare_next_tasks` 开头优先消费，绕过全局 State 直接将 `Send.arg` 注入目标节点；而 `Command(update, goto)` 通过 `ChannelWrite` 同时拆解状态写入与 `branch:to:<goto>` 唤醒信标。",
      confusion_type: "langgraph_logic",
      referenced_symbols: [
        "langgraph.types.Send",
        "langgraph.types.Command",
        "langgraph.channels.topic.Topic",
      ],
      referenced_concepts: ["lc-channel-write-chaining"],
      suggested_sparks: [
        { label: "多个并发 Send 实例写回同一个字段时如何避免冲突？", dimension: "edge_case" },
        { label: "Command.PARENT 是如何跨子图跳转回父图节点的？", dimension: "mechanism" },
      ],
    };
  }

  if (combined.includes("annotated") || combined.includes("reducer") || combined.includes("operator.add")) {
    return {
      title: "Annotated 元数据与归约通道映射",
      concise_markdown:
        "Python `Annotated[list, operator.add]` 将 `operator.add` 存于 `__metadata__` 元组中；`StateGraph` 编译期通过 `get_type_hints(..., include_extras=True)` 提取算子并构造 `BinaryOperatorAggregate`（`channels/binop.py:L66`），在超步屏障按任务路径排序后确定性归约。",
      confusion_type: "prerequisite_python",
      referenced_symbols: ["langgraph.channels.binop.BinaryOperatorAggregate"],
      referenced_concepts: ["py-annotated-metadata", "pregel-combiners"],
      suggested_sparks: [
        { label: "如果想在某一轮清空 Annotated 列表而不是追加该怎么做？", dimension: "edge_case" },
        { label: "原版 Google Pregel 论文的 Combiner 与此有何异同？", dimension: "theory" },
      ],
    };
  }

  if (combined.includes("checkpoint") || combined.includes("fork") || combined.includes("update_state") || combined.includes("时间旅行")) {
    return {
      title: "不可变快照链表与时间线分叉",
      concise_markdown:
        "见 `checkpoint/base/__init__.py:L140`：每个 `CheckpointTuple` 通过 `parent_config` 指向前驱快照构成不可变树。`update_state(..., as_node)` 基于历史快照生成新 UUIDv6 `checkpoint_id` 并递增下游触发通道版本，使重跑仅唤醒下游节点。",
      confusion_type: "langgraph_logic",
      referenced_symbols: [
        "langgraph.checkpoint.base.CheckpointTuple",
        "langgraph.checkpoint.base.Checkpoint",
        "langgraph.checkpoint.base.BaseCheckpointSaver",
      ],
      referenced_concepts: ["pregel-checkpoint-fault-tolerance", "py-namedtuple-typeddict"],
      suggested_sparks: [
        { label: "Fork 分叉后原时间线 Timeline-A 的历史状态还能随时切回去读吗？", dimension: "mechanism" },
        { label: "pending_writes 在 CheckpointTuple 里扮演什么角色？", dimension: "edge_case" },
      ],
    };
  }

  // Extract first matching line from chapterSource for grounded context
  const firstMatchLine =
    chapterSource
      .split("\n")
      .find((ln) => req.selected_text && ln.includes(req.selected_text.slice(0, 16))) ??
    "pregel/_algo.py:L393 (prepare_next_tasks)";

  return {
    title: `源码机制锚定：${req.selected_text.slice(0, 10) || "核心执行步"}`,
    concise_markdown: `定位至源码 \`${req.target_ref}\`（匹配行 \`${firstMatchLine.slice(0, 58)}\`）：在 Pregel 超步状态机中，该逻辑服务于「Plan 拷贝只读快照 → Execute 写入任务私有 deque → Apply Writes 屏障统一更新 \`channel_versions\`」闭环，确保无中央调度器下的确定性收敛。`,
    confusion_type: "langgraph_logic",
    referenced_symbols: [
      "langgraph.pregel._read.PregelNode",
      "langgraph.checkpoint.base.Checkpoint",
    ],
    referenced_concepts: ["pregel-vote-to-halt", "py-generator-short-circuit"],
    suggested_sparks: [
      { label: "这一步在异常中断时会修改 versions_seen 账本吗？", dimension: "edge_case" },
      { label: "对比 Google Pregel 2010 论文原版设计有何演进？", dimension: "theory" },
    ],
  };
}
