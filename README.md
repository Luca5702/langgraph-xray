# LangGraph 源码伴读 — 活体源码思维画布 (Living Code Mind-Canvas)

> **默认留白聚焦，顺着好奇心向右自然生长 —— 面向彻底吃透 LangGraph 底层引擎的交互式源码思维画布与自演进知识图谱。**

📄 **完整产品与架构规范**：[docs/PRD.md](docs/PRD.md)

---

## 核心 UX 与架构亮点

1. **全画布统一 · 活体源码思维导图（Unified Living Code Mind-Canvas）**
   * 摒弃拥挤的多窗口 IDE 分栏，整个应用统一在一张温暖柔和的点阵纸感画布上：顶部与底部仅保留极简悬浮胶囊（关卡/视野切换、背景透镜与单步伴读呼吸胶囊）。
   * **默认做注意力的聚焦**：首屏仅聚焦当前关卡核心主干、当前步对应的伴读脉络分支（其余脉络折叠为安静胶囊）、**15 行聚焦源码切片卡** 与 **本幕运行脉搏卡**。
   * **点哪长哪，按需探索更大范围数据**：点击讲义或源码中的类名/变量向右生长出「手边结构卡」，点击虚线术语生长出「背景小抄卡」，点击 `+ 嫩芽` 自由追问 AI 派生子分支；随时可原位展开更多代码行、拉远切换 **「6 关全景知识森林」**，或呼出右侧 **「全量数据与源码探索抽屉」** 检视 600 行完整源码（`L0–L3` + 变量悬停内存显微镜）与全部 19 个底层类结构。

2. **100% 真实内核驱动（Build-Time Real Kernel）**
   * 以 Git Submodule 挂载官方 `langchain-ai/langgraph` 仓库（`v1.2.24` · `3e3dbd4`），通过无侵入钩子拦截真实 `SyncPregelLoop`（`tick` → `put_writes` → `after_tick`），对全部 **6 大通关探针图** 导出半步级内存快照。
   * 结合 Python `ast` + `inspect` + `jedi` 离线提取 **19 张核心静态类契约卡**、**L2 工程胶水自动折叠胶囊** 以及函数体内局部变量语义跳转坐标。

3. **正交背景知识透镜（Knowledge Lenses）**
   * 独立开关 `Python 语法`（内置按需加载的 **Pyodide WebAssembly 浏览器端 Python 运行器**，\$0 后端算力成本）、`Pregel 论文`（SIGMOD '10 原声与工程演进对照）与 `底层契约`。

4. **三层漏斗自演进（Sprout → Cluster → Crystallize）**
   * **L0 本地个人层**：探索分支实时存入浏览器 `IndexedDB`，自由发散零负担；
   * **L1 边缘聚类层**：Cloudflare Workers + D1 (`confusion_logs`) + Cron 定时聚合高频困惑；
   * **L2 自动提 PR 层**：GitHub Actions 运行 `Maintainer Agent` 自动沉淀公共图谱支线或新背景概念卡。

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

```bash
pnpm install

# 终端 1：启动本地 Cloudflare Workers + D1 SQLite 边缘 API (端口 8787)
pnpm dev:api

# 终端 2：启动前端活体源码思维画布 (端口 5173，自动代理 /api -> 8787)
pnpm dev:web
```
