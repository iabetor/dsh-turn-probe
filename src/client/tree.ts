/**
 * Client-side session tree construction from the session-list snapshot.
 *
 * The harness's `ctx.sessions.list` snapshot (`byId` table) already carries
 * parent linkage (`parentId` at runtime), `origin`, and `blank` for every
 * known session, so the full lineage tree is derivable in the browser
 * without a host round-trip.
 */

/**
 * Minimal session-list row as consumed here. The runtime writes `id` (the
 * declared type says `sessionId`), `parentId`, `displayTitle`, `title`,
 * `cwd`, `origin`; every field is re-proven at runtime.
 */
export interface SessionSummaryLike {
  sessionId?: string
  id?: string
  parentSessionId?: string
  parentId?: string
  displayTitle?: string
  title?: string
  cwd?: string
  origin?: 'subagent' | 'main'
  blank: boolean
  running: boolean
  updatedAt: number
}

/** One node in the session tree. */
export interface SessionTreeNode {
  sessionId: string
  /** Parent session id, absent for roots. */
  parentSessionId?: string
  /** Coarse product classification. */
  origin: 'subagent' | 'main'
  /** Blank placeholder session (never engaged). */
  blank: boolean
  /** Whether the session is the current one. */
  current: boolean
  /** Display title (derived from the first user message or cwd), when known. */
  displayTitle?: string
  /** Raw session title, when the summary provided one. */
  title?: string
  /** Working directory, as a fallback label. */
  cwd?: string
  /** Children, recursively. */
  children: SessionTreeNode[]
}

/** A tree plus the ids needed to render it. */
export interface SessionTree {
  /** Root node of the current session's lineage. */
  root: SessionTreeNode
  /** The session the tree was built around. */
  currentId: string
}

/** Read the `byId` table from a session-list snapshot of unknown shape. */
function byIdTable(snapshot: unknown): Record<string, SessionSummaryLike> | null {
  if (snapshot === null || typeof snapshot !== 'object') return null
  const byId = (snapshot as { byId?: unknown }).byId
  if (byId === null || typeof byId !== 'object') return null
  return byId as Record<string, SessionSummaryLike>
}

/**
 * Read a summary's own session id.
 *
 * The harness's `SessionSummaryLike` type declares `sessionId`, but the runtime
 * projection (session-controller's `projectList`) writes it under `id`. Read
 * both, `id` first.
 */
function idOf(summary: SessionSummaryLike): string | undefined {
  const runtime = summary as SessionSummaryLike & { id?: string }
  return runtime.id ?? summary.sessionId
}

/**
 * Read a summary's parent session id.
 *
 * The harness's `SessionSummaryLike` type declares `parentSessionId`, but the
 * runtime projection (session-controller's `projectList`) writes it under
 * `parentId`. Read both, `parentId` first.
 */
function parentOf(summary: SessionSummaryLike): string | undefined {
  const runtime = summary as SessionSummaryLike & { parentId?: string }
  return runtime.parentId ?? summary.parentSessionId
}

/**
 * Build the current session's lineage tree from a session-list snapshot.
 *
 * Walks up `parentSessionId` to the topmost known ancestor, then DFS its whole
 * subtree. Blank placeholder sessions are excluded (the sidebar hides them
 * too); the current session always stays. Returns null when there is no
 * anchor — no current session, or a snapshot without a `byId` table.
 */
export function sessionTreeOf(
  snapshot: unknown,
  currentId: string | undefined,
): SessionTree | null {
  const byId = byIdTable(snapshot)
  if (byId === null || currentId === undefined || currentId === '') return null

  const rows = new Map<string, SessionSummaryLike>()
  for (const [id, summary] of Object.entries(byId)) {
    if (summary === null || typeof summary !== 'object') continue
    if (!summary.blank || id === currentId) rows.set(id, summary)
  }
  if (!rows.has(currentId)) {
    rows.set(currentId, {
      sessionId: currentId,
      updatedAt: 0,
      running: false,
      blank: false,
    })
  }

  // Topmost known ancestor (chain guard: a lineage cycle anchors at the
  // first repeated id instead of looping).
  let rootId = currentId
  const chain = new Set<string>([currentId])
  for (;;) {
    const parent = parentOf(rows.get(rootId)!)
    if (parent === undefined || !rows.has(parent) || chain.has(parent)) break
    chain.add(parent)
    rootId = parent
  }

  const childrenOf = new Map<string, SessionSummaryLike[]>()
  for (const [_id, summary] of rows) {
    const parent = parentOf(summary)
    if (parent === undefined || !rows.has(parent)) continue
    const list = childrenOf.get(parent) ?? []
    list.push(summary)
    childrenOf.set(parent, list)
  }
  // Sibling order: running first, then freshest activity, id as tiebreak.
  for (const kids of childrenOf.values()) {
    kids.sort((a, b) => {
      const runDelta = Number(b.running) - Number(a.running)
      if (runDelta !== 0) return runDelta
      const timeDelta = b.updatedAt - a.updatedAt
      const aid = idOf(a) ?? ''
      const bid = idOf(b) ?? ''
      return timeDelta !== 0 ? timeDelta : (aid < bid ? -1 : 1)
    })
  }

  const build = (id: string, seen: Set<string>): SessionTreeNode => {
    if (seen.has(id)) {
      return { sessionId: id, origin: 'main', blank: false, current: id === currentId, children: [] }
    }
    seen.add(id)
    const summary = rows.get(id)
    if (summary === undefined) {
      return { sessionId: id, origin: 'main', blank: false, current: id === currentId, children: [] }
    }
    const kids = (childrenOf.get(id) ?? [])
      .map(kid => build(idOf(kid) ?? '', seen))
    const parent = parentOf(summary)
    const runtime = summary as SessionSummaryLike & { displayTitle?: string; title?: string }
    // Fallback chain: displayTitle (first user message) > raw title > cwd.
    const title = runtime.displayTitle ?? runtime.title ?? summary.cwd
    return {
      sessionId: id,
      ...(parent !== undefined ? { parentSessionId: parent } : {}),
      origin: summary.origin === 'subagent' ? 'subagent' : 'main',
      blank: summary.blank,
      current: id === currentId,
      ...(title !== undefined ? { title } : {}),
      ...(summary.cwd !== undefined ? { cwd: summary.cwd } : {}),
      children: kids,
    }
  }

  return { root: build(rootId, new Set()), currentId }
}
