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
  console.log('[OpenAI Responses] Received request:', body)

  const requestId = Math.random().toString(36).substring(2, 15)
  const now = Math.floor(Date.now() / 1000)

  // Token counting
  let promptTokens = 0
  let completionTokens = 0
  const estimateTokens = (obj: any) => Math.ceil(JSON.stringify(obj).length / 3)
  promptTokens = estimateTokens(body.input || body.instructions)

  const request = await addRequest('openai-responses', body)

  if (body.stream) {
    setResponseHeaders(event, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    })
    event.node.res.flushHeaders()

    let sequence = 0
    const emit = (eventName: string, data: any) => {
      if (!event.node.res.writableEnded) {
        const payload = {
          type: eventName,
          sequence_number: sequence++,
          ...data
        }
        event.node.res.write(`event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`)
      }
    }

    const buildBaseResponse = (status: string, output: any[] = [], usage: any = null, assistantText: string = '') => ({
      id: `resp_${requestId}`,
      object: 'response',
      created_at: now,
      status,
      model: body.model || 'gpt-4o',
      output: (status === 'completed' || output.length > 0) ? output : [],
      usage: status === 'completed' ? usage : null,
      output_text: assistantText,
      conversation_id: `conv_${requestId}`
    })

    // 1. Initial events
    emit('response.created', { response: buildBaseResponse('in_progress') })
    emit('response.in_progress', { response: buildBaseResponse('in_progress') })

    // Setup keep-alive
    const keepAliveTimer = setInterval(() => {
      if (!event.node.res.writableEnded) {
        event.node.res.write(': keep-alive\n\n')
      }
    }, (settings.keepAliveInterval || 15) * 1000)

    let outputIndex = 0
    let totalAssistantText = ''
    const finalOutputItems: any[] = []

    return new Promise<void>((resolve) => {
      request.onData = async (chunk) => {
        const speed = chunk.simulateStream ? (settings.streamSpeed || 30) : 0

        // Handle Content
        if (chunk.content) {
          const content = chunk.content
          totalAssistantText += content
          completionTokens += Math.ceil(content.length / 3)
          const itemId = `item_${Math.random().toString(36).substring(2, 9)}`

          emit('response.output_item.added', {
            response_id: `resp_${requestId}`,
            output_index: outputIndex,
            item: { id: itemId, type: 'message', status: 'in_progress', role: 'assistant', content: [] }
          })
          emit('response.content_part.added', {
            response_id: `resp_${requestId}`,
            item_id: itemId,
            output_index: outputIndex,
            content_index: 0,
            part: { type: 'output_text', text: '', annotations: [] }
          })

          if (speed === 0) {
            emit('response.output_text.delta', {
              response_id: `resp_${requestId}`,
              item_id: itemId,
              output_index: outputIndex,
              content_index: 0,
              delta: content
            })
          } else {
            for (let i = 0; i < content.length; i++) {
              emit('response.output_text.delta', {
                response_id: `resp_${requestId}`,
                item_id: itemId,
                output_index: outputIndex,
                content_index: 0,
                delta: content[i]
              })
              await new Promise(r => setTimeout(r, speed))
            }
          }

          const completedItem = {
            id: itemId,
            type: 'message',
            status: 'completed',
            role: 'assistant',
            content: [{ type: 'output_text', text: content, annotations: [] }]
          }
          finalOutputItems.push(completedItem)

          emit('response.output_text.done', {
            response_id: `resp_${requestId}`,
            item_id: itemId,
            output_index: outputIndex,
            content_index: 0,
            text: content
          })
          emit('response.content_part.done', {
            response_id: `resp_${requestId}`,
            item_id: itemId,
            output_index: outputIndex,
            content_index: 0,
            part: completedItem.content[0]
          })
          emit('response.output_item.done', {
            response_id: `resp_${requestId}`,
            output_index: outputIndex,
            item: completedItem
          })
          outputIndex++
        }

        // Handle Tool Calls
        if (chunk.toolCalls && chunk.toolCalls.length > 0) {
          chunk.toolCalls.forEach((tc) => {
            const tcItemId = `item_${Math.random().toString(36).substring(2, 9)}`
            const callId = tc.id || `call_${Math.random().toString(36).substring(2, 9)}`
            const toolName = tc.function?.name || (tc as any).name
            const formattedArgs = typeof tc.function?.arguments === 'string' ? tc.function.arguments : JSON.stringify(tc.function?.arguments || (tc as any).input || {})

            completionTokens += Math.ceil(formattedArgs.length / 3)

            const toolItem = {
              id: tcItemId,
              type: 'function_call',
              status: 'completed',
              call_id: callId,
              name: toolName,
              arguments: formattedArgs
            }
            finalOutputItems.push(toolItem)

            emit('response.output_item.added', {
              response_id: `resp_${requestId}`,
              output_index: outputIndex,
              item: { id: tcItemId, type: 'function_call', status: 'in_progress', name: toolName, arguments: '', call_id: callId }
            })
            emit('response.function_call_arguments.delta', {
              response_id: `resp_${requestId}`,
              item_id: tcItemId,
              output_index: outputIndex,
              delta: formattedArgs
            })
            emit('response.function_call_arguments.done', {
              response_id: `resp_${requestId}`,
              item_id: tcItemId,
              output_index: outputIndex,
              arguments: formattedArgs
            })
            emit('response.output_item.done', {
              response_id: `resp_${requestId}`,
              output_index: outputIndex,
              item: toolItem
            })
            outputIndex++
          })
        }

        if (chunk.isFinal) {
          clearInterval(keepAliveTimer)
          const usage = {
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: promptTokens + completionTokens,
            input_tokens: promptTokens,
            output_tokens: completionTokens
          }
          const finalResponse = buildBaseResponse('completed', finalOutputItems, usage, totalAssistantText)

          // --- TERMINATION SEQUENCE ---

          // 1. Send response.completed (Codex Handshake)
          emit('response.completed', {
            response: finalResponse
          })

          // 2. Send response.done (Standard)
          emit('response.done', {
            response: finalResponse
          })

          await new Promise(r => setTimeout(r, 200))
          event.node.res.end()
          resolve()
        }
      }

      event.node.req.on('close', () => {
        clearInterval(keepAliveTimer)
        finishRequest(request.id)
        resolve()
      })
    })
  } else {
    // Non-streaming
    return new Promise((resolve) => {
      const finalOutput: any[] = []
      let totalText = ''
      request.onData = (chunk) => {
        if (chunk.content) {
          totalText += chunk.content
          completionTokens += Math.ceil(chunk.content.length / 3)
          finalOutput.push({ id: `item_${Math.random().toString(36).substring(2, 7)}`, type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: chunk.content, annotations: [] }] })
        }
        if (chunk.toolCalls) {
          chunk.toolCalls.forEach((tc) => {
            const formattedArgs = typeof tc.function?.arguments === 'string' ? tc.function.arguments : JSON.stringify(tc.function?.arguments || (tc as any).input || {})
            completionTokens += Math.ceil(formattedArgs.length / 3)
            finalOutput.push({
              id: `item_${Math.random().toString(36).substring(2, 7)}`,
              type: 'function_call',
              status: 'completed',
              name: tc.function?.name || (tc as any).name,
              arguments: formattedArgs,
              call_id: tc.id || `call_${Math.random().toString(36).substring(2, 9)}`
            })
          })
        }
        if (chunk.isFinal) {
          resolve({
            id: `resp_${requestId}`,
            object: 'response',
            created_at: now,
            model: body.model || 'gpt-4o',
            status: 'completed',
            output: finalOutput,
            output_text: totalText,
            usage: { input_tokens: promptTokens, output_tokens: completionTokens, total_tokens: promptTokens + completionTokens }
          })
        }
      }
    })
  }
})
