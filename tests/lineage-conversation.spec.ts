// Unit tests for the lineage Conversation definitions and builder.

import assert from 'node:assert/strict'
import { describe, test } from 'vitest'
import {
  EMPTY_LINEAGE_SNAPSHOT, lineageDefinitions, lineageViewDefinition,
  type LineageViewNode,
} from '../src/client/lineage-conversation'


function turnLocation(n: number): { kind: 'turn'; turn: { turn: number } } {
  return { kind: 'turn', turn: { turn: n } }
}

function withTurn(key: string, location: { kind: 'turn'; turn: { turn: number } } | { kind: 'unresolved' }): LineageViewNode {
  return { key, kind: 'x', id: key, target: 'lineage', anchorSeq: 0, location, data: { kind: 'turn-start' } }
}

describe('lineageDefinitions', () => {
  test('registers one definition per turn-related event type', () => {
    assert.deepEqual(
      lineageDefinitions.map(d => d.kind).sort(),
      [
        'lineage-assistant', 'lineage-tool', 'lineage-turn-end', 'lineage-turn-start', 'lineage-user',
      ].sort(),
    )
  })

  test('turn/start matches as start', () => {
    const d = lineageDefinitions.find(d => d.kind === 'lineage-turn-start')!
    const m = d.match({ type: 'turn/start', seq: 5, data: { turn: 1 } } as never)
    assert.deepEqual(m, { id: '5', role: 'start' })
  })

  test('unrelated events do not match', () => {
    const d = lineageDefinitions.find(d => d.kind === 'lineage-user')!
    assert.equal(d.match({ type: 'step/start', seq: 1 } as never), null)
  })
})

describe('lineageViewDefinition builder', () => {
  test('empty snapshot', () => {
    const builder = lineageViewDefinition.create()
    assert.deepEqual(builder.empty, EMPTY_LINEAGE_SNAPSHOT)
  })

  test('groups event nodes into turns by location', () => {
    const builder = lineageViewDefinition.create()
    const turn = (n: number) => turnLocation(n)
    const nodes: LineageViewNode[] = [
      { ...withTurn('a', turn(1)), data: { kind: 'turn-start', seq: 10, time: 100, turn: 1 } },
      { ...withTurn('b', turn(1)), data: { kind: 'user', seq: 11, text: 'hello', fullText: 'hello' } },
      { ...withTurn('c', turn(1)), data: { kind: 'tool', seq: 12, toolName: 'bash', toolArgs: '{"cmd":"ls"}' } },
      { ...withTurn('d', turn(1)), data: { kind: 'assistant', seq: 13, text: 'done', fullText: 'done' } },
      { ...withTurn('e', turn(1)), data: { kind: 'turn-end', seq: 14, time: 500, turn: 1 } },
      { ...withTurn('f', turn(2)), data: { kind: 'turn-start', seq: 20, time: 600, turn: 2 } },
    ]
    const snap = builder.apply({ upserts: nodes, timeline: { turnOrder: [], turns: new Map() } })
    assert.equal(snap.turns.length, 2)
    const t1 = snap.turns[0]!
    assert.equal(t1.turn, 1)
    assert.equal(t1.user, 'hello')
    assert.equal(t1.assistant, 'done')
    assert.equal(t1.tools.length, 1)
    assert.equal(t1.startedAt, 100)
    assert.equal(t1.endedAt, 500)
    assert.equal(snap.running, true, 'turn 2 is still open')
    // blocks preserve chronological (seq) order across content kinds
    assert.deepEqual(t1.blocks.map(b => [b.kind, b.seq]), [
      ['user', 11],
      ['tool', 12],
      ['assistant', 13],
    ])
    const toolBlock = t1.blocks[1]!
    assert.equal(toolBlock.kind, 'tool')
    assert.equal(toolBlock.name, 'bash')
    assert.equal(toolBlock.args, '{"cmd":"ls"}')
  })

  test('running flag while a turn is open', () => {
    const builder = lineageViewDefinition.create()
    const nodes: LineageViewNode[] = [
      { ...withTurn('g', turnLocation(3)), data: { kind: 'turn-start', seq: 30, time: 1, turn: 3 } },
    ]
    const snap = builder.apply({ upserts: nodes, timeline: { turnOrder: [], turns: new Map() } })
    assert.equal(snap.running, true)
  })

  test('replace clears previous nodes', () => {
    const builder = lineageViewDefinition.create()
    builder.apply({
      upserts: [{ ...withTurn('h', turnLocation(1)), data: { kind: 'turn-start', turn: 1 } }],
      timeline: { turnOrder: [], turns: new Map() },
    })
    const snap = builder.replace({
      nodes: [],
      timeline: { turnOrder: [], turns: new Map() },
    })
    assert.equal(snap.turns.length, 0)
  })
})
