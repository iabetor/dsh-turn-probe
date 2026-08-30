/**
 * Model-driven turn analysis.
 *
 * Runs the selected turn's content through the harness agent pipeline by
 * creating a throwaway Session, prompting it with the analysis request, and
 * streaming the reply back. The throwaway session is intentionally left in
 * the list: the model may still be producing a reply after we read the first
 * message, and deleting a running session is rejected by the harness.
 */

import { serviceOf } from './events.ts'
import type { TurnSummary } from './turns.ts'
import type { SessionTreeNode } from './tree.ts'

/** Text content part as the harness prompt expects it. */
interface PromptTextPart {
  type: 'text'
  text: string
}

/** Minimal faces of the session service and remote session as consumed here. */
interface SessionServiceFace {
  create?(opts?: { workspaceId?: string; cwd?: string }): Promise<unknown>
  delete?(sessionId: string): Promise<unknown>
  binding?(sessionId: string): { session?: SessionBindingFace } | undefined
}
interface WorkspacesFace {
  list?: {
    getSnapshot?(): { items?: readonly WorkspaceViewFace[] }
  }
}
interface WorkspaceViewFace {
  workspaceId: string
  sessionIds?: readonly string[]
}
interface SessionBindingFace {
  beginSubmission?(input: { content: PromptTextPart[] }): { requestId: string; abandon(): void }
  prompt?(
    content: PromptTextPart[],
    mode: 'queue' | 'steer',
    signal?: AbortSignal,
    requestId?: string,
  ): Promise<unknown>
}
interface RemoteSessionFace {
  follow?(request: { address: unknown; maxMessages?: number }, signal?: AbortSignal): AsyncIterable<unknown>
}

/** Analysis instruction prefix. */
const INSTRUCT = [
  '你是 DSH 的会话链路分析助手。',
  '下面是一次对话轮次（turn）的完整内容，包含用户输入、工具调用和助手回复。',
  '请分析这次问答：1) 用户想解决什么问题；2) 助手做了什么（工具调用是否合理）；',
  '3) 结果是否成功，如果失败原因是什么；4) 给出改进建议。',
  '用简洁的中文回答，分点列出。',
  '',
  '===== 对话内容 =====',
  '',
].join('\n')

/** Build the analysis prompt text for one turn. */
export function analysisPrompt(turnContent: string): string {
  return `${INSTRUCT}${turnContent}`
}

/** Extract text from one reply record for display (assistant/message). */
export function replyTextOf(rows: readonly unknown[]): string {
  const parts: string[] = []
  for (const row of rows) {
    if (row === null || typeof row !== 'object') continue
    const r = row as { type?: unknown; event?: unknown }
    if (r.type !== 'event') continue
    const event = r.event as { type?: unknown; data?: unknown } | undefined
    if (event === null || typeof event !== 'object') continue
    if (event.type !== 'assistant/message') continue
    const data = (event.data ?? {}) as { message?: { content?: unknown } }
    const content = data.message?.content
    if (typeof content === 'string') {
      parts.push(content)
      continue
    }
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block !== null && typeof block === 'object') {
          const b = block as { type?: unknown; text?: unknown }
          if (b.type === 'text' && typeof b.text === 'string') parts.push(b.text)
        }
      }
    }
  }
  return parts.join('\n')
}

/** Log a diagnostic message (console.warn is always allowed in debug builds). */
// eslint-disable-next-line no-console
const warn = (...args: unknown[]): void => console.warn('[dsh-turn-probe]', ...args)

/** Await a promise but settle with undefined after `ms` when it hangs. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(undefined), ms)
    promise.then(
      value => { clearTimeout(timer); resolve(value) },
      () => { clearTimeout(timer); resolve(undefined) },
    )
  })
}

/**
 * Run a model analysis of one turn's content in a throwaway session.
 * Returns the assistant reply text, or undefined on failure.
 */
export async function analyzeTurn(
  ctx: { get(name: string): unknown },
  node: SessionTreeNode,
  turn: TurnSummary,
  turnContent: string,
  signal?: AbortSignal,
): Promise<string | undefined> {
  const sessions = ctx.get('sessions') as SessionServiceFace | undefined
  if (sessions === undefined || typeof sessions.create !== 'function') {
    warn('analyzeTurn early-out: sessions service missing or no create()')
    return undefined
  }
  const remote = serviceOf(ctx, 'remote.session') as RemoteSessionFace | undefined

  let sessionId: string | undefined
  try {
    // Find the workspace the analyzed session belongs to, so the throwaway
    // analysis session is grouped alongside it instead of landing Ungrouped.
    const workspaces = ctx.get('workspaces') as WorkspacesFace | undefined
    let workspaceId: string | undefined
    const items = workspaces?.list?.getSnapshot?.()?.items
    if (Array.isArray(items)) {
      for (const view of items) {
        if (view.sessionIds?.includes(node.sessionId)) {
          workspaceId = view.workspaceId
          break
        }
      }
    }
    const candidate = await sessions.create(
      workspaceId !== undefined ? { workspaceId } : { cwd: node.cwd ?? undefined },
    )
    if (typeof candidate !== 'string') {
      warn('analyzeTurn early-out: create returned a non-string id')
      return undefined
    }
    sessionId = candidate

    // The binding may take a moment to materialize after create.
    let session: SessionBindingFace | undefined
    for (let attempt = 0; attempt < 20 && session === undefined; attempt++) {
      session = sessions.binding?.(sessionId)?.session
      if (session === undefined) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }
    if (session === undefined || typeof session.beginSubmission !== 'function'
      || typeof session.prompt !== 'function') {
      warn('analyzeTurn early-out: binding never materialized', { sessionId })
      return undefined
    }

    const content: PromptTextPart[] = [{ type: 'text', text: analysisPrompt(turnContent) }]
    const handle = session.beginSubmission({ content })
    // Bound the prompt admission round-trip so a stuck model never hangs the UI.
    const promptResult = await withTimeout(
      session.prompt(content, 'queue', signal, handle.requestId),
      15_000,
    )
    if (promptResult === undefined || promptResult === null || typeof promptResult !== 'object'
      || (promptResult as { ok?: unknown }).ok !== true) {
      warn('analyzeTurn early-out: prompt not accepted (timeout or rejection)')
      return undefined
    }

    if (remote?.follow === undefined || typeof remote.follow !== 'function') {
      warn('analyzeTurn early-out: no remote.session.follow')
      return undefined
    }
    const controller = new AbortController()
    const onAbort = (): void => controller.abort()
    signal?.addEventListener('abort', onAbort, { once: true })
    try {
      const stream = remote.follow({
        address: { kind: 'session', sessionId },
        maxMessages: 100,
      }, controller.signal)
      // Bound the whole reply wait (model generation may take a while).
      const reply = await withTimeout((async () => {
        for await (const frame of stream) {
          const records = frame !== null && typeof frame === 'object'
            ? (frame as { type?: unknown; records?: unknown }).records
            : undefined
          if (!Array.isArray(records)) continue
          const text = replyTextOf(records)
          if (text !== '') return text
        }
        return undefined
      })(), 90_000)
      return reply
    } finally {
      signal?.removeEventListener('abort', onAbort)
      controller.abort()
    }
  } catch (error) {
    warn('analyzeTurn threw', error)
    return undefined
  }
}