/**
 * Client-side session data: turn boundaries from the follow snapshot, turn
 * content via the page verb (the dsh-context production pattern — page pins
 * one seq and returns its full content).
 */

/** The full address the harness expects. */
export interface SessionRemoteAddress {
  kind: 'session'
  sessionId: string
}
export interface SubagentRemoteAddress {
  kind: 'subagent'
  parentSessionId: string
  childSessionId: string
  mode: 'one-shot' | 'continuable'
}
export type RemoteSessionAddress = SessionRemoteAddress | SubagentRemoteAddress

/** The `remote.session` face as consumed here. */
export interface SessionRemoteFace {
  page?(request: {
    address: RemoteSessionAddress
    throughSeq: number
    beforeSeq?: number
    maxMessages?: number
  }, signal?: AbortSignal): Promise<unknown>
  follow?(request: {
    address: RemoteSessionAddress
    maxMessages?: number
  }, signal?: AbortSignal): AsyncIterable<unknown>
}

/** Read a service off the client context without letting an absent/foreign
 * cordis service (a throwing `ctx.get`) escape: returns undefined instead. */
export function serviceOf(ctx: { get(name: string): unknown }, name: string): unknown {
  try {
    return ctx.get(name)
  } catch {
    return undefined
  }
}

/** The records of a follow snapshot frame. */
export function recordsOf(frame: unknown): readonly unknown[] | null {
  if (frame === null || typeof frame !== 'object') return null
  const f = frame as { type?: unknown; records?: unknown }
  if (f.type !== 'snapshot') return null
  const records = f.records
  return Array.isArray(records) ? records : null
}

/** The records of a page response, under every served envelope. */
export function rowsOf(response: unknown): readonly unknown[] {
  let payload: unknown = response
  if (payload !== null && typeof payload === 'object') {
    const nested = (payload as { result?: unknown }).result
    if (nested !== null && typeof nested === 'object') payload = nested
  }
  if (payload !== null && typeof payload === 'object' && 'ok' in payload) {
    const r = payload as { ok?: unknown; value?: unknown }
    if (r.ok !== true || r.value === null || typeof r.value !== 'object') {
      throw new Error('turn-probe: rpc failed')
    }
    payload = r.value
  }
  if (payload === null || typeof payload !== 'object') throw new Error('turn-probe: rpc failed')
  const rows = (payload as { records?: unknown }).records
    ?? (payload as { events?: unknown }).events
  if (!Array.isArray(rows)) throw new Error('turn-probe: rpc failed')
  return rows
}

/** Extract raw events from history rows ({type:'event', event}). */
export function eventsOf(rows: readonly unknown[]): unknown[] {
  const events: unknown[] = []
  for (const row of rows) {
    if (row === null || typeof row !== 'object') continue
    const r = row as { type?: unknown; event?: unknown }
    if (r.type === 'event' && r.event !== undefined) events.push(r.event)
  }
  return events
}

/** Build the durable address for one tree node. */
export function addressFor(
  sessionId: string,
  parentSessionId: string | undefined,
  origin: 'subagent' | 'main' | undefined,
  mode?: 'one-shot' | 'continuable',
): RemoteSessionAddress {
  if (origin === 'subagent' && parentSessionId !== undefined && parentSessionId !== sessionId
    && mode !== undefined) {
    return { kind: 'subagent', parentSessionId, childSessionId: sessionId, mode }
  }
  return { kind: 'session', sessionId }
}

/** The event seq of an event-like object, when present. */
function seqOf(event: unknown): number | undefined {
  if (event === null || typeof event !== 'object') return undefined
  const s = (event as { seq?: unknown }).seq
  return typeof s === 'number' ? s : undefined
}

/**
 * Fetch the raw event stream of one session via the follow snapshot.
 * Returns the events plus the snapshot cursor. The snapshot is bounded
 * (~3k records) but sufficient to enumerate turn boundaries.
 */
export async function fetchSessionEvents(
  ctx: { get(name: string): unknown },
  address: RemoteSessionAddress,
  signal?: AbortSignal,
): Promise<unknown[] | undefined> {
  const face = serviceOf(ctx, 'remote.session') as SessionRemoteFace | undefined
  if (face?.follow === undefined || typeof face.follow !== 'function') return undefined
  const controller = new AbortController()
  const onAbort = (): void => controller.abort()
  signal?.addEventListener('abort', onAbort, { once: true })
  try {
    const stream = face.follow({ address, maxMessages: 100000 }, controller.signal)
    for await (const frame of stream) {
      const records = recordsOf(frame)
      if (records === null) continue
      return eventsOf(records)
    }
    return []
  } finally {
    signal?.removeEventListener('abort', onAbort)
    controller.abort()
  }
}

/**
 * Fetch the full content of one turn window (events whose seq falls in
 * [startSeq, endSeq]) via the page verb, pinning the inclusive cut to the
 * turn start and the exclusive bound one past the turn end (the dsh-context
 * pattern: `throughSeq: seq, beforeSeq: seq + 1`).
 */
export async function fetchTurnWindow(
  ctx: { get(name: string): unknown },
  address: RemoteSessionAddress,
  startSeq: number,
  endSeq: number | undefined,
  signal?: AbortSignal,
): Promise<unknown[] | undefined> {
  const face = serviceOf(ctx, 'remote.session') as SessionRemoteFace | undefined
  if (face?.page === undefined || typeof face.page !== 'function') return undefined
  const controller = new AbortController()
  const onAbort = (): void => controller.abort()
  signal?.addEventListener('abort', onAbort, { once: true })
  try {
    // Pin the page to the turn's end (the inclusive cut); the harness bounds
    // the window from below by message count, so we slice the exact
    // [startSeq, endSeq] window client-side.
    const throughSeq = endSeq ?? startSeq
    const response = await face.page({
      address,
      throughSeq,
      maxMessages: 10000,
    }, controller.signal)
    const events = eventsOf(rowsOf(response))
    return events.filter(event => {
      const seq = seqOf(event)
      return seq !== undefined && seq >= startSeq && (endSeq === undefined || seq <= endSeq)
    })
  } finally {
    signal?.removeEventListener('abort', onAbort)
    controller.abort()
  }
}
