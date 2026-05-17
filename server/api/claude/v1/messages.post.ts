export default defineEventHandler(async (event) => {
  const settings = getSettings()
  if (settings.enableApiKeyAuth) {
    const apiKey = getHeader(event, 'x-api-key') || ''
    if (apiKey !== settings.apiKey) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Unauthorized: Invalid API Key'
      })
    }
  }

  const body = await readBody(event)
  console.log('[Claude] Received request:', body)

  const result = await addRequest('claude', body)
  const requestId = Math.random().toString(36).substring(2, 15)

  if (body.stream) {
    setResponseHeaders(event, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    })

    const sendSSE = (eventName: string, data: any) => {
      event.node.res.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`)
    }

    // 1. Message start
    sendSSE('message_start', {
      type: 'message_start',
      message: {
        id: `msg-${requestId}`,
        type: 'message',
        role: 'assistant',
        content: [],
        model: body.model || 'claude-3-5-sonnet-20241022',
        usage: { input_tokens: 10, output_tokens: 0 }
      }
    })

    // 2. Content block start (Text)
    if (result.content) {
      sendSSE('content_block_start', {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' }
      })
      sendSSE('content_block_delta', {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: result.content }
      })
      sendSSE('content_block_stop', { type: 'content_block_stop', index: 0 })
    }

    // 3. Tool use blocks
    if (result.toolCalls && result.toolCalls.length > 0) {
      result.toolCalls.forEach((tc, i) => {
        const index = result.content ? i + 1 : i
        sendSSE('content_block_start', {
          type: 'content_block_start',
          index,
          content_block: {
            type: 'tool_use',
            id: tc.id || `call_${Math.random().toString(36).substring(2, 9)}`,
            name: tc.function?.name || (tc as any).name,
            input: {}
          }
        })
        sendSSE('content_block_delta', {
          type: 'content_block_delta',
          index,
          delta: {
            type: 'input_json_delta',
            partial_json: typeof tc.function?.arguments === 'string' ? tc.function.arguments : JSON.stringify(tc.function?.arguments || (tc as any).input || {})
          }
        })
        sendSSE('content_block_stop', { type: 'content_block_stop', index })
      })
    }

    // 4. Message delta & stop
    sendSSE('message_delta', {
      type: 'message_delta',
      delta: { stop_reason: (result.toolCalls && result.toolCalls.length > 0) ? 'tool_use' : 'end_turn', stop_sequence: null },
      usage: { output_tokens: 10 }
    })
    sendSSE('message_stop', { type: 'message_stop' })

    event.node.res.end()
    return
  } else {
    // Non-streaming JSON
    const content: any[] = []
    if (result.content) {
      content.push({ type: 'text', text: result.content })
    }
    if (result.toolCalls && result.toolCalls.length > 0) {
      result.toolCalls.forEach((tc) => {
        content.push({
          type: 'tool_use',
          id: tc.id || `call_${Math.random().toString(36).substring(2, 9)}`,
          name: tc.function?.name || (tc as any).name,
          input: typeof tc.function?.arguments === 'string' ? JSON.parse(tc.function.arguments) : ((tc as any).input || {})
        })
      })
    }

    return {
      id: `msg-${requestId}`,
      type: 'message',
      role: 'assistant',
      content,
      model: body.model || 'claude-3-5-sonnet-20241022',
      stop_reason: (result.toolCalls && result.toolCalls.length > 0) ? 'tool_use' : 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 10 }
    }
  }
})
