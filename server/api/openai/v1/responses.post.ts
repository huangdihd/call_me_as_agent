import { getSettings } from '../../../utils/settingsManager'
import { addRequest } from '../../../utils/requestManager'
import { estimateTokens, extractContextText } from '../../../utils/tokenUtils'

export type OpenAIResponsesResponse = {
  id: string
  object: 'response'
  created_at: number
  status: string
  model: string
  output: Record<string, unknown>[]
  usage: {
    input_tokens: number
    output_tokens: number
    total_tokens: number
  } | null
  output_text: string
  conversation_id: string
}

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

  const now = Math.floor(Date.now() / 1000)

  // Token counting
  const inputContextText = extractContextText(body)
  const promptTokens = estimateTokens(inputContextText)

  const request = await addRequest('openai-responses', body)
  const requestId = request.id // Use the stable ID from request manager

  if (body.stream) {
    setResponseHeaders(event, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    })
    event.node.res.flushHeaders()

    let sequence = 0
    const emit = (eventName: string, data: Record<string, unknown>) => {
      if (!event.node.res.writableEnded) {
        const payload = {
          type: eventName,
          sequence_number: sequence++,
          ...data
        }
        event.node.res.write(`event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`)
      }
    }

    const buildBaseResponse = (status: string, output: Record<string, unknown>[] = [], usage: Record<string, unknown> | null = null, assistantText: string = '') => ({
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
        // 1. Send comment (standard)
        event.node.res.write(': keep-alive\n\n')
        // 2. Send active event to keep client/proxy active
        emit('response.in_progress', { response: buildBaseResponse('in_progress') })
      }
    }, (settings.keepAliveInterval || 10) * 1000)

    let outputIndex = 0
    let totalAssistantText = ''
    const finalOutputItems: Record<string, unknown>[] = []

    return new Promise<void>((resolve) => {
      request.onData = async (chunk) => {
        const speed = chunk.simulateStream ? (settings.streamSpeed || 30) : 0

        // Handle Content
        if (chunk.content) {
          const content = chunk.content
          totalAssistantText += content
          const itemId = `item_${Math.random().toString(36).substring(2, 9)}`

          emit('response.output_item.added', {
            output_index: outputIndex,
            item: { id: itemId, type: 'message', status: 'in_progress', role: 'assistant', content: [] }
          })
          emit('response.content_part.added', {
            item_id: itemId,
            output_index: outputIndex,
            content_index: 0,
            part: { type: 'output_text', text: '', annotations: [] }
          })

          if (speed === 0) {
            emit('response.output_text.delta', {
              item_id: itemId,
              output_index: outputIndex,
              content_index: 0,
              delta: content
            })
          } else {
            for (let i = 0; i < content.length; i++) {
              emit('response.output_text.delta', {
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
            item_id: itemId,
            output_index: outputIndex,
            content_index: 0,
            text: content
          })
          emit('response.content_part.done', {
            item_id: itemId,
            output_index: outputIndex,
            content_index: 0,
            part: completedItem.content[0]
          })
          emit('response.output_item.done', {
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
            const toolName = tc.function?.name || tc.name
            const formattedArgs = typeof tc.function?.arguments === 'string' ? tc.function.arguments : JSON.stringify(tc.function?.arguments || tc.input || {})

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
              item: { id: tcItemId, type: 'function_call', status: 'in_progress', name: toolName, arguments: '', call_id: callId }
            })
            emit('response.function_call_arguments.delta', {
              item_id: tcItemId,
              output_index: outputIndex,
              delta: formattedArgs
            })
            emit('response.function_call_arguments.done', {
              item_id: tcItemId,
              output_index: outputIndex,
              arguments: formattedArgs
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
          const completionTokens = estimateTokens(totalAssistantText) + finalOutputItems.filter(i => i.type === 'function_call').reduce((acc, i) => acc + estimateTokens(String(i.arguments)), 0)
          const usage = {
            input_tokens: promptTokens,
            output_tokens: completionTokens,
            total_tokens: promptTokens + completionTokens
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

          import('../../../utils/statsManager').then(({ incrementTokens }) => {
            incrementTokens(promptTokens, completionTokens)
          })

          await new Promise(r => setTimeout(r, 200))
          event.node.res.end()
          resolve(undefined)
        }
      }

      event.node.req.on('close', () => {
        clearInterval(keepAliveTimer)
        // DO NOT delete request from manager on disconnect to support retries
        resolve(undefined)
      })
    })
  } else {
    // Non-streaming: Wait for final chunk with heartbeat
    return new Promise((resolve) => {
      // Setup keep-alive for non-streaming: send whitespace to keep connection alive
      const keepAliveTimer = setInterval(() => {
        if (!event.node.res.writableEnded) {
          event.node.res.write(' ') // Send a space to keep connection alive
        }
      }, (settings.keepAliveInterval || 10) * 1000)

      const finalOutput: Record<string, unknown>[] = []
      let totalText = ''
      request.onData = async (chunk) => {
        if (chunk.content) {
          totalText += chunk.content
          finalOutput.push({ id: `item_${Math.random().toString(36).substring(2, 7)}`, type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: chunk.content, annotations: [] }] })
        }
        if (chunk.toolCalls) {
          chunk.toolCalls.forEach((tc) => {
            const formattedArgs = typeof tc.function?.arguments === 'string' ? tc.function.arguments : JSON.stringify(tc.function?.arguments || tc.input || {})
            finalOutput.push({
              id: `item_${Math.random().toString(36).substring(2, 7)}`,
              type: 'function_call',
              status: 'completed',
              name: tc.function?.name || tc.name,
              arguments: formattedArgs,
              call_id: tc.id || `call_${Math.random().toString(36).substring(2, 9)}`
            })
          })
        }
        if (chunk.isFinal) {
          clearInterval(keepAliveTimer)
          const completionTokens = estimateTokens(totalText) + finalOutput.filter(i => i.type === 'function_call').reduce((acc, i) => acc + estimateTokens(String(i.arguments)), 0)
          const result = {
            id: `resp_${requestId}`,
            object: 'response',
            created_at: now,
            model: body.model || 'gpt-4o',
            status: 'completed',
            output: finalOutput,
            output_text: totalText,
            usage: { input_tokens: promptTokens, output_tokens: completionTokens, total_tokens: promptTokens + completionTokens },
            conversation_id: `conv_${requestId}`
          } as OpenAIResponsesResponse

          import('../../../utils/statsManager').then(({ incrementTokens }) => {
            incrementTokens(promptTokens, completionTokens)
          })

          if (!event.node.res.writableEnded) {
            event.node.res.setHeader('Content-Type', 'application/json')
            event.node.res.end(JSON.stringify(result))
          }
          resolve(undefined)
        }
      }

      event.node.req.on('close', () => {
        clearInterval(keepAliveTimer)
        resolve(undefined)
      })
    })
  }
})
