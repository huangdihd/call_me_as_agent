/* Smoke test for email utility functions (no network needed) */
import { renderPayload, extractRequestIdFromReferences, buildMessageId } from '../server/utils/emailManager'
import { stripQuotedText, matchRequestId } from '../server/utils/emailReplyManager'

const assert = (cond: unknown, msg: string) => {
  if (!cond) {
    console.error('✗ FAIL:', msg)
    process.exit(1)
  }
  console.log('✓', msg)
}

// renderPayload: openai messages
const openaiRender = renderPayload({
  messages: [
    { role: 'system', content: 'You are helpful.' },
    { role: 'user', content: [{ type: 'input_text', text: 'Look at this' }, { type: 'input_image', image_url: 'x' }] },
    { role: 'assistant', content: null, tool_calls: [{ id: '1', type: 'function', function: { name: 'get_weather', arguments: '{"city":"SF"}' } }] }
  ]
})
assert(openaiRender.includes('[SYSTEM]\nYou are helpful.'), 'renders system role')
assert(openaiRender.includes('[USER]\nLook at this\n[image]'), 'renders multimodal user content')
assert(openaiRender.includes('[TOOL_CALL] get_weather'), 'renders tool calls')

// renderPayload: claude style content blocks
const claudeRender = renderPayload({
  messages: [
    { role: 'user', content: [{ type: 'text', text: '你好' }] }
  ]
})
assert(claudeRender.includes('[USER]\n你好'), 'renders claude text blocks')

// renderPayload: responses API input string
assert(renderPayload({ input: 'plain string' }).includes('plain string'), 'renders string input')

// message id round-trip
const mid = buildMessageId('abc123def456789')
assert(extractRequestIdFromReferences(mid) === 'abc123def456789', 'extracts id from message-id')
assert(extractRequestIdFromReferences('<foo@bar> ' + mid) === 'abc123def456789', 'extracts id from references chain')
assert(extractRequestIdFromReferences('<other@example.com>') === null, 'ignores unrelated references')

// matchRequestId
assert(matchRequestId('[call-me-as-agent #abc123] New request', undefined) === 'abc123', 'matches subject token')
assert(matchRequestId(undefined, mid) === 'abc123def456789', 'matches in-reply-to')
assert(matchRequestId('random subject', undefined) === null, 'no match for unrelated email')

// stripQuotedText
assert(stripQuotedText('Please deploy now.\n\nOn Mon, Aug 29 at 10:00 someone wrote:\n> earlier stuff\n> more') === 'Please deploy now.', 'strips english quote block')
assert(stripQuotedText('好的，马上处理。\n\n在2026年8月29日 10:00，xxx 写道：\n> 引用内容') === '好的，马上处理。', 'strips chinese quote block')
assert(stripQuotedText('同意\n-----原始邮件-----\n发件人：a@b.com') === '同意', 'strips qq mail quote header')
assert(stripQuotedText('just a plain reply') === 'just a plain reply', 'keeps plain reply intact')
assert(stripQuotedText('> full quote') === '> full quote', 'keeps quote-only body intact (never delivers empty reply)')

console.log('\nAll smoke tests passed!')
process.exit(0)
