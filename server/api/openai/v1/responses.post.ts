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

    const buildBaseResponse = (status: string, output: any[] = [], usage: any = null) => ({
      id: `resp_${requestId}`,
      object: 'response',
      created: now,
      model: body.model || 'gpt-4o',
      status,
      output,
      usage
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
    const assistantItemId = `item_${Math.random().toString(36).substring(2, 9)}`
    let assistantItemAdded = false
    let totalContent = ''
    const finalOutputItems: any[] = []

    return new Promise<void>((resolve) => {
      request.onData = async (chunk) => {
        const speed = chunk.simulateStream ? (settings.streamSpeed || 30) : 0

        // Handle Content
        if (chunk.content) {
          totalContent += chunk.content
          completionTokens += Math.ceil(chunk.content.length / 3)
          
          if (!assistantItemAdded) {
            emit('response.output_item.added', {
                output_index: outputIndex,
                item: {
                    id: assistantItemId,
                    type: 'message',
                    status: 'in_progress',
                    role: 'assistant',
                    content: []
                }
            })
            emit('response.content_part.added', {
                item_id: assistantItemId,
                output_index: outputIndex,
                content_index: 0,
                part: { type: 'output_text', text: '' }
            })
            assistantItemAdded = true
          }

          if (speed === 0) {
            emit('response.output_text.delta', {
              item_id: assistantItemId,
              output_index: outputIndex,
              content_index: 0,
              delta: chunk.content
            })
          } else {
            for (let i = 0; i < chunk.content.length; i++) {
              emit('response.output_text.delta', {
                item_id: assistantItemId,
                output_index: outputIndex,
                content_index: 0,
                delta: chunk.content[i]
              })
              await new Promise(r => setTimeout(r, speed))
            }
          }
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
              output_index: outputIndex,
              item: toolItem
            })
            emit('response.output_item.done', {
              output_index: outputIndex,
              item: toolItem
            })
            outputIndex++
          })
        }

        if (chunk.isFinal) {
          clearInterval(keepAliveTimer)
          
          if (assistantItemAdded) {
            const assistantItem = {
                id: assistantItemId,
                type: 'message',
                status: 'completed',
                role: 'assistant',
                content: [{ type: 'output_text', text: totalContent }]
            }
            finalOutputItems.unshift(assistantItem)

            emit('response.output_text.done', {
                item_id: assistantItemId,
                output_index: 0,
                content_index: 0,
                text: totalContent
            })
            emit('response.content_part.done', {
                item_id: assistantItemId,
                output_index: 0,
                content_index: 0,
                part: { type: 'output_text', text: totalContent }
            })
            emit('response.output_item.done', {
                output_index: 0,
                item: assistantItem
            })
          }

          const usage = { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens }

          // Terminal events
          emit('response.completion', {
            response_id: `resp_${requestId}`,
            status: 'completed'
          })

          emit('response.done', {
            response: buildBaseResponse('completed', finalOutputItems, usage)
          })

          event.node.res.write('data: [DONE]\n\n')
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
    // Non-streaming: Wait for final
    return new Promise((resolve) => {
      let bufferedContent = ''
      const bufferedItems: any[] = []

      request.onData = (chunk) => {
        if (chunk.content) {
           bufferedContent += chunk.content
           completionTokens += Math.ceil(chunk.content.length / 3)
        }
        if (chunk.toolCalls) {
          chunk.toolCalls.forEach(tc => {
            const formattedArgs = typeof tc.function?.arguments === 'string' ? tc.function.arguments : JSON.stringify(tc.function?.arguments || (tc as any).input || {})
            completionTokens += Math.ceil(formattedArgs.length / 3)
            bufferedItems.push({ id: tc.id || `item_tc_${Math.random().toString(36).substring(2, 7)}`, type: 'function_call', status: 'completed', name: tc.function?.name || (tc as any).name, arguments: formattedArgs })
          })
        }
        if (chunk.isFinal) {
          const finalOutput = []
          if (bufferedContent) {
              finalOutput.push({ id: `item_${requestId}`, type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'text', text: bufferedContent }] })
          }
          finalOutput.push(...bufferedItems)

          resolve({
            id: `resp_${requestId}`,
            object: 'response',
            created: now,
            model: body.model || 'gpt-4o',
            status: 'completed',
            output: finalOutput,
            usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens }
          })
        }
      }
    })
  }
})
