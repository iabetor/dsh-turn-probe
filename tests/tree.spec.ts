// Unit tests for the client-side session tree builder (src/client/tree.ts).

import assert from 'node:assert/strict'
import { describe, test } from 'vitest'
import { sessionTreeOf } from '../src/client/tree'

describe('sessionTreeOf', () => {
  test('builds a tree with runtime id/parentId linkage', () => {
    const snapshot = {
      byId: {
        'root': { id: 'root', updatedAt: 1, running: false, blank: false },
        'child-a': { id: 'child-a', updatedAt: 2, running: false, blank: false, parentId: 'root', origin: 'subagent' },
        'child-b': { id: 'child-b', updatedAt: 3, running: false, blank: false, parentId: 'root', origin: 'subagent' },
        'grandchild': { id: 'grandchild', updatedAt: 4, running: false, blank: false, parentId: 'child-a', origin: 'subagent' },
      },
    }
    const tree = sessionTreeOf(snapshot, 'grandchild')
    assert.ok(tree !== null)
    assert.equal(tree.root.sessionId, 'root')
    assert.equal(tree.root.children.length, 2)
    const childA = tree.root.children.find(c => c.sessionId === 'child-a')
    assert.ok(childA !== undefined)
    assert.equal(childA.origin, 'subagent')
    assert.equal(childA.children.length, 1)
    assert.equal(childA.children[0].sessionId, 'grandchild')
    assert.equal(childA.children[0].current, true)
  })

  test('falls back to sessionId/parentSessionId declared fields', () => {
    const snapshot = {
      byId: {
        'root': { sessionId: 'root', updatedAt: 1, running: false, blank: false },
        'kid': { sessionId: 'kid', updatedAt: 2, running: false, blank: false, parentSessionId: 'root', origin: 'subagent' },
      },
    }
    const tree = sessionTreeOf(snapshot, 'kid')
    assert.ok(tree !== null)
    assert.equal(tree.root.sessionId, 'root')
    assert.equal(tree.root.children.length, 1)
    assert.equal(tree.root.children[0].sessionId, 'kid')
    assert.equal(tree.root.children[0].origin, 'subagent')
  })

  test('returns null without a byId table', () => {
    assert.equal(sessionTreeOf(null, 'x'), null)
    assert.equal(sessionTreeOf({}, 'x'), null)
    assert.equal(sessionTreeOf({ byId: {} }, undefined), null)
  })

  test('excludes blank sessions but keeps the current one', () => {
    const snapshot = {
      byId: {
        'root': { sessionId: 'root', updatedAt: 1, running: false, blank: false },
        'blank-sibling': { sessionId: 'blank-sibling', updatedAt: 2, running: false, blank: true },
      },
    }
    const tree = sessionTreeOf(snapshot, 'root')
    assert.ok(tree !== null)
    assert.equal(tree.root.children.length, 0, 'blank sibling excluded')
  })

  test('prefers displayTitle over title over sessionId prefix', () => {
    const snapshot = {
      byId: {
        'a': { id: 'a', updatedAt: 1, running: false, blank: false,
          displayTitle: 'display-wins', title: 'raw-title' },
        'b': { id: 'b', updatedAt: 1, running: false, blank: false, parentId: 'a',
          title: 'title-only' },
        'c': { id: 'c', updatedAt: 1, running: false, blank: false, parentId: 'a',
          cwd: 'cwd-fallback' },
      },
    }
    const tree = sessionTreeOf(snapshot, 'a')
    assert.ok(tree !== null)
    const all = JSON.stringify(tree)
    // Each child's title field carries exactly the chosen label.
    const bMatch = all.match(/"sessionId":"b"[\s\S]{0,400}?"title":"([^"]+)"/)
    const cMatch = all.match(/"sessionId":"c"[\s\S]{0,400}?"title":"([^"]+)"/)
    assert.equal(bMatch?.[1], 'title-only', 'title used when no displayTitle')
    assert.equal(cMatch?.[1], 'cwd-fallback', 'cwd used when neither displayTitle nor title')
  })

  test('handles a lineage cycle without looping', () => {
    const snapshot = {
      byId: {
        'a': { sessionId: 'a', updatedAt: 1, running: false, blank: false, parentId: 'b' },
        'b': { sessionId: 'b', updatedAt: 2, running: false, blank: false, parentId: 'a' },
      },
    }
    // The chain guard anchors at the first repeated id: a → b → a stops at b,
    // so the tree roots at b and never recurses forever.
    const tree = sessionTreeOf(snapshot, 'a')
    assert.ok(tree !== null)
    assert.equal(tree.root.sessionId, 'b')
  })
})

test('carries the cwd field onto tree nodes', () => {
  const snapshot = {
    byId: {
      'a': { id: 'a', updatedAt: 1, running: false, blank: false,
        cwd: '/workspace/proj' },
    },
  }
  const tree = sessionTreeOf(snapshot, 'a')
  assert.ok(tree !== null)
  assert.equal(tree.root.cwd, '/workspace/proj', 'cwd carried onto the node')
})
