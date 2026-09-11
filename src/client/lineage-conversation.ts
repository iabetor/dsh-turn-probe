/**
 * Real-time lineage data via the DSH Conversation engine.
 *
 * Each turn-related event is matched by a small Definition into a view Node;
 * the lineage view builder groups those Nodes by turn (from their engine
 * location) into a turn list. The engine pushes events live, so in-progress
 * turns stream into the view — same mechanism as the trajectory tab.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
// Type-only: pulls the ui-conversation Context merge (ctx.uiConversation).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'

/**
 * Minimal structural types of the DSH Conversation engine, declared locally
 * (the installed rc peer has no type exports for these; the runtime shapes
 * are stable across 0.1.1+ — the same contracts the trajectory tab compiles
 * against in the harness source).
 */

/** Engine-resolved location of one event. */
export type ConversationLocation =
  | { readonly kind: 'session' }
  | { readonly kind: 'turn'; readonly turn: { readonly turn: number } }
  | { readonly kind: 'step'; readonly turn: { readonly turn: number }; readonly step: { readonly step: number } }
  | { readonly kind: 'unresolved' }

/** One event accepted by a Definition, with its lifecycle role. */
export interface ConversationMatch {
  readonly event: SessionEvent
  readonly role: 'start' | 'update'
  readonly location: ConversationLocation
}

/** Start match carries the event plus role 'start'. */
export type ConversationStartMatch = ConversationMatch

/** Target-neutral identity returned by a business Definition. */
export interface ConversationViewNode {
  readonly key: string
  readonly kind: string
  readonly id: string
  readonly target: string
  readonly data: unknown
}

/** Immutable public view of an assembled business Context. */
export interface ConversationNodeContext<State = unknown> {
  readonly key: string
  readonly kind: string
  readonly id: string
  readonly matches: readonly ConversationMatch[]
  readonly start: ConversationStartMatch | undefined
  readonly state: State | undefined
  readonly current: ReadonlyMap<string, ConversationViewNode | null>
}

/** Strictly-backward Context lookup available while a start is evaluated. */
export interface ConversationContextReader {
  previous<State>(kind: string): { readonly state?: State } | undefined
}

/** Definition-local identity and lifecycle role extracted from one event. */
export interface ConversationMatchResult {
  readonly id: string
  readonly role: 'start' | 'update'
}

/** One independently registered business Event-to-Node state machine. */
export interface ConversationNodeDefinition<State = unknown> {
  readonly kind: string
  readonly target?: string
  match(event: SessionEvent): ConversationMatchResult | null
  start(
    context: ConversationNodeContext<State>,
    match: ConversationStartMatch,
    reader: ConversationContextReader,
  ): State
  update(
    context: ConversationNodeContext<State> & { readonly state: State },
    match: ConversationMatch,
  ): State
  publication?(match: ConversationMatch): 'none' | 'animation-frame' | 'immediate'
  buildViewNode?(context: ConversationNodeContext<State>): ConversationViewNode | null
}

/** Reference-stable Turn/Step facts published beside view Nodes. */
export interface ConversationTimelineSnapshot {
  readonly turnOrder: readonly number[]
  readonly turns: ReadonlyMap<number, unknown>
}

/** Per-Session incremental builder for one view target. */
export interface ConversationViewBuilder<Node extends ConversationViewNode = ConversationViewNode, Snapshot = unknown> {
  readonly empty: Snapshot
  replace(input: {
    readonly nodes: readonly Node[]
    readonly timeline: ConversationTimelineSnapshot
  }): Snapshot
  apply(input: {
    readonly upserts: readonly Node[]
    readonly timeline: ConversationTimelineSnapshot
  }): Snapshot
}

/** Registry contribution that creates one isolated view builder per Session. */
export interface ConversationViewDefinition<Node extends ConversationViewNode = ConversationViewNode, Snapshot = unknown> {
  readonly target: string
  create(): ConversationViewBuilder<Node, Snapshot>
}

/** One tool call captured by the builder. */
export interface LineageToolCall {
  readonly name?: string
  readonly args?: string
}

/** One content-bearing event of a turn, in engine seq order (timeline). */
export interface LineageTurnBlock {
  readonly kind: 'user' | 'assistant' | 'tool' | 'turn-start' | 'turn-end'
  /** Engine sequence number; ascending order = chronological order. */
  readonly seq: number
  /** User/assistant message text (full). */
  readonly text?: string
  /** Tool name (tool blocks only). */
  readonly name?: string
  /** Tool arguments JSON (tool blocks only). */
  readonly args?: string
}

/** One turn assembled by the lineage builder. */
export interface LineageTurn {
  /** Monotonic turn index (engine turn number, 1-based). */
  turn: number
  startSeq?: number
  endSeq?: number
  startedAt?: number
  endedAt?: number
  /** First user message text (truncated for the list row). */
  user?: string
  /** Assistant reply text (truncated). */
  assistant?: string
  /** All user messages of this turn (in seq order). */
  userFull: string[]
  /** All assistant replies of this turn (in seq order). */
  assistantFull: string[]
  /** All tool calls of this turn (in seq order). */
  tools: LineageToolCall[]
  /** Every content event of the turn in chronological (seq) order. */
  blocks: LineageTurnBlock[]
}

/** The lineage view snapshot: turns in engine order plus the running flag. */
export interface LineageSnapshot {
  readonly turns: readonly LineageTurn[]
  readonly running: boolean
}

// The engine's snapshot map is merge-extensible; a view target must declare
// its own row here or `binding.target('lineage')` resolves against an empty
// map and the key narrows to `never`. Mirrors ui-trajectory's own declaration.
declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ConversationViewSnapshotMap {
    /** Independently assembled data consumed by the Lineage view. */
    lineage: LineageSnapshot
  }
}

export const EMPTY_LINEAGE_SNAPSHOT: LineageSnapshot = {
  turns: [],
  running: false,
}

const TEXT_MAX = 120
function truncate(text: string): string {
  if (text.length <= TEXT_MAX) return text
  return `${text.slice(0, TEXT_MAX)}…`
}

function firstTextOf(content: unknown, trunc: (t: string) => string): string | undefined {
  if (typeof content === 'string') return trunc(content)
  if (!Array.isArray(content)) return undefined
  for (const block of content) {
    if (block === null || typeof block !== 'object') continue
    const b = block as { type?: unknown; text?: unknown }
    if (b.type === 'text' && typeof b.text === 'string' && b.text.trim() !== '') {
      return trunc(b.text)
    }
  }
  return undefined
}

function firstText(content: unknown): string | undefined {
  return firstTextOf(content, truncate)
}

function firstTextFull(content: unknown): string | undefined {
  return firstTextOf(content, t => t)
}

/** The turn number of a match location, when the engine resolved one. */
function turnOf(location: ConversationLocation | undefined): number | undefined {
  if (location === undefined || location.kind === 'unresolved' || location.kind === 'session') return undefined
  return location.turn.turn
}

/** Base data carried by one lineage view node. */
export interface LineageNodeData {
  kind: 'turn-start' | 'turn-end' | 'user' | 'assistant' | 'tool'
  turn?: number
  seq?: number
  time?: number
  text?: string
  fullText?: string
  toolName?: string
  toolArgs?: string
}

/** One lineage view node (target envelope consumed by the builder). */
export interface LineageViewNode extends ConversationViewNode {
  readonly target: 'lineage'
  readonly anchorSeq: number
  readonly location: ConversationLocation
  readonly data: LineageNodeData
}

function lineageNode(
  context: ConversationNodeContext,
  anchorSeq: number,
  data: LineageNodeData,
): LineageViewNode {
  return {
    key: context.key,
    kind: context.kind,
    id: context.id,
    target: 'lineage',
    anchorSeq,
    location: context.start?.location ?? { kind: 'unresolved' },
    data,
  }
}

/** Definition factory for one event type → lineage node. */
function definitionOf(
  kind: string,
  eventType: string,
  build: (event: SessionEvent) => LineageNodeData,
): ConversationNodeDefinition<LineageNodeData> {
  return {
    kind,
    target: 'lineage',
    match: event => event.type === eventType
      ? { id: String(event.seq), role: 'start' }
      : null,
    start: (_context, match) => {
      if (match.event.type !== eventType) {
        throw new Error(`${kind} start requires ${eventType}`)
      }
      return build(match.event)
    },
    update: (context: ConversationNodeContext<LineageNodeData> & { readonly state: LineageNodeData }) => context.state,
    buildViewNode: (context: ConversationNodeContext<LineageNodeData>) => context.state === undefined
      ? null
      : lineageNode(context, (context.state as LineageNodeData).seq ?? 0, context.state),
  }
}

/** All lineage event Definitions (one per turn-related event type). */
export const lineageDefinitions: readonly ConversationNodeDefinition<LineageNodeData>[] = [
  definitionOf('lineage-turn-start', 'turn/start', event => ({
    kind: 'turn-start',
    seq: event.seq,
    time: event.time,
    turn: (event as { data?: { turn?: number } }).data?.turn,
  })),
  definitionOf('lineage-turn-end', 'turn/end', event => ({
    kind: 'turn-end',
    seq: event.seq,
    time: event.time,
    turn: (event as { data?: { turn?: number } }).data?.turn,
  })),
  definitionOf('lineage-user', 'user/message', event => {
    const content = (event.data as { content?: unknown }).content
    return {
      kind: 'user',
      seq: event.seq,
      text: firstText(content),
      fullText: firstTextFull(content),
    }
  }),
  definitionOf('lineage-assistant', 'assistant/message', event => {
    const content = (event.data as { message?: { content?: unknown } }).message?.content
    return {
      kind: 'assistant',
      seq: event.seq,
      text: firstText(content),
      fullText: firstTextFull(content),
    }
  }),
  definitionOf('lineage-tool', 'tool/call', event => {
    const data = event.data as { name?: unknown; arguments?: unknown }
    return {
      kind: 'tool',
      seq: event.seq,
      toolName: typeof data.name === 'string' ? data.name : undefined,
      toolArgs: typeof data.arguments === 'string'
        ? data.arguments.slice(0, 2000)
        : undefined,
    }
  }),
]

/** The lineage view builder: groups event nodes into turns by location. */
class LineageViewBuilder implements ConversationViewBuilder<LineageViewNode, LineageSnapshot> {
  private readonly nodes = new Map<string, LineageViewNode>()
  readonly empty = EMPTY_LINEAGE_SNAPSHOT

  replace(input: {
    readonly nodes: readonly LineageViewNode[]
    readonly timeline: ConversationTimelineSnapshot
  }): LineageSnapshot {
    this.nodes.clear()
    for (const node of input.nodes) this.nodes.set(node.key, node)
    return this.snapshot()
  }

  apply(input: {
    readonly upserts: readonly LineageViewNode[]
    readonly timeline: ConversationTimelineSnapshot
  }): LineageSnapshot {
    for (const node of input.upserts) this.nodes.set(node.key, node)
    return this.snapshot()
  }

  private snapshot(): LineageSnapshot {
    const byTurn = new Map<number, LineageTurn>()
    // Node order isn't guaranteed across upserts, so sort each bucket by seq
    // before extracting the first/last items below.
    const pending = new Map<string, { turnNumber: number; data: LineageNodeData; seq: number }>()
    for (const node of this.nodes.values()) {
      const turnNumber = turnOf(node.location) ?? node.data.turn
      if (turnNumber === undefined) continue
      pending.set(`${node.key}:${node.data.kind}:${node.data.seq ?? 0}`, {
        turnNumber, data: node.data, seq: node.data.seq ?? 0,
      })
    }
    const ordered = [...pending.values()].sort((a, b) => a.seq - b.seq)
    for (const { turnNumber, data: d } of ordered) {
      let turn = byTurn.get(turnNumber)
      if (turn === undefined) {
        turn = { turn: turnNumber, userFull: [], assistantFull: [], tools: [], blocks: [] }
        byTurn.set(turnNumber, turn)
      }
      // Blocks carry a real seq; the pending map already defaults to 0.
      const seq = d.seq ?? 0
      switch (d.kind) {
        case 'turn-start':
          turn.startSeq = d.seq
          turn.startedAt = d.time
          break
        case 'turn-end':
          turn.endSeq = d.seq
          turn.endedAt = d.time
          break
        case 'user':
          if (d.text !== undefined && turn.user === undefined) turn.user = d.text
          if (d.fullText !== undefined) turn.userFull.push(d.fullText)
          if (d.fullText !== undefined) {
            turn.blocks.push({ kind: 'user', seq, text: d.fullText })
          }
          break
        case 'assistant':
          if (d.text !== undefined && turn.assistant === undefined) turn.assistant = d.text
          if (d.fullText !== undefined) turn.assistantFull.push(d.fullText)
          if (d.fullText !== undefined) {
            turn.blocks.push({ kind: 'assistant', seq, text: d.fullText })
          }
          break
        case 'tool':
          turn.tools.push({
            ...(d.toolName === undefined ? {} : { name: d.toolName }),
            ...(d.toolArgs === undefined ? {} : { args: d.toolArgs }),
          })
          turn.blocks.push({
            kind: 'tool',
            seq,
            ...(d.toolName === undefined ? {} : { name: d.toolName }),
            ...(d.toolArgs === undefined ? {} : { args: d.toolArgs }),
          })
          break
      }
    }
    const turns = [...byTurn.values()].sort((a, b) => a.turn - b.turn)
    // Running = any turn is still open (has a start but no end).
    const running = turns.some(t => t.startSeq !== undefined && t.endSeq === undefined)
    return { turns, running }
  }
}

/** The lineage view definition (registered via uiConversation.views). */
export const lineageViewDefinition: ConversationViewDefinition<LineageViewNode, LineageSnapshot> = {
  target: 'lineage',
  create: () => new LineageViewBuilder(),
}

/** Minimal ui-conversation face consumed by the registration. */
export interface UiConversationFace {
  events: { register(definition: ConversationNodeDefinition): unknown }
  views: { register(definition: ConversationViewDefinition): unknown }
  binding(sessionId: string): {
    // 'lineage' is a key of the ConversationViewSnapshotMap row declared
    // above, so the snapshot resolves to LineageSnapshot | undefined.
    target(target: 'lineage'): {
      getSnapshot(): LineageSnapshot | undefined
      subscribe(listener: () => void): () => void
    }
  }
}

/** Register the lineage definitions and view with the Conversation engine. */
export function registerLineageConversationView(ctx: Context & { uiConversation: UiConversationFace }): void {
  for (const definition of lineageDefinitions) {
    ctx.uiConversation.events.register(definition)
  }
  ctx.uiConversation.views.register(lineageViewDefinition)
}
