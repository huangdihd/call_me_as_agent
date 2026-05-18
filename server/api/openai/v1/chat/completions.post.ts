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

  const requestId = Math.random().toString(36).substring(2, 15)
  const now = Math.floor(Date.now() / 1000)

  // Token counting state
  let promptTokens = 0
  let completionTokens = 0

  const estimateTokens = (obj: any) => Math.ceil(JSON.stringify(obj).length / 3)
  promptTokens = estimateTokens(body.messages)

  const request = await addRequest('openai', body)

  if (body.stream) {
    setResponseHeaders(event, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    })
    event.node.res.flushHeaders()

    const sendChunk = (chunk: any) => {
      if (!event.node.res.writableEnded) {
        event.node.res.write(`data: ${JSON.stringify(chunk)}\n\n`)
      }
    }

    // 1. Initial role
    sendChunk({
      id: `chatcmpl-${requestId}`,
      object: 'chat.completion.chunk',
      created: now,
      model: body.model || 'gpt-4o',
      choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }]
    })

    // Setup keep-alive
    const keepAliveTimer = setInterval(() => {
      if (!event.node.res.writableEnded) {
        event.node.res.write(': keep-alive\n\n')
      }
    }, (settings.keepAliveInterval || 15) * 1000)

    return new Promise<void>((resolve) => {
      request.onData = async (chunk) => {
        const speed = chunk.simulateStream ? (settings.streamSpeed || 30) : 0


        // Handle Content
        if (chunk.content) {
          const content = chunk.content
          completionTokens += Math.ceil(content.length / 3)

          if (speed === 0) {
            sendChunk({
              id: `chatcmpl-${requestId}`,
              object: 'chat.completion.chunk',
              created: now,
              model: body.model || 'gpt-4o',
              choices: [{ index: 0, delta: { content }, finish_reason: null }]
            })
          } else {
            for (let i = 0; i < content.length; i++) {
              sendChunk({
                id: `chatcmpl-${requestId}`,
                object: 'chat.completion.chunk',
                created: now,
                model: body.model || 'gpt-4o',
                choices: [{ index: 0, delta: { content: content[i] }, finish_reason: null }]
              })
              await new Promise(r => setTimeout(r, speed))
            }
          }
        }

        // Handle Tool Calls
        if (chunk.toolCalls && chunk.toolCalls.length > 0) {
          const tool_calls = chunk.toolCalls.map((tc, i) => ({
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
          completionTokens += Math.ceil(JSON.stringify(tool_calls).length / 3)

          sendChunk({
            id: `chatcmpl-${requestId}`,
            object: 'chat.completion.chunk',
            created: now,
            model: body.model || 'gpt-4o',
            choices: [{ index: 0, delta: { tool_calls }, finish_reason: null }]
          })
        }

        if (chunk.isFinal) {
          clearInterval(keepAliveTimer)
          const lastChunk: any = {
            id: `chatcmpl-${requestId}`,
            object: 'chat.completion.chunk',
            created: now,
            model: body.model || 'gpt-4o',
            choices: [{ index: 0, delta: {}, finish_reason: (chunk.toolCalls && chunk.toolCalls.length > 0) ? 'tool_calls' : 'stop' }]
          }
          if (body.stream_options?.include_usage) {
            lastChunk.usage = { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens }
          }
          sendChunk(lastChunk)
          event.node.res.write('data: [DONE]\n\n')
          event.node.res.end()
          resolve()
        }
      }

      event.node.req.on('close', () => {
        clearInterval(keepAliveTimer)
        finishRequest(request.id) // Cleanup on disconnect
        resolve()
      })
    })
  } else {
    // Non-streaming: Wait for final chunk
    return new Promise((resolve) => {
      let bufferedContent = ''
      const bufferedTools: any[] = []

      request.onData = (chunk) => {
        if (chunk.content) bufferedContent += chunk.content
        if (chunk.toolCalls) bufferedTools.push(...chunk.toolCalls)

        if (chunk.isFinal) {
          const totalTokens = promptTokens + Math.ceil((bufferedContent.length + JSON.stringify(bufferedTools).length) / 3)
          resolve({
            id: `chatcmpl-${requestId}`,
            object: 'chat.completion',
            created: now,
            model: body.model || 'gpt-4o',
            choices: [{
              index: 0,
              message: {
                role: 'assistant',
                content: bufferedContent || null,
                tool_calls: bufferedTools.length > 0
                  ? bufferedTools.map((tc, i) => ({
                      id: tc.id || `call_${Math.random().toString(36).substring(2, 9)}`,
                      type: 'function',
                      function: {
                        name: tc.function?.name || (tc as any).name,
                        arguments: typeof tc.function?.arguments === 'string' ? tc.function.arguments : JSON.stringify(tc.function?.arguments || (tc as any).input || {})
                      }
                    }))
                  : undefined
              },
              finish_reason: bufferedTools.length > 0 ? 'tool_calls' : 'stop'
            }],
            usage: { prompt_tokens: promptTokens, completion_tokens: totalTokens - promptTokens, total_tokens: totalTokens }
          })
        }
      }
    })
  }
})
