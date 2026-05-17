export default defineEventHandler(async (event) => {
  const settings = getSettings()
  if (settings.enableApiKeyAuth) {
    const authHeader = getHeader(event, 'authorization') || ''
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (token !== settings.apiKey) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Unauthorized: Invalid API Key'
      })
    }
  }

  const body = await readBody(event)
  console.log('[OpenAI] Received request:', body)

  const result = await addRequest('openai', body)
  const now = Math.floor(Date.now() / 1000)
  const requestId = Math.random().toString(36).substring(2, 15)

  if (body.stream) {
    // Set headers for SSE
    setResponseHeaders(event, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    })

    const sendChunk = (chunk: any) => {
      event.node.res.write(`data: ${JSON.stringify(chunk)}\n\n`)
    }

    // 1. Send initial role chunk
    sendChunk({
      id: `chatcmpl-${requestId}`,
      object: 'chat.completion.chunk',
      created: now,
      model: body.model || 'gpt-4o',
      choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }]
    })

    // 2. Send content chunk
    if (result.content) {
      sendChunk({
        id: `chatcmpl-${requestId}`,
        object: 'chat.completion.chunk',
        created: now,
        model: body.model || 'gpt-4o',
        choices: [{ index: 0, delta: { content: result.content }, finish_reason: null }]
      })
    }

    // 3. Send tool calls chunk
    if (result.toolCalls && result.toolCalls.length > 0) {
      const tool_calls = result.toolCalls.map((tc, i) => ({
        index: i,
        id: tc.id || `call_${Math.random().toString(36).substring(2, 9)}`,
        type: 'function',
        function: {
          name: tc.function?.name || (tc as any).name,
          arguments: typeof tc.function?.arguments === 'string'
            ? tc.function.arguments
            : JSON.stringify(tc.function?.arguments || (tc as any).input || {})
        }
      }))

      sendChunk({
        id: `chatcmpl-${requestId}`,
        object: 'chat.completion.chunk',
        created: now,
        model: body.model || 'gpt-4o',
        choices: [{ index: 0, delta: { tool_calls }, finish_reason: null }]
      })
    }

    // 4. Send final stop chunk
    sendChunk({
      id: `chatcmpl-${requestId}`,
      object: 'chat.completion.chunk',
      created: now,
      model: body.model || 'gpt-4o',
      choices: [{ index: 0, delta: {}, finish_reason: (result.toolCalls && result.toolCalls.length > 0) ? 'tool_calls' : 'stop' }]
    })

    event.node.res.write('data: [DONE]\n\n')
    event.node.res.end()
    return
  } else {
    // Non-streaming JSON response
    const response: any = {
      id: `chatcmpl-${requestId}`,
      object: 'chat.completion',
      created: now,
      model: body.model || 'gpt-4o',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: result.content || null
          },
          finish_reason: (result.toolCalls && result.toolCalls.length > 0) ? 'tool_calls' : 'stop'
        }
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 10,
        total_tokens: 20
      }
    }

    if (result.toolCalls && result.toolCalls.length > 0) {
      response.choices[0].message.tool_calls = result.toolCalls.map(tc => ({
        id: tc.id || `call_${Math.random().toString(36).substring(2, 9)}`,
        type: 'function',
        function: {
          name: tc.function?.name || (tc as any).name,
          arguments: typeof tc.function?.arguments === 'string'
            ? tc.function.arguments
            : JSON.stringify(tc.function?.arguments || (tc as any).input || {})
        }
      }))
    }

    return response
  }
})
