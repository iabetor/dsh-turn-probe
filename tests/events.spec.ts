// Unit tests for the remote address builder (src/client/events.ts).

import assert from 'node:assert/strict'
import { describe, test } from 'vitest'
import { addressFor } from '../src/client/events'

describe('addressFor', () => {
  test('main sessions use the kind:session shape', () => {
    const addr = addressFor('root', undefined, 'main')
    assert.equal(addr.kind, 'session')
    assert.equal(addr.sessionId, 'root')
  })

  test('subagent sessions require parentSessionId, childSessionId, mode', () => {
    const addr = addressFor('child-1', 'parent-1', 'subagent', 'one-shot')
    assert.equal(addr.kind, 'subagent')
    assert.equal(addr.parentSessionId, 'parent-1')
    assert.equal(addr.childSessionId, 'child-1')
    assert.equal(addr.mode, 'one-shot')
  })

  test('continuable subagents keep their mode', () => {
    const addr = addressFor('child-2', 'parent-1', 'subagent', 'continuable')
    assert.equal(addr.kind, 'subagent')
    assert.equal(addr.mode, 'continuable')
  })

  test('subagent without a known mode falls back to kind:session (no mode mismatch)', () => {
    const addr = addressFor('child-1', 'parent-1', 'subagent', undefined)
    assert.equal(addr.kind, 'session')
  })

  test('subagent without a parent falls back to kind:session (lets the harness reject)', () => {
    const addr = addressFor('child-1', undefined, 'subagent', 'one-shot')
    assert.equal(addr.kind, 'session')
  })

  test('root session with a self-referential parent still addresses as the root', () => {
    const addr = addressFor('self', 'self', 'subagent', 'one-shot')
    assert.equal(addr.kind, 'session')
  })
})
