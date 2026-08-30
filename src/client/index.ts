/**
 * dsh-turn-probe client half: register the "Lineage" tab in the
 * conversation view slot and render the current session's tree.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session'
// Type-only: pulls the locale plugin's Context merge (ctx.locale) and the
// 'conversation.view' SlotMap row declared by the conversation package.
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { en, NS, zh } from './locales.ts'
import { sessionTreeOf, type SessionTreeNode } from './tree.ts'
import { addressFor, fetchSessionEvents, fetchTurnWindow } from './events.ts'
import { analyzeTurn as analyzeTurnModel } from './analyze.ts'
import { turnsOf, turnTextOf } from './turns.ts'
import { registerLineageConversationView, type LineageTurn, type UiConversationFace } from './lineage-conversation.ts'
import { TurnProbeView, type TurnProbeViewInjected, type TreeSnapshotStore } from './TreeView.tsx'

/** Required services: the slot system, the session list, and the locale service. */
export const inject = ['slots', 'sessions', 'locale', 'uiConversation', 'uiSession']

/** Client plugin body: register the turn-probe view tab. */
export function apply(ctx: Context): void {
  // rc peer's locale namespace union predates free-form NS; master accepts any.
  ctx.effect(() => ctx.locale.register(NS as never, { zh, en }), 'dsh-turn-probe: dictionaries')
  const t = ctx.locale.bind(NS)
  registerLineageConversationView(ctx as Context & { uiConversation: UiConversationFace })

  // Session ids are strings; a WeakMap would throw on string keys.
  const treeStores = new Map<SessionId, TreeSnapshotStore<SessionTreeNode | null>>()
  const treeStore = (sessionId: SessionId): TreeSnapshotStore<SessionTreeNode | null> => {
    let store = treeStores.get(sessionId)
    if (store === undefined) {
      store = createTreeStore(ctx, sessionId)
      treeStores.set(sessionId, store)
    }
    return store
  }

  // Live lineage snapshot from the Conversation engine target.
  const lineageStores = new Map<SessionId, TreeSnapshotStore<readonly LineageTurn[] | null>>()
  const lineageStore = (sessionId: SessionId): TreeSnapshotStore<readonly LineageTurn[] | null> => {
    let store = lineageStores.get(sessionId)
    if (store === undefined) {
      const ui = (ctx as Context & { uiConversation: UiConversationFace }).uiConversation
      const binding = ui.binding(sessionId)
      const target = binding.target('lineage')
      const snapshot = (): readonly LineageTurn[] | null => {
        const value = target.getSnapshot()
        return value === undefined || value === null
          ? null
          : (value as { turns?: unknown }).turns as readonly LineageTurn[] | undefined ?? null
      }
      const lazy: TreeSnapshotStore<readonly LineageTurn[] | null> = {
        getSnapshot: snapshot,
        subscribe: listener => target.subscribe(listener),
      }
      store = lazy
      lineageStores.set(sessionId, store)
    }
    return store
  }

  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'turn-probe',
    order: 30,
    // The rc peer's SlotMap locale union predates free-form namespaces; the
    // master runtime accepts any registered NS string.
    locale: NS as never,
    label: () => t('view.sessionTree'),
    // The slot-injected SessionId comes from a different pnpm-resolved
    // dsh-session copy than the one we re-export, so the two BRAND nominal
    // types don't match. Widen to `string` for the parameter — the runtime
    // shape is identical (both are string at the value layer).
    inject: (sessionId: string): TurnProbeViewInjected => ({
      hooks: {
        tree: treeStore(sessionId as SessionId),
        lineage: lineageStore(sessionId as SessionId),
      },
      loadTurns: async (node) => {
        // The harness loads the parent session's subagent catalog only when the
        // parent tree is rendered. If the user opens a child before the
        // parent, the catalog is still missing; retry once after a short wait
        // so the click sequence "open parent → open child" still works without
        // a manual second click on the child.
        let mode = subagentModeOf(ctx, node)
        if (node.origin === 'subagent' && mode === undefined) {
          await new Promise(resolve => setTimeout(resolve, 400))
          mode = subagentModeOf(ctx, node)
        }
        if (node.origin === 'subagent' && mode === undefined) {
          throw new Error(t('tree.parentCatalogMissing'))
        }
        const address = addressFor(node.sessionId, node.parentSessionId, node.origin, mode)
        const events = await fetchSessionEvents(ctx, address)
        return events === undefined ? undefined : turnsOf(events)
      },
      loadTurnContent: async (node, turn) => {
        const mode = subagentModeOf(ctx, node)
        const address = addressFor(node.sessionId, node.parentSessionId, node.origin, mode)
        if (turn.startSeq === undefined) return undefined
        const events = await fetchTurnWindow(ctx, address, turn.startSeq, turn.endSeq)
        return events === undefined ? undefined : turnTextOf(events)
      },
      analyzeTurn: async (node, turn, content, signal, onSessionCreated) => {
        return analyzeTurnModel(ctx, node, turn, content, signal, onSessionCreated)
      },
      openSession: (sessionId: string) => {
        // The slot-injected id is a plain string (a different pnpm-resolved
        // dsh-session copy); the service's open() expects its own SessionId
        // brand. The runtime shape is identical, so bridge via unknown.
        const sessions = ctx.sessions as { open?: (id: unknown) => void } | undefined
        if (sessions?.open !== undefined) sessions.open(sessionId)
      },
    }),
  }, TurnProbeView))
}

/**
 * Resolve a subagent node's runtime mode from the session-list snapshot.
 *
 * The harness projects `subagentsByParent` (parent id → catalog) on the
 * session list; each catalog entry carries the child's durable mode. When
 * the mode is unknown (catalog absent, still loading, or a plain session),
 * `undefined` lets `addressFor` fall back to the plain `session` kind.
 */
function subagentModeOf(
  ctx: Context,
  node: SessionTreeNode,
): 'one-shot' | 'continuable' | undefined {
  if (node.origin !== 'subagent' || node.parentSessionId === undefined) return undefined
  const list = (ctx.sessions?.list as { getSnapshot?: () => unknown } | undefined)
  const snapshot = list?.getSnapshot?.()
  if (snapshot === null || typeof snapshot !== 'object') return undefined
  const byParent = (snapshot as { subagentsByParent?: unknown }).subagentsByParent
  if (byParent === null || typeof byParent !== 'object') return undefined
  const catalog = (byParent as Record<string, unknown>)[node.parentSessionId]
  if (catalog === null || typeof catalog !== 'object') return undefined
  const entries = (catalog as { entries?: unknown }).entries
  if (!Array.isArray(entries)) return undefined
  for (const entry of entries) {
    if (entry === null || typeof entry !== 'object') continue
    const e = entry as { id?: unknown; kind?: unknown; mode?: unknown }
    if (e.id === node.sessionId && e.kind === 'child') {
      if (e.mode === 'one-shot' || e.mode === 'continuable') return e.mode
    }
  }
  return undefined
}

/** Build a snapshot store that follows the session list for one session id. */
function createTreeStore(
  ctx: Context,
  sessionId: SessionId,
): TreeSnapshotStore<SessionTreeNode | null> {
  const list = (ctx.sessions?.list as { getSnapshot?: () => unknown; subscribe?: (fn: () => void) => () => void } | undefined)
  const snapshot = (): SessionTreeNode | null => {
    const tree = sessionTreeOf(list?.getSnapshot?.(), sessionId)
    return tree === null ? null : tree.root
  }
  // Rebuild on list changes; a missing list yields a static empty store.
  const listSubscribe = list?.subscribe
  if (listSubscribe !== undefined) {
    const store = createLazyStore<SessionTreeNode | null>(snapshot)
    // Guard above proves non-undefined; TS can't carry the narrowing into
    // the closure body, so assert once here.
    const subscribe = listSubscribe as (fn: () => void) => () => void
    const setStore = store.set as (next: SessionTreeNode | null) => void
    ctx.effect(() => subscribe(() => setStore(snapshot())), 'dsh-turn-probe: list follow')
    return store
  }
  return createLazyStore(snapshot)
}

/** Minimal SnapshotStore adapter over a snapshot thunk (no external deps). */
function createLazyStore<T>(read: () => T): TreeSnapshotStore<T> {
  let value = read()
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => value,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    set: (next) => {
      if (Object.is(next, value)) return
      value = next
      for (const listener of listeners) listener()
    },
  }
}

export type { SessionTreeNode, SessionTree } from './tree.ts'
export type { TurnProbeViewInjected } from './TreeView.tsx'
