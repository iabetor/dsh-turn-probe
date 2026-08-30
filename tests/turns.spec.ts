// Unit tests for turn extraction (src/client/turns.ts).

import assert from 'node:assert/strict'
import { describe, test } from 'vitest'
import { turnTextOf, turnsOf } from '../src/client/turns'

function ev(type: string, seq: number, data: Record<string, unknown> = {}, time = seq * 1000) {
  return { type, seq, time, data }
}

describe('turnsOf', () => {
  test('extracts user, assistant, and tool counts per turn', () => {
    const events = [
      ev('turn/start', 1),
      ev('user/message', 2, { content: [{ type: 'text', text: 'hello' }] }),
      ev('tool/call', 3, { name: 'bash' }),
      ev('tool/result', 4, {}),
      ev('assistant/message', 5, { message: { content: [{ type: 'text', text: 'reply' }] } }),
      ev('turn/end', 6),
      ev('turn/start', 7),
      ev('user/message', 8, { content: [{ type: 'text', text: 'second' }] }),
      ev('turn/end', 9),
    ]
    const turns = turnsOf(events)
    assert.equal(turns.length, 2)
    assert.equal(turns[0]!.user, 'hello')
    assert.equal(turns[0]!.assistant, 'reply')
    assert.equal(turns[0]!.toolCalls, 1)
    assert.equal(turns[1]!.user, 'second')
    assert.equal(turns[1]!.toolCalls, 0)
  })

  test('an unterminated turn (live session) is still emitted', () => {
    const events = [
      ev('turn/start', 1),
      ev('user/message', 2, { content: 'still running' }),
    ]
    const turns = turnsOf(events)
    assert.equal(turns.length, 1)
    assert.equal(turns[0]!.user, 'still running')
    assert.equal(turns[0]!.endedAt, undefined)
  })

  test('truncates long text and tolerates hostile events', () => {
    const long = 'x'.repeat(500)
    const events = [
      ev('turn/start', 1),
      ev('user/message', 2, { content: [{ type: 'text', text: long }] }),
      ev('user/message', 3, { content: null }),
      null,
      42,
      { type: 'weird', data: { content: { boom: () => { throw new Error('x') } } } },
      ev('turn/end', 4),
    ]
    const turns = turnsOf(events as never[])
    assert.equal(turns.length, 1)
    assert.equal(turns[0]!.user!.length, 121) // 120 chars + ellipsis
  })
})

describe('turnTextOf', () => {
  test('extracts user, assistant, and tool lines', () => {
    const events = [
      { type: 'user/message', seq: 1, data: { content: [{ type: 'text', text: 'hello' }] } },
      { type: 'tool/call', seq: 2, data: { name: 'bash', arguments: '{"cmd":"ls"}' } },
      { type: 'tool/result', seq: 3, data: {} },
      { type: 'assistant/message', seq: 4, data: { message: { content: [{ type: 'text', text: 'done' }] } } },
    ]
    const text = turnTextOf(events)
    assert.ok(text.includes('用户: hello'))
    assert.ok(text.includes('工具调用: bash({"cmd":"ls"})'))
    assert.ok(text.includes('工具结果: 成功'))
    assert.ok(text.includes('助手: done'))
  })

  test('marks failed tool results', () => {
    const text = turnTextOf([{ type: 'tool/result', seq: 1, data: { error: true } }])
    assert.ok(text.includes('工具结果: 失败'))
  })
})
