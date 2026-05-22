import { getSettings } from '../../../utils/settingsManager'
import { addRequest } from '../../../utils/requestManager'
import { estimateTokens, extractContextText } from '../../../utils/tokenUtils'

export type ClaudeMessagesResponse = {
  id: string
  type: 'message'
  role: 'assistant'
  content: Array<{
    type: 'text' | 'tool_use'
    text?: string
    id?: string
    name?: string
    input?: Record<string, unknown>
  }>
  model: string
  stop_reason: 'end_turn' | 'tool_use' | string | null
  stop_sequence: string | null
  usage: {
    input_tokens: number
    output_tokens: number
  }
}

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

  // Token counting
  const inputContextText = extractContextText(body)
  const promptTokens = estimateTokens(inputContextText)

  const request = await addRequest('claude', body)
  const requestId = request.id

  if (body.stream) {
    setResponseHeaders(event, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    })
    event.node.res.flushHeaders()

    const sendSSE = (eventName: string, data: unknown) => {
      if (!event.node.res.writableEnded) {
        event.node.res.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`)
      }
    }

    // 1. Initial message start (SEND IMMEDIATELY)
    sendSSE('message_start', {
      type: 'message_start',
      message: {
        id: `msg-${requestId}`,
        type: 'message',
        role: 'assistant',
        content: [],
        model: body.model || 'claude-3-5-sonnet-20241022',
        usage: { input_tokens: promptTokens, output_tokens: 0 }
      }
    })

    // Setup keep-alive
    const keepAliveTimer = setInterval(() => {
      if (!event.node.res.writableEnded) {
        sendSSE('ping', { type: 'ping' })
      }
    }, (settings.keepAliveInterval || 15) * 1000)

    let contentBlockIndex = 0
    let totalAssistantText = ''
    const finalToolInputs: string[] = []

    return new Promise<void>((resolve) => {
      request.onData = async (chunk) => {
        const speed = chunk.simulateStream ? (settings.streamSpeed || 30) : 0

        // Handle Content
        if (chunk.content) {
          const content = chunk.content
          totalAssistantText += content

          sendSSE('content_block_start', {
            type: 'content_block_start',
            index: contentBlockIndex,
            content_block: { type: 'text', text: '' }
          })

          if (speed === 0) {
            sendSSE('content_block_delta', {
              type: 'content_block_delta',
              index: contentBlockIndex,
              delta: { type: 'text_delta', text: content }
            })
          } else {
            for (let i = 0; i < content.length; i++) {
              sendSSE('content_block_delta', {
                type: 'content_block_delta',
                index: contentBlockIndex,
                delta: { type: 'text_delta', text: content[i] }
              })
              await new Promise(r => setTimeout(r, speed))
            }
          }
          sendSSE('content_block_stop', { type: 'content_block_stop', index: contentBlockIndex })
          contentBlockIndex++
        }

        // Handle Tool Calls
        if (chunk.toolCalls && chunk.toolCalls.length > 0) {
          chunk.toolCalls.forEach((tc) => {
            const tcId = tc.id || `call_${Math.random().toString(36).substring(2, 9)}`
            const toolName = tc.function?.name || tc.name
            const toolInput = typeof tc.function?.arguments === 'string' ? JSON.parse(tc.function.arguments) : (tc.input || {})
            const fullJson = JSON.stringify(toolInput)
            finalToolInputs.push(fullJson)

            // 1. content_block_start
            sendSSE('content_block_start', {
              type: 'content_block_start',
              index: contentBlockIndex,
              content_block: { type: 'tool_use', id: tcId, name: toolName }
            })

            // 2. content_block_delta (input_json_delta)
            sendSSE('content_block_delta', {
              type: 'content_block_delta',
              index: contentBlockIndex,
              delta: { type: 'input_json_delta', partial_json: fullJson }
            })

            // 3. content_block_stop
            sendSSE('content_block_stop', { type: 'content_block_stop', index: contentBlockIndex })

            contentBlockIndex++
          })
        }

        if (chunk.isFinal) {
          clearInterval(keepAliveTimer)
          const completionTokens = estimateTokens(totalAssistantText) + finalToolInputs.reduce((acc, input) => acc + estimateTokens(input), 0)

          sendSSE('message_delta', {
            type: 'message_delta',
            delta: { stop_reason: (chunk.toolCalls && chunk.toolCalls.length > 0) ? 'tool_use' : 'end_turn', stop_sequence: null },
            usage: { output_tokens: completionTokens }
          })
          sendSSE('message_stop', { type: 'message_stop' })

          import('../../../utils/statsManager').then(({ incrementTokens }) => {
            incrementTokens(promptTokens, completionTokens)
          })

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
    // Non-streaming: Wait for final with heartbeat
    return new Promise((resolve) => {
      // Setup keep-alive for non-streaming: send whitespace to keep connection alive
      const keepAliveTimer = setInterval(() => {
        if (!event.node.res.writableEnded) {
          event.node.res.write(' ') // Send a space to keep connection alive
        }
      }, (settings.keepAliveInterval || 15) * 1000)

      const bufferedContent: Record<string, unknown>[] = []
      let totalText = ''
      const toolInputs: string[] = []

      request.onData = async (chunk) => {
        if (chunk.content) {
          totalText += chunk.content
          bufferedContent.push({ type: 'text', text: chunk.content })
        }
        if (chunk.toolCalls) {
          chunk.toolCalls.forEach((tc) => {
            const toolInput = typeof tc.function?.arguments === 'string' ? JSON.parse(tc.function.arguments) : (tc.input || {})
            const fullJson = JSON.stringify(toolInput)
            toolInputs.push(fullJson)
            bufferedContent.push({
              type: 'tool_use',
              id: tc.id || `call_${Math.random().toString(36).substring(2, 9)}`,
              name: tc.function?.name || tc.name,
              input: toolInput
            })
          })
        }

        if (chunk.isFinal) {
          clearInterval(keepAliveTimer)
          const completionTokens = estimateTokens(totalText) + toolInputs.reduce((acc, input) => acc + estimateTokens(input), 0)

          import('../../../utils/statsManager').then(({ incrementTokens }) => {
            incrementTokens(promptTokens, completionTokens)
          })

          const result = {
            id: `msg-${requestId}`,
            type: 'message',
            role: 'assistant',
            content: bufferedContent,
            model: body.model || 'claude-3-5-sonnet-20241022',
            stop_reason: bufferedContent.some(c => c.type === 'tool_use') ? 'tool_use' : 'end_turn',
            stop_sequence: null,
            usage: { input_tokens: promptTokens, output_tokens: completionTokens }
          } as ClaudeMessagesResponse

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
