# dsh-turn-probe

> 探针式会话链路分析：浏览实时会话链路，选中任意一次问答（turn），获得 AI 深度诊断与可执行建议。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## 功能

在会话视图中新增"链路"Tab，支持：

- **实时浏览会话链路**：当前会话与子代理扁平列出；对话进行中，轮次通过 DSH Conversation 引擎事件驱动实时流入（与轨迹 Tab 同机制）。
- **选中单轮**：点击任意一轮问答，查看完整内容（用户输入、工具调用、助手回复），支持"源码 / 渲染"双模式预览（复用 DSH 官方 Markdown 渲染器）。
- **AI 探针**：一键对**这一轮**做有界模型分析——用户诉求、助手行为（工具调用是否合理）、成败判断、改进建议。分析在**同工作区的临时会话**中执行，不污染你的对话历史。

## 为什么只分析单轮

- **Token 精准**：只把选中的那一轮（用户 + 工具 + 助手）发给模型，不把整个会话灌进去。
- **洞察聚焦**：本插件定位为**单次问答的深度诊断**，聚焦一处，深入分析。
- **实时可见**：对话还在跑就能边看边分析，不等会话结束。

## 安装

### 从 GitHub 安装

```bash
dsh plugin --profile <profile> add https://github.com/iabetor/dsh-turn-probe
```

### 从源码安装

```bash
git clone https://github.com/iabetor/dsh-turn-probe
cd dsh-turn-probe
pnpm install
pnpm run build
dsh plugin --profile <profile> add .
```

重启 web 实例（`dsh web`）后，打开任意会话 → 在"对话/轨迹"旁出现"链路"Tab。

## 使用

1. 打开会话，切换到"链路"Tab。
2. 展开会话行查看轮次（模型运行时实时更新）。
3. 点击某一轮——右侧面板显示完整内容。
4. 切换"预览 / 源码"查看渲染结果或原始文本。
5. 点击"分析"——模型对**这一轮**做诊断并返回洞察。

## 实现要点

- **实时数据**：向 `ctx.uiConversation` 注册 `ConversationViewDefinition` 与事件 Definition（Conversation 引擎）；视图 builder 按引擎解析的 location 把事件节点分组为轮次——与轨迹 Tab 同款事件驱动管线。
- **预览**：复用 `@deepseek-ai/dsh-client-ui-primitives` 的 `MarkdownText`（与聊天视图同一渲染器），支持源码/渲染切换；预览块按引擎 seq 顺序展示真实时间线。
- **分析**：在同工作区创建临时会话，发送单轮内容 + 有界指令，流式读取回复；分析会话保留在列表中供查看（模型可能仍在收尾）。
- **无输入框**：视图为只读，隐藏 DSH composer（与轨迹 Tab 一致），并覆盖宽度拖动手柄。

## 开发

```bash
pnpm install
pnpm run build     # 构建插件 bundle
pnpm run test      # vitest 单元测试
pnpm run typecheck # tsc --noEmit
pnpm run lint      # oxlint
```

## 许可证

MIT
