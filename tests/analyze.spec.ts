// Unit tests for the model-analysis helpers (src/client/analyze.ts).

import assert from 'node:assert/strict'
import { describe, test } from 'vitest'
import { DEFAULT_ANALYSIS_INSTRUCT, analysisPrompt, replyTextOf } from '../src/client/analyze'

describe('analysisPrompt', () => {
  test('wraps the turn content with the instruction header', () => {
    const prompt = analysisPrompt('用户: hello\n助手: hi')
    assert.ok(prompt.startsWith('你是 DSH 的会话链路分析助手'))
    assert.ok(prompt.includes('===== 对话内容 ====='))
    assert.ok(prompt.endsWith('用户: hello\n助手: hi'))
  })

  test('defaults to the exported built-in instruction', () => {
    assert.ok(DEFAULT_ANALYSIS_INSTRUCT.startsWith('你是 DSH 的会话链路分析助手'))
    assert.ok(!DEFAULT_ANALYSIS_INSTRUCT.includes('===== 对话内容 ====='))
    assert.equal(analysisPrompt('content'), analysisPrompt('content', DEFAULT_ANALYSIS_INSTRUCT))
  })

  test('uses a custom instruction when supplied', () => {
    const custom = '用英文总结这个 turn 的缺陷'
    const prompt = analysisPrompt('内容', custom)
    assert.ok(prompt.startsWith(custom))
    assert.ok(prompt.includes('===== 对话内容 ====='))
    assert.ok(prompt.endsWith('内容'))
    assert.ok(!prompt.includes('你是 DSH 的会话链路分析助手'))
  })

  test('falls back to bare content for a blank instruction', () => {
    assert.equal(analysisPrompt('内容', '   '), '内容')
    assert.equal(analysisPrompt('内容', ''), '内容')
  })
})

describe('replyTextOf', () => {
  test('extracts assistant text from records', () => {
    const rows = [
      { type: 'event', event: { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: '分析结果' }] } } } },
      { type: 'chunks', event: { type: 'chunkrow/text-chunks' } },
    ]
    assert.equal(replyTextOf(rows), '分析结果')
  })

  test('handles string content', () => {
    const rows = [
      { type: 'event', event: { type: 'assistant/message', data: { message: { content: 'plain text' } } } },
    ]
    assert.equal(replyTextOf(rows), 'plain text')
  })

  test('ignores non-assistant and malformed rows', () => {
    const rows = [
      { type: 'event', event: { type: 'user/message', data: {} } },
      null,
      { type: 'event', event: null },
      { type: 'chunks' },
    ]
    assert.equal(replyTextOf(rows), '')
  })

  test('joins multiple assistant messages', () => {
    const rows = [
      { type: 'event', event: { type: 'assistant/message', data: { message: { content: 'a' } } } },
      { type: 'event', event: { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: 'b' }] } } } },
    ]
    assert.equal(replyTextOf(rows), 'a\nb')
  })
})
