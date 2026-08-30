/**
 * Session-tree view (minimal): flat session list, click a turn to select it
 * (single selection), Analyze assembles that turn's content for the model.
 */

import { useEffect, useState } from './react.ts'
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionTreeNode } from './tree.ts'
import type { TurnSummary } from './turns.ts'
import type { LineageTurn } from './lineage-conversation.ts'
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import { React } from './react.ts'
import css from './turn-probe.module.css'

/** Minimal observable snapshot face (structural match with dsh-client-store). */
export interface TreeSnapshotStore<T> {
  getSnapshot(): T
  subscribe(listener: () => void): () => void
  /** Optional mutation used by the store owner; absent on read-only stores. */
  set?(next: T): void
}

/** Session-bound controls injected by the view tab registration. */
export interface TurnProbeViewInjected {
  hooks: {
    /** Root of the current session's lineage, or null when unavailable. */
    tree: TreeSnapshotStore<SessionTreeNode | null>
    /** Live turn list of the current session (engine-driven, streaming). */
    lineage: TreeSnapshotStore<readonly LineageTurn[] | null>
  }
  /** Load turn summaries for one session node (full address data needed). */
  loadTurns: (node: SessionTreeNode) => Promise<TurnSummary[] | undefined>
  /** Load the full content of one turn window for the analysis payload. */
  loadTurnContent: (node: SessionTreeNode, turn: TurnSummary) => Promise<string | undefined>
  /** Run the model analysis on one turn's content; returns the insight text
   * plus the throwaway analysis session id (for navigation). The callback
   * fires as soon as the analysis session exists so the UI can navigate to
   * it before the model reply completes. */
  analyzeTurn: (node: SessionTreeNode, turn: TurnSummary, content: string,
    signal?: AbortSignal, onSessionCreated?: (sessionId: string) => void) =>
    Promise<{ text: string; sessionId: string } | undefined>
  /** Navigate to another session (open it in the conversation column). */
  openSession: (sessionId: string) => void
}

/** Markdown render labels for the preview (copy buttons etc.). */
function mdLabels(t: (key: string) => string): {
  code: { copyLabel: string; copiedLabel: string }
  footnotes: string
} {
  return {
    code: { copyLabel: t('markdown.copy'), copiedLabel: t('markdown.copied') },
    footnotes: t('markdown.footnotes'),
  }
}

/** rc-peer codeLabels (master renamed it to `labels`); pass both. */
function codeLabels(t: (key: string) => string): { copyLabel: string; copiedLabel: string } {
  return { copyLabel: t('markdown.copy'), copiedLabel: t('markdown.copied') }
}

/** The single selected turn. */
interface SelectedTurn {
  sessionId: string
  index: number
}

/** One rendered block in the turn preview: role chip + markdown body. */
interface PreviewBlock {
  /** Block role: 'user' | 'tool' | 'assistant' | '' (raw fallback). */
  kind: 'user' | 'tool' | 'assistant' | ''
  /** Localized role label, e.g. "用户" / "工具调用: bash" / "助手". */
  role: string
  /** Markdown body, rendered with the same MarkdownText as the chat view. */
  text: string
}

/** Build PreviewBlocks from a live turn (engine snapshot), in the original
 * chronological (seq) order — tool calls appear where they actually happened
 * inside the turn instead of being grouped at the end. */
function previewBlocksOf(turn: LineageTurn | undefined): PreviewBlock[] | null {
  if (turn === undefined) return null
  const blocks: PreviewBlock[] = []
  for (const block of turn.blocks) {
    switch (block.kind) {
      case 'user':
        if (block.text !== undefined) blocks.push({ kind: 'user', role: '用户', text: block.text })
        break
      case 'assistant':
        if (block.text !== undefined) {
          blocks.push({ kind: 'assistant', role: '助手', text: block.text })
        }
        break
      case 'tool': {
        const name = block.name ?? '?'
        const args = block.args ?? ''
        // Tool blocks carry their label in `role`; `text` holds the args so the
        // analysis prompt keeps them (the renderer shows the role only).
        blocks.push({ kind: 'tool', role: `工具调用: ${name}`, text: args })
        break
      }
      case 'turn-start':
      case 'turn-end':
        // Boundary markers carry no display content.
        break
    }
  }
  return blocks.length > 0 ? blocks : null
}

/** One tool-call block: role chip + collapsible args (hidden by default). */
function ToolBlock({ role, args }: {
  role: string
  args: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className={css.toolBlock}>
      <button
        type="button"
        className={css.toolToggle}
        onClick={() => { setOpen(v => !v) }}
      >
        <span className={css.toolCaret}>{open ? '▾' : '▸'}</span>
        <span className={css.previewRole}>{role}</span>
      </button>
      {open && args !== '' && (
        <pre className={css.toolArgs}>{args}</pre>
      )}
    </div>
  )
}

function SessionList({
  rows, t, selected, onSelectTurn,
}: {
  rows: { node: SessionTreeNode; turns: TurnSummary[] | null }[]
  t: (key: string) => string
  selected: SelectedTurn | null
  onSelectTurn: (sessionId: string, index: number) => void
}) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())
  const toggleSession = (id: string): void => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  return (
    <ul className={css.sessionTree}>
      {rows.map(({ node, turns }) => {
        const isOpen = expanded.has(node.sessionId)
        const role = node.origin === 'subagent' ? t('tree.role.subagent') : t('tree.role.main')
        const label = node.title ?? node.displayTitle ?? node.sessionId.slice(0, 8)
        const isMain = node.origin !== 'subagent'
        const isCurrent = node.current
        const classes = [css.node]
        if (isMain) classes.push(css.mainSession)
        return (
          <li key={node.sessionId}>
            <span className={classes.join(' ')}>
              <span
                className={`${css.toggle} ${isOpen ? css.expanded : ''}`}
                onClick={() => { toggleSession(node.sessionId) }}
              >
                {isOpen ? '▾' : '▸'}
              </span>
              <span
                className={`${css.label} ${isCurrent ? css.current : ''}`}
                onClick={() => { toggleSession(node.sessionId) }}
                title={node.sessionId}
              >
                {label}
              </span>
              {isCurrent && <span className={css.currentBadge}>{t('tree.current')}</span>}
              <span className={`${css.role} ${isMain ? '' : css.subagent}`}>{role}</span>
            </span>
            {isOpen && (
              <ul className={css.turns}>
                {turns === null && <li className={css.loading}>…</li>}
                {turns !== null && turns.length === 0 && (
                  <li className={css.empty}>{t('tree.noTurns')}</li>
                )}
                {turns !== null && turns.map(turn => {
                  const isSelected = selected !== null
                    && selected.sessionId === node.sessionId
                    && selected.index === turn.index
                  return (
                    <li
                      key={turn.index}
                      className={`${css.turn} ${isSelected ? css.selected : ''}`}
                      onClick={() => { onSelectTurn(node.sessionId, turn.index) }}
                      style={{ cursor: 'pointer' }}
                    >
                      <span className={css.index}>#{turn.index + 1}</span>
                      <span className={css.content}>
                        {turn.user !== undefined && (
                          <span className={`${css.field} ${css.user}`}>
                            <span className={css.role}>用户</span>
                            <span className={css.text}>{turn.user}</span>
                          </span>
                        )}
                        {turn.assistant !== undefined && (
                          <span className={`${css.field} ${css.assistant}`}>
                            <span className={css.role}>助手</span>
                            <span className={css.text}>{turn.assistant}</span>
                          </span>
                        )}
                      </span>
                      {turn.toolCalls > 0 && (
                        <span className={`${css.field} ${css.tools}`}>工具×{turn.toolCalls}</span>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** The view body: flat session list with single-turn selection. */
export function TurnProbeView({
  useTree, useLineage, loadTurns, loadTurnContent, analyzeTurn, openSession, t: tRaw,
}: ConvViewProps
  & InjectFace<TurnProbeViewInjected>
  & { t: (key: string, params?: Record<string, unknown>) => string }) {
  const t = tRaw as (key: string, params?: Record<string, unknown>) => string
  const tree = useTree(value => value)
  const liveTurns = useLineage(value => value)
  const [turnsCache, setTurnsCache] = useState<Map<string, TurnSummary[]>>(() => new Map())
  const [selected, setSelected] = useState<SelectedTurn | null>(null)
  const [preview, setPreview] = useState<PreviewBlock[] | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewMode, setPreviewMode] = useState<'preview' | 'source'>('preview')
  const [analyzing, setAnalyzing] = useState(false)
  const [analysis, setAnalysis] = useState<string | null>(null)

  // Load turns once for every session when the tree first appears. Live
  // updates come from the engine snapshot (useLineage); no polling needed.
  useEffect(() => {
    if (tree === null) return
    const nodes: SessionTreeNode[] = []
    const walk = (node: SessionTreeNode): void => {
      nodes.push(node)
      for (const child of node.children) walk(child)
    }
    walk(tree)
    let cancelled = false
    void Promise.all(
      nodes.map(async (node) => {
        if (cancelled) return
        try {
          const turns = await loadTurns(node)
          if (turns !== undefined && !cancelled) {
            setTurnsCache(prev => new Map(prev).set(node.sessionId, turns))
          }
        } catch {
          // Per-session load failures are tolerated.
        }
      }),
    )
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree?.sessionId])

  if (tree === null) return <div className={css.empty}>{t('tree.empty')}</div>

  // Flatten the tree into rows. The current session's turns come from the
  // live engine snapshot (streaming); others fall back to the loaded cache.
  const rows: { node: SessionTreeNode; turns: TurnSummary[] | null }[] = []
  const walk = (node: SessionTreeNode): void => {
    const isCurrent = node.current
    const live = isCurrent ? liveTurns : null
    const turns = live !== null && live.length > 0
      ? live.map(t => ({
        index: t.turn - 1,
        user: t.user,
        assistant: t.assistant,
        toolCalls: t.tools.length,
        startedAt: t.startedAt,
        endedAt: t.endedAt,
      }))
      : turnsCache.get(node.sessionId) ?? null
    rows.push({ node, turns })
    for (const child of node.children) walk(child)
  }
  walk(tree)

  const selectTurn = async (sessionId: string, index: number): Promise<void> => {
    setSelected({ sessionId, index })
    setAnalysis(null)
    setPreviewLoading(true)
    setPreview(null)
    const node = findNode(tree, sessionId)
    // Live content for the current session comes from the engine snapshot
    // (full text, streams as the turn runs); others fall back to paging.
    const isCurrent = node?.current === true
    const liveTurn = isCurrent && liveTurns !== null
      ? liveTurns.find(t => t.turn === index + 1)
      : undefined
    if (liveTurn !== undefined) {
      const blocks = previewBlocksOf(liveTurn)
      setPreview(blocks)
      setPreviewLoading(false)
      return
    }
    const turns = turnsCache.get(sessionId) ?? []
    const turn = turns[index]
    if (node === undefined || turn === undefined) {
      setPreviewLoading(false)
      return
    }
    try {
      const content = await loadTurnContent(node, turn)
      // Non-current sessions don't have engine snapshots; fall back to the
      // legacy text form wrapped in a single block.
      setPreview(content === undefined || content === ''
        ? null
        : [{ kind: '', role: '', text: content }])
    } catch {
      setPreview(null)
    } finally {
      setPreviewLoading(false)
    }
  }

  // Live preview: whenever the engine snapshot updates, refresh the preview
  // of the currently selected current-session turn.
  useEffect(() => {
    if (selected === null || liveTurns === null) return
    const node = findNode(tree, selected.sessionId)
    if (node?.current !== true) return
    const liveTurn = liveTurns.find(t => t.turn === selected.index + 1)
    if (liveTurn === undefined) return
    setPreview(previewBlocksOf(liveTurn))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveTurns, selected])

  const runAnalysis = async (): Promise<void> => {
    if (selected === null) return
    setAnalyzing(true)
    setAnalysis(null)
    const node = findNode(tree, selected.sessionId)
    if (node === undefined) {
      setAnalyzing(false)
      return
    }
    const turns = turnsCache.get(selected.sessionId) ?? []
    const turn = turns[selected.index]
    if (turn === undefined) {
      setAnalyzing(false)
      return
    }
    // Ensure the content is loaded (selection may have raced the preview).
    let content: string | undefined
    if (preview !== null) {
      content = preview
        .map(block => {
          if (block.kind === 'tool') {
            return `工具调用: ${block.role.replace('工具调用: ', '')}${block.text !== '' ? '(' + block.text + ')' : ''}`
          }
          if (block.role !== '') return `${block.role}\n${block.text}`
          return block.text
        })
        .filter(part => part !== '')
        .join('\n\n')
    }
    if (content === undefined || content === '') {
      content = await loadTurnContent(node, turn)
    }
    if (content === undefined || content === '') {
      setAnalyzing(false)
      setAnalysis(t('analysis.empty'))
      return
    }
    // Run the model analysis in a throwaway session. The session is opened
    // (navigated to) as soon as it is created — via the onSessionCreated
    // callback — so the user watches the analysis run live; the returned
    // text lands in the analysis panel of this view when it completes.
    const result = await analyzeTurn(node, turn, content, undefined, openSession)
    setAnalyzing(false)
    setAnalysis(result === undefined || result.text === ''
      ? t('analysis.failed')
      : result.text)
  }

  return (
    <div className={css.root} data-turn-probe-view data-conversation-composer-overlay="">
      <div className={css.body}>
        <div className={css.listScroll}>
          <SessionList
            rows={rows}
            t={t}
            selected={selected}
            onSelectTurn={(sessionId, index) => { void selectTurn(sessionId, index) }}
          />
        </div>
        {selected !== null && (
          <div className={css.preview}>
            <div className={css.previewHeader}>
              <span>{t('selection.turnSelected', { index: selected.index + 1 })}</span>
              {previewLoading && <span className={css.dim}>…</span>}
              <span className={css.modeSwitch}>
                <button
                  type="button"
                  className={`${css.modeBtn} ${previewMode === 'preview' ? css.modeBtnActive : ''}`}
                  onClick={() => { setPreviewMode('preview') }}
                >
                  {t('preview.mode.preview')}
                </button>
                <button
                  type="button"
                  className={`${css.modeBtn} ${previewMode === 'source' ? css.modeBtnActive : ''}`}
                  onClick={() => { setPreviewMode('source') }}
                >
                  {t('preview.mode.source')}
                </button>
              </span>
            </div>
            {!previewLoading && preview !== null && (
              previewMode === 'source'
                ? (
                  <pre className={css.previewBody}>
                    {preview.map((block, i) => (
                      <div key={i}>
                        {block.role !== '' && <strong>{block.role}</strong>}
                        {block.role !== '' && '\n'}
                        {block.text}
                        {i < preview.length - 1 && '\n\n'}
                      </div>
                    ))}
                  </pre>
                )
                : (
                  <div className={css.previewBody}>
                    {preview.map((block, i) => (
                      <div key={i} className={css.previewBlock}>
                        {block.kind === 'tool' ? (
                          <ToolBlock role={block.role} args={block.text} />
                        ) : (
                          <>
                            {block.role !== '' && (
                              <div className={`${css.previewRole} ${block.kind !== '' ? css[block.kind] : ''}`}>
                                {block.role}
                              </div>
                            )}
                            {block.text !== '' && (
                              <MarkdownText
                                {...({ labels: mdLabels(t) } as object)}
                                text={block.text}
                                codeLabels={codeLabels(t)}
                              />
                            )}
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )
            )}
          </div>
        )}
      </div>
      <div className={css.metricsBar}>
        {selected === null ? (
          <span className={css.dim}>{t('selection.hint')}</span>
        ) : (
          <span>{t('selection.turnSelected', { index: selected.index + 1 })}</span>
        )}
        <button
          type="button"
          className={css.analyzeBtn}
          onClick={() => { void runAnalysis() }}
          disabled={selected === null || analyzing}
        >
          {analyzing ? '…' : t('selection.analyze')}
        </button>
      </div>
      {analysis !== null && (
        <pre className={css.analysis}>{analysis}</pre>
      )}
    </div>
  )
}

/** Find a node by id anywhere in the tree. */
function findNode(root: SessionTreeNode, id: string): SessionTreeNode | undefined {
  if (root.sessionId === id) return root
  for (const child of root.children) {
    const hit = findNode(child, id)
    if (hit !== undefined) return hit
  }
  return undefined
}
