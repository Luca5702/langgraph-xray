# LangGraph X-Ray 🔬🕸️

> **主脊柱稳如 IDE 解剖台，探索顺如自动生长语义画布 —— 面向彻底吃透 LangGraph 底层引擎的三维白盒源码解剖台与自演进知识图谱系统。**

📄 **完整产品与架构规范**：[docs/PRD.md](docs/PRD.md)（v1.2 定稿版）

---

## 核心特性

1. **100% 真实内核驱动（Build-Time Real Kernel）**
   * 以 Git Submodule 挂载官方 `langchain-ai/langgraph` 仓库（`v1.2.24` · `3e3dbd4`），通过无侵入钩子拦截真实 `SyncPregelLoop`（`tick` $\rightarrow$ `put_writes` $\rightarrow$ `after_tick`），对全部 **6 大通关探针图** 导出半步级内存快照。
   * 结合 Python `ast` + `inspect` + `jedi` 离线提取 **19 张核心静态类契约卡**、**L2 工程胶水自动折叠胶囊** 以及 **函数体内局部变量（`proc`、`chan`、`task`、`scratchpad`）零跳转类型透视映射**。
2. **三挡无感变速工作台**
   * **🔬 一挡 · 聚焦解剖台**：顶栏双维架构 GPS（5 阶段生命周期轴 + 实时节点状态雷达）+ 左栏精读讲义 + 中栏 `L0~L3` 源码缩放视窗 + 右栏「手边器械盘（契约 $\times$ 当前帧实时值融合）」与 Pregel 超步内存沙盒。
   * **🕸️ 二挡 · 受控生长语义画布**：基于 `@xyflow/react + elkjs` 从左向右自动无重叠排布探索分支；一阶/二阶追问生成**实线演化树**，回答中涉及的底层类与理论卡自动挂载并拉出**虚线语义互链**，真正从“树”闭合成“知识图谱”。
   * **🗺️ 三挡 · 全局内核知识星图**：跨六关俯瞰 `BaseChannel`、`NamedBarrierValue`、`GraphInterrupt`、`CheckpointTuple` 与 *Google Pregel (2010)* 论文核心定理的耦合全貌。
3. **正交背景知识透镜（Knowledge Lens）**
   * 独立开关 `🐍 Python 高阶语法`（内置按需加载的 **Pyodide WebAssembly 浏览器端 Python 运行器**，\$0 后端算力成本）、`📄 Google Pregel 论文溯源`、`🔗 Runnable 控制面契约` 与一键 `⚡ 老手纯净模式`。
4. **三层漏斗自演进（Sprout $\rightarrow$ Cluster $\rightarrow$ Crystallize）**
   * **L0 本地个人层**：探索分支实时存入浏览器 `IndexedDB`，自由发散零负担；
   * **L1 边缘聚类层**：Cloudflare Workers + D1 (`confusion_logs`) + Cron 定时聚合高频困惑；
   * **L2 自动提 PR 层**：GitHub Actions 运行 `Maintainer Agent` 自动分流沉淀公共图谱支线或新背景概念卡。

---

## 六关通关课程矩阵

| 关卡 | 主题 | 核心解剖机制与真实内核路径 |
| :--- | :--- | :--- |
| **Ch.1** | 编译的魔法：`StateGraph` 如何变成 `Pregel` | `LastValue` vs `BinaryOperatorAggregate` 反射、`EphemeralValue` 边信标（`graph/state.py`） |
| **Ch.2** | Superstep 脉搏与版本号唤醒机制 | `A -> [B, C] -> D` 并行读隔离、`channel_versions > versions_seen`、`NamedBarrierValue` 汇聚屏障（`pregel/_algo.py`） |
| **Ch.3** | 打破静态拓扑：`Send` 与 `Command` 暗道 | `__pregel_tasks` (`Topic`) PUSH 动态裂变、`Command(update, goto)` 无边跳转（`types.py`, `pregel/_write.py`） |
| **Ch.4** | `interrupt()` 真相：异常冒泡与幂等重放 | `GraphInterrupt` 击穿调用栈、`pending_writes` 留存、`PregelScratchpad` 序号重放对表（`types.py`, `pregel/_loop.py`） |
| **Ch.5** | 时间旅行：Checkpointer 四大件剖析 | `CheckpointTuple` 单向父指针树、`update_state(..., as_node)` 分叉（Fork）重跑（`checkpoint/base/__init__.py`） |
| **Ch.6** | 子图嵌套与流式事件透传 | 父子双层 `SyncPregelLoop`、`checkpoint_ns` 命名空间隔离与 `subgraphs=True` 流透传（`pregel/_loop.py`） |

---

## 本地快速启动

### 1. 重新录制真实 Python 内核轨迹与符号索引（可选，产物已预构建入库）
```bash
uv sync --project tools/kernel-inspector
pnpm inspect:all
uv run --project tools/kernel-inspector pytest tools/kernel-inspector/tests -v
```

### 2. 启动本地双栈联调（Edge API + Web 工作台）
```bash
pnpm install

# 终端 1：启动本地 Cloudflare Workers + D1 SQLite 边缘 API (端口 8787)
pnpm dev:api

# 终端 2：启动前端三挡交互工作台 (端口 5173，自动代理 /api -> 8787)
pnpm dev:web
```

### 3. 生产构建与 Cloudflare 零保底费部署
```bash
# 构建静态前端资产 (apps/web/dist) -> 部署至 Cloudflare Pages
pnpm build

# 创建并初始化线上 Cloudflare D1 数据库 & 部署 Worker
cd apps/edge-api
npx wrangler d1 create langgraph-xray-d1
npx wrangler d1 execute langgraph-xray-d1 --remote --file=./drizzle/0000_init.sql
npx wrangler secret put GEMINI_API_KEY
npx wrangler deploy
```
