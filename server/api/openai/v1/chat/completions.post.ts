import { getSettings } from '../../../../utils/settingsManager'
import { addRequest, type ToolCall } from '../../../../utils/requestManager'
import { estimateTokens, extractContextText } from '../../../../utils/tokenUtils'

export type OpenAICompletionResponse = {
  id: string
  object: 'chat.completion'
  created: number
  model: string
  choices: Array<{
    index: number
    message: {
      role: 'assistant'
      content: string | null
      tool_calls?: Array<{
        id: string
        type: 'function'
        function: { name: string, arguments: string }
      }>
    }
    finish_reason: string
  }>
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
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
  console.log('[OpenAI] Received request:', body)

  const now = Math.floor(Date.now() / 1000)

  // Token counting state
  const inputContextText = extractContextText(body)
  const promptTokens = estimateTokens(inputContextText)

  const request = await addRequest('openai', body)
  const requestId = request.id

  if (body.stream) {
    setResponseHeaders(event, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    })
    event.node.res.flushHeaders()

    const sendChunk = (chunk: Record<string, unknown>) => {
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

    let totalAssistantText = ''
    const finalToolCalls: any[] = []

    return new Promise<void>((resolve) => {
      request.onData = async (chunk) => {
        const speed = chunk.simulateStream ? (settings.streamSpeed || 30) : 0

        // Handle Content
        if (chunk.content) {
          const content = chunk.content
          totalAssistantText += content

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
              name: tc.function?.name || tc.name || '',
              arguments: typeof tc.function?.arguments === 'string'
                ? tc.function.arguments
                : JSON.stringify(tc.function?.arguments || tc.input || {})
            }
          }))
          finalToolCalls.push(...tool_calls)

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
          const completionTokens = estimateTokens(totalAssistantText) + finalToolCalls.reduce((acc, tc) => acc + estimateTokens(tc.function.arguments), 0)
          
          const lastChunk = {
            id: `chatcmpl-${requestId}`,
            object: 'chat.completion.chunk',
            created: now,
            model: body.model || 'gpt-4o',
            choices: [{ index: 0, delta: {}, finish_reason: (chunk.toolCalls && chunk.toolCalls.length > 0) ? 'tool_calls' : 'stop' }]
          }
          
          if (body.stream_options?.include_usage) {
            (lastChunk as any).usage = null
          }
          sendChunk(lastChunk)

          if (body.stream_options?.include_usage) {
            const usageChunk = {
              id: `chatcmpl-${requestId}`,
              object: 'chat.completion.chunk',
              created: now,
              model: body.model || 'gpt-4o',
              choices: [],
              usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens }
            }
            sendChunk(usageChunk)
          }

          event.node.res.write('data: [DONE]\n\n')

          import('../../../../utils/statsManager').then(({ incrementTokens }) => {
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
    // Non-streaming: Wait for final chunk with heartbeat
    return new Promise((resolve) => {
      // Setup keep-alive for non-streaming: send whitespace to keep connection alive
      const keepAliveTimer = setInterval(() => {
        if (!event.node.res.writableEnded) {
          event.node.res.write(' ') // Send a space to keep connection alive
        }
      }, (settings.keepAliveInterval || 15) * 1000)

      let bufferedContent = ''
      const bufferedTools: ToolCall[] = []

      request.onData = async (chunk) => {
        if (chunk.content) bufferedContent += chunk.content
        if (chunk.toolCalls) bufferedTools.push(...chunk.toolCalls)

        if (chunk.isFinal) {
          clearInterval(keepAliveTimer)
          const completionTokens = estimateTokens(bufferedContent) + bufferedTools.reduce((acc, tc) => {
            const args = typeof tc.function?.arguments === 'string' ? tc.function.arguments : JSON.stringify(tc.function?.arguments || tc.input || {})
            return acc + estimateTokens(args)
          }, 0)

          const result = {
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
                  ? bufferedTools.map((tc, _) => ({
                      id: tc.id || `call_${Math.random().toString(36).substring(2, 9)}`,
                      type: 'function',
                      function: {
                        name: tc.function?.name || tc.name || '',
                        arguments: typeof tc.function?.arguments === 'string' ? tc.function.arguments : JSON.stringify(tc.function?.arguments || tc.input || {})
                      }
                    }))
                  : undefined
              },
              finish_reason: bufferedTools.length > 0 ? 'tool_calls' : 'stop'
            }],
            usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens }
          } as OpenAICompletionResponse

          import('../../../../utils/statsManager').then(({ incrementTokens }) => {
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
