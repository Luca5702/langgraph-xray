# LangGraph X-Ray 🔬🕸️

> **主脊柱稳如 IDE 解剖台，探索顺如自动生长语义画布 —— 面向彻底吃透 LangGraph 底层引擎的白盒源码解剖与自演进知识图谱系统。**

📄 **完整产品与架构规范**：[docs/PRD.md](docs/PRD.md)（v1.2 定稿版）

---

## 核心设计亮点

1. **零造假真实内核驱动（Build-Time Real Kernel）**：所有超步版本号递增、任务唤醒、静态类契约与局部变量类型推导，均在构建期挂载真实 `langgraph` 源码经确定性探针与 `AST + Jedi` 离线静态分析生成。
2. **双模态无感变速（Spine Workbench $\leftrightarrow$ Semantic Canvas）**：
   * **🔬 聚焦解剖台（一挡）**：顶栏双维 Mini Map + 左栏主线教程 + 中栏 `L0~L3` 源码去噪缩放与局部变量零跳转透视 + 右栏「手边静态契约器械盘」与 Pregel 半步级内存沙盒。
   * **🕸️ 受控生长语义画布（二挡）**：围绕任意源码锚点多方向发散追问，基于 `@xyflow/react + elkjs` 向右自动无重叠排布演化树，并自动跨节点虚线互链关联静态类与论文切片，让碎片问答自然闭合成知识图谱。
3. **正交知识透镜（Knowledge Lens）**：按读者背景开关 `🐍 Python 高阶语法`（含浏览器端 Pyodide 零成本微沙盒）与 `📄 Google Pregel (2010) 论文溯源`，老手零干扰、新手不跳页。
4. **三层漏斗自演进（Sprout $\rightarrow$ Cluster $\rightarrow$ Crystallize）**：本地 `IndexedDB` 承接个人无限自由发散 $\rightarrow$ Cloudflare D1 聚类社区高频困惑 $\rightarrow$ GitHub Actions Maintainer Agent 自动蒸馏 $\le 150$ 字原子图谱节点提交 PR。
5. **极致低成本云原生栈**：**Cloudflare (Pages + Workers + D1 + AI Gateway)** 零固定保底与免出站带宽费 + **Google Gemini 2.5 (Context Caching + Structured Outputs)** 精准源码锚定。

---

## Monorepo 目录结构

```text
langgraph-xray/
├── docs/PRD.md                 # 产品需求、交互形态与 5 大核心数据协议规范 (v1.2)
├── packages/schema/            # 前后端共用的 TypeScript 类型契约与 Gemini Structured Output Schema
├── tools/kernel-inspector/     # Python 3.12 (uv)：真实内核 Trace 录制器 & AST/Jedi 静态符号索引器
├── content/                    # Content-as-Code & Graph-as-Data 声明式内容库
│   ├── chapters/               # Ch.1 ~ Ch.6 主脊柱 MDX、探针定义与 folds.json
│   ├── concepts/               # 正交背景概念卡 (Pregel 论文桥接 & Python 语法微沙盒)
│   └── graph/                  # 经主编 PR 结晶合入的公共知识图谱节点与边
└── apps/
    ├── web/                    # 前端双模态工作台与语义生长画布 (Vite + React + @xyflow/react + ELK + CM6)
    └── edge-api/               # 边缘 API 与热力聚类任务 (Cloudflare Workers + Hono + Drizzle D1)
```
