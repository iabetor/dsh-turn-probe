# dsh-turn-probe

> Probe any single turn of a DeepSeek Harness session — browse the live lineage, select one Q&A turn, and get an AI deep-dive with evidence-backed insights.
>
> 探针式会话链路分析：浏览实时会话链路，选中任意一次问答（turn），获得 AI 深度诊断与可执行建议。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## What it does / 功能

A "Lineage" (链路) tab in the conversation view that lets you:

- **Browse the live lineage** — the current session and its subagents as a flat list; turns stream in real time while the model is running (event-driven via the DSH Conversation engine, same mechanism as the trajectory tab).
- **Select one turn** — click any Q&A turn to see its full content (user, tool calls, assistant replies) with a source / rendered-markdown preview toggle.
- **Probe it with AI** — one click runs a bounded model analysis of that exact turn: what the user wanted, what the agent did (tool-call sanity), whether it succeeded, and concrete improvement suggestions. The analysis runs in a throwaway session in the same workspace, so your conversation history stays untouched.

在会话视图中新增"链路"Tab，支持：

- **实时浏览会话链路**：当前会话与子代理扁平列出；对话进行中，轮次通过 DSH Conversation 引擎事件驱动实时流入（与轨迹 Tab 同机制）。
- **选中单轮**：点击任意一轮问答，查看完整内容（用户输入、工具调用、助手回复），支持"源码 / 渲染"双模式预览（复用 DSH 官方 Markdown 渲染器）。
- **AI 探针**：一键对**这一轮**做有界模型分析——用户诉求、助手行为（工具调用是否合理）、成败判断、改进建议。分析在**同工作区的临时会话**中执行，不污染你的对话历史。

## Why turn-level / 为什么只分析单轮

- **Token 精准**：只把选中的那一轮（用户 + 工具 + 助手）发给模型，不把整个会话灌进去。
- **洞察聚焦**：整段会话的"away summary / recap"已有其他插件；本插件定位为**单次问答的深度诊断**。
- **实时可见**：对话还在跑就能边看边分析，不等会话结束。

## Install / 安装

### From GitHub / 从 GitHub 安装

```bash
dsh plugin --profile <profile> add https://github.com/<you>/dsh-turn-probe
```

### From source / 从源码安装

```bash
git clone https://github.com/<you>/dsh-turn-probe
cd dsh-turn-probe
pnpm install
pnpm run build
dsh plugin --profile <profile> add .
```

Then restart the web instance (`dsh web`) and open any session → the "链路" (Lineage) tab appears next to 对话/轨迹.

重启 web 实例后，打开任意会话 → 在"对话/轨迹"旁出现"链路"Tab。

## Usage / 使用

1. Open a session and switch to the **链路** tab.
2. Expand a session row to see its turns (they update live while the model runs).
3. Click one turn — the right panel shows its full content.
4. Toggle **预览 / 源码** to view rendered markdown or raw text.
5. Click **分析** — the model analyzes that exact turn and returns the insight below.

1. 打开会话，切换到"链路"Tab。
2. 展开会话行查看轮次（模型运行时实时更新）。
3. 点击某一轮——右侧面板显示完整内容。
4. 切换"预览 / 源码"查看渲染结果或原始文本。
5. 点击"分析"——模型对**这一轮**做诊断并返回洞察。

## How it works / 实现要点

- **Live data**: registers `ConversationViewDefinition` + event Definitions with `ctx.uiConversation` (the Conversation engine); the view builder groups event nodes into turns by engine location — the same event-driven pipeline the trajectory tab uses.
- **Preview**: reuses `MarkdownText` from `@deepseek-ai/dsh-client-ui-primitives` (the same renderer the chat view uses), with a source/preview toggle.
- **Analysis**: creates a throwaway Session in the same workspace, sends the turn content with a bounded instruction, streams the reply, and leaves the analysis session in the list for inspection (the model may still be finishing).
- **No composer**: the view hides the DSH composer seat (read-only tab) and covers the width-handle strips, like the trajectory tab does.

- **实时数据**：向 `ctx.uiConversation` 注册 `ConversationViewDefinition` 与事件 Definition（Conversation 引擎）；视图 builder 按引擎解析的 location 把事件节点分组为轮次——与轨迹 Tab 同款事件驱动管线。
- **预览**：复用 `@deepseek-ai/dsh-client-ui-primitives` 的 `MarkdownText`（与聊天视图同一渲染器），支持源码/渲染切换。
- **分析**：在同工作区创建临时会话，发送单轮内容 + 有界指令，流式读取回复；分析会话保留在列表中供查看（模型可能仍在收尾）。
- **无输入框**：视图为只读，隐藏 DSH composer（与轨迹 Tab 一致），并覆盖宽度拖动手柄。

## Development / 开发

```bash
pnpm install
pnpm run build     # build the plugin bundle
pnpm run test      # vitest unit tests
pnpm run typecheck # tsc --noEmit
pnpm run lint      # oxlint
```

## License / 许可证

MIT
