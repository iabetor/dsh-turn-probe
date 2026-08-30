# dsh-turn-probe

> Probe any single turn of a DeepSeek Harness session — browse the live lineage, select one Q&A turn, and get an AI deep-dive with evidence-backed insights.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## What it does

A "Lineage" (链路) tab in the conversation view that lets you:

- **Browse the live lineage** — the current session and its subagents as a flat list; turns stream in real time while the model is running (event-driven via the DSH Conversation engine, the same mechanism the trajectory tab uses).
- **Select one turn** — click any Q&A turn to see its full content (user input, tool calls, assistant replies) with a source / rendered-markdown preview toggle (reuses the official DSH markdown renderer).
- **Probe it with AI** — one click runs a bounded model analysis of that exact turn: what the user wanted, what the agent did (tool-call sanity), whether it succeeded, and concrete improvement suggestions. The analysis runs in a throwaway session in the same workspace, so your conversation history stays untouched.

## Why turn-level

- **Token-efficient** — only the selected turn (user + tools + assistant) goes to the model, never the whole session.
- **Focused insight** — this plugin is scoped to a deep diagnosis of one Q&A exchange.
- **Live** — analyze a turn while the conversation is still running; no need to wait for the session to finish.

## Install

### From GitHub

```bash
dsh plugin --profile <profile> add https://github.com/iabetor/dsh-turn-probe
```

### From source

```bash
git clone https://github.com/iabetor/dsh-turn-probe
cd dsh-turn-probe
pnpm install
pnpm run build
dsh plugin --profile <profile> add .
```

Then restart the web instance (`dsh web`) and open any session — the "链路" (Lineage) tab appears next to 对话/轨迹.

## Usage

1. Open a session and switch to the **链路** tab.
2. Expand a session row to see its turns (they update live while the model runs).
3. Click one turn — the right panel shows its full content.
4. Toggle **预览 / 源码** to view rendered markdown or raw text.
5. Click **分析** — the model analyzes that exact turn and returns the insight below.

## How it works

- **Live data** — registers a `ConversationViewDefinition` and event Definitions with `ctx.uiConversation` (the Conversation engine); the view builder groups event nodes into turns by engine location, the same event-driven pipeline the trajectory tab uses.
- **Preview** — reuses `MarkdownText` from `@deepseek-ai/dsh-client-ui-primitives` (the same renderer the chat view uses), with a source/preview toggle; blocks render in engine seq order so tool calls appear where they actually happened.
- **Analysis** — creates a throwaway Session in the same workspace, sends the turn content with a bounded instruction, streams the reply, and leaves the analysis session in the list for inspection (the model may still be finishing).
- **No composer** — the view is read-only: it hides the DSH composer seat and covers the width-handle strips, like the trajectory tab does.

## Development

```bash
pnpm install
pnpm run build     # build the plugin bundle
pnpm run test      # vitest unit tests
pnpm run typecheck # tsc --noEmit
pnpm run lint      # oxlint
```

## License

MIT
