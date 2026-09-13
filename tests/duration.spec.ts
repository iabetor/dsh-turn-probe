// Unit tests for turn duration formatting (src/client/duration.ts).

import assert from 'node:assert/strict'
import { describe, test } from 'vitest'
import { formatDuration, turnDuration } from '../src/client/duration'

describe('formatDuration', () => {
  test('shows sub-second durations in whole milliseconds', () => {
    assert.equal(formatDuration(0), '0ms')
    assert.equal(formatDuration(1), '1ms')
    assert.equal(formatDuration(840), '840ms')
    assert.equal(formatDuration(999), '999ms')
  })

  test('shows second-scale durations with one decimal', () => {
    assert.equal(formatDuration(1000), '1.0s')
    assert.equal(formatDuration(12_400), '12.4s')
    assert.equal(formatDuration(59_900), '59.9s')
  })

  test('rolls over to whole seconds at the minute mark', () => {
    assert.equal(formatDuration(60_000), '1m00s')
    assert.equal(formatDuration(92_000), '1m32s')
    assert.equal(formatDuration(3_599_000), '59m59s')
  })

  test('rolls over to whole minutes at the hour mark', () => {
    assert.equal(formatDuration(3_600_000), '1h00m')
    assert.equal(formatDuration(3_930_000), '1h05m')
  })

  test('keeps the minute part zero-padded so widths stay put', () => {
    // 1h05m, not 1h5m — a jumping width would shift the surrounding row.
    assert.equal(formatDuration(3_900_000), '1h05m')
    assert.equal(formatDuration(65_000), '1m05s')
  })

  test('treats negative, NaN, and infinite input as zero', () => {
    assert.equal(formatDuration(-1), '0ms')
    assert.equal(formatDuration(Number.NaN), '0ms')
    assert.equal(formatDuration(Number.POSITIVE_INFINITY), '0ms')
  })
})

describe('turnDuration', () => {
  test('formats a finished turn from its two timestamps', () => {
    assert.equal(turnDuration({ startedAt: 1000, endedAt: 13_400 }), '12.4s')
  })

  test('returns undefined while a turn is still running', () => {
    // A live turn would otherwise render a number that changes on every tick,
    // which would re-render the whole list.
    assert.equal(turnDuration({ startedAt: 1000 }), undefined)
    assert.equal(turnDuration({}), undefined)
  })

  test('returns undefined when only the end timestamp is present', () => {
    assert.equal(turnDuration({ endedAt: 1000 }), undefined)
  })

  test('formats a zero-length turn rather than omitting it', () => {
    // Both timestamps present and equal is a real (instant) turn, not an
    // unknown one — it must show 0ms, not disappear.
    assert.equal(turnDuration({ startedAt: 5000, endedAt: 5000 }), '0ms')
  })
})
