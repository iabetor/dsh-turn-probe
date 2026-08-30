/**
 * Turn extraction from a session event stream.
 *
 * A turn is the unit between `turn/start` and `turn/end`. For each turn we
 * summarize the first user message, the assistant reply, and the tool-call
 * count — enough for a compact lineage row without loading full transcripts.
 */

/** One summarized turn of a session. */
export interface TurnSummary {
  /** Monotonic turn index (0-based). */
  index: number
  /** Seq of the turn/start event (window lower bound). */
  startSeq?: number
  /** Seq of the turn/end event (window upper bound). */
  endSeq?: number
  /** First user message text, truncated. */
  user?: string
  /** Assistant reply text, truncated. */
  assistant?: string
  /** Number of tool calls made during the turn. */
  toolCalls: number
  /** Start time (ms epoch). */
  startedAt?: number
  /** End time (ms epoch). */
  endedAt?: number
}

const TEXT_MAX = 120

function truncate(text: string): string {
  if (text.length <= TEXT_MAX) return text
  return `${text.slice(0, TEXT_MAX)}…`
}

/** Pull the first text block out of a message content array (or a string). */
function firstText(content: unknown): string | undefined {
  if (typeof content === 'string') return truncate(content)
  if (!Array.isArray(content)) return undefined
  for (const block of content) {
    if (block === null || typeof block !== 'object') continue
    const b = block as { type?: unknown; text?: unknown }
    if (b.type === 'text' && typeof b.text === 'string' && b.text.trim() !== '') {
      return truncate(b.text)
    }
  }
  return undefined
}

/** Pull the first text block WITHOUT truncation (full-content reads). */
function fullText(content: unknown): string | undefined {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return undefined
  for (const block of content) {
    if (block === null || typeof block !== 'object') continue
    const b = block as { type?: unknown; text?: unknown }
    if (b.type === 'text' && typeof b.text === 'string' && b.text.trim() !== '') {
      return b.text
    }
  }
  return undefined
}

/**
 * Fold a raw event list into turn summaries.
 *
 * Events are assumed ordered by seq. `turn/start` opens a turn, `turn/end`
 * closes it; messages and tool calls between them accumulate into the open
 * turn. An unterminated turn (live session) is still emitted.
 */
export function turnsOf(events: readonly unknown[]): TurnSummary[] {
  const turns: TurnSummary[] = []
  // Object container: TS control-flow analysis can't track assignments made
  // inside the `open` closure on a bare `let`, which collapses the variable
  // to `never` on every read after a call. A mutable slot keeps the type
  // stable across closure boundaries.
  const state: { current: TurnSummary | null } = { current: null }
  let turnIndex = 0

  const open = (): void => {
    if (state.current !== null) {
      // Defensive: a second turn/start without an end closes the previous.
      turns.push(state.current)
    }
    state.current = { index: turnIndex, toolCalls: 0 }
    turnIndex += 1
  }

  const lastSeq = (event: unknown): number | undefined => {
    if (event !== null && typeof event === 'object') {
      const s = (event as { seq?: unknown }).seq
      if (typeof s === 'number') return s
    }
    return undefined
  }

  for (const raw of events) {
    if (raw === null || typeof raw !== 'object') continue
    const event = raw as { type?: unknown; seq?: unknown; time?: unknown; data?: unknown }
    const data = (event.data ?? {}) as Record<string, unknown>
    switch (event.type) {
      case 'turn/start':
        open()
        if (state.current !== null) {
          state.current.startedAt = typeof event.time === 'number' ? event.time : undefined
          state.current.startSeq = lastSeq(event)
        }
        break
      case 'turn/end': {
        const closing: TurnSummary | null = state.current
        if (closing !== null) {
          closing.endedAt = typeof event.time === 'number' ? event.time : undefined
          closing.endSeq = lastSeq(event)
          turns.push(closing)
          state.current = null
        }
        break
      }
      case 'user/message': {
        if (state.current === null) open()
        const text = firstText(data.content)
        if (text !== undefined && state.current !== null && state.current.user === undefined) {
          state.current.user = text
        }
        break
      }
      case 'assistant/message': {
        if (state.current === null) open()
        const message = data.message as Record<string, unknown> | undefined
        const text = firstText(message?.content)
        if (text !== undefined && state.current !== null && state.current.assistant === undefined) {
          state.current.assistant = text
        }
        break
      }
      case 'tool/call':
        if (state.current === null) open()
        if (state.current !== null) state.current.toolCalls += 1
        break
      default:
        break
    }
  }
  if (state.current !== null) turns.push(state.current)
  return turns
}

/** Extract human-readable text from a turn window's events. */
export function turnTextOf(events: readonly unknown[]): string {
  const lines: string[] = []
  for (const raw of events) {
    if (raw === null || typeof raw !== 'object') continue
    const event = raw as { type?: unknown; data?: unknown; seq?: unknown }
    const data = (event.data ?? {}) as Record<string, unknown>
    switch (event.type) {
      case 'user/message': {
        const text = fullText(data.content)
        if (text !== undefined) lines.push(`用户: ${text}`)
        break
      }
      case 'assistant/message': {
        const message = data.message as Record<string, unknown> | undefined
        const text = fullText(message?.content)
        if (text !== undefined) lines.push(`助手: ${text}`)
        break
      }
      case 'tool/call': {
        const name = typeof data.name === 'string' ? data.name : '?'
        const args = typeof data.arguments === 'string' ? data.arguments : ''
        // Tool arguments can be huge; cap them to keep the preview sane.
        lines.push(`工具调用: ${name}(${args.slice(0, 2000)})`)
        break
      }
      case 'tool/result': {
        const ok = data.error !== true
        lines.push(`工具结果: ${ok ? '成功' : '失败'}`)
        break
      }
      default:
        break
    }
  }
  return lines.join('\n')
}
