export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
  name?: string
  input?: Record<string, unknown>
}

export interface RequestChunk {
  content?: string
  toolCalls?: ToolCall[]
  simulateStream?: boolean
  isFinal?: boolean
  _manualId?: string
}

export interface BaseMessage {
  role: string
  content?: string | Array<Record<string, unknown>> | null
  tool_calls?: ToolCall[]
  _is_manual?: boolean
  _manualId?: string
}

export interface ApiPayload {
  messages?: BaseMessage[]
  [key: string]: unknown
}

export interface PendingRequest {
  id: string
  type: 'openai' | 'claude' | 'openai-responses'
  payload: ApiPayload
  timestamp: number
  draft?: {
    response: string
    toolCalls: ToolCall[]
    simulateStream: boolean
  }
  // Callback to push data to the handler
  onData: (chunk: RequestChunk) => Promise<void>
  queue: Promise<void>
}

const pendingRequests = new Map<string, PendingRequest>()

export const addRequest = (type: 'openai' | 'claude' | 'openai-responses', payload: ApiPayload): Promise<PendingRequest> => {
  return new Promise((resolve) => {
    const id = Math.random().toString(36).substring(2, 15)
    const request: PendingRequest = {
      id,
      type,
      payload,
      timestamp: Date.now(),
      onData: async () => {}, // Will be set by the handler
      queue: Promise.resolve()
    }
    pendingRequests.set(id, request)
    console.log(`[RequestManager] Added ${type} request: ${id}`)
    resolve(request)
  })
}

export const getPendingRequests = () => {
  return Array.from(pendingRequests.values()).map(({ id, type, payload, timestamp, draft }) => ({
    id,
    type,
    payload,
    timestamp,
    draft
  }))
}

export const updateDraft = (id: string, draft: PendingRequest['draft']) => {
  const request = pendingRequests.get(id)
  if (!request) return
  request.draft = draft
}

export const pushToRequest = (id: string, chunk: Omit<RequestChunk, 'isFinal'>): Promise<void> => {
  const request = pendingRequests.get(id)
  if (!request) throw new Error(`Request ${id} not found`)

  // Clear draft when sending
  request.draft = undefined

  // Update payload with the manual response to persist history on refresh
  if (chunk.content || (chunk.toolCalls && chunk.toolCalls.length > 0)) {
    if (!request.payload.messages) request.payload.messages = []

    if (request.type === 'openai' || request.type === 'openai-responses') {
      request.payload.messages.push({
        role: 'assistant',
        content: chunk.content || null,
        tool_calls: chunk.toolCalls || undefined,
        _is_manual: true,
        _manualId: chunk._manualId
      })
    } else if (request.type === 'claude') {
      const content: Record<string, unknown>[] = []
      if (chunk.content) content.push({ type: 'text', text: chunk.content })
      if (chunk.toolCalls) {
        chunk.toolCalls.forEach((tc) => {
          content.push({
            type: 'tool_use',
            id: tc.id || `call_${Math.random().toString(36).substring(2, 9)}`,
            name: tc.function?.name || tc.name,
            input: typeof tc.function?.arguments === 'string' ? JSON.parse(tc.function.arguments) : (tc.input || {})
          })
        })
      }
      request.payload.messages.push({
        role: 'assistant',
        content: content,
        _is_manual: true,
        _manualId: chunk._manualId
      })
    }
  }

  const promise = request.queue.then(async () => {
    await request.onData({ ...chunk, isFinal: false })
  })
  request.queue = promise
  console.log(`[RequestManager] Queued data for request: ${id}`)
  return promise
}

export const finishRequest = (id: string, chunk?: Omit<RequestChunk, 'isFinal'>): Promise<void> => {
  const request = pendingRequests.get(id)
  if (!request) throw new Error(`Request ${id} not found`)

  // Also update payload on finish if chunk is provided
  if (chunk && (chunk.content || (chunk.toolCalls && chunk.toolCalls.length > 0))) {
    if (!request.payload.messages) request.payload.messages = []
    if (request.type === 'openai' || request.type === 'openai-responses') {
      request.payload.messages.push({
        role: 'assistant',
        content: chunk.content || null,
        tool_calls: chunk.toolCalls || undefined,
        _is_manual: true,
        _manualId: chunk._manualId
      })
    } else if (request.type === 'claude') {
      const content: Record<string, unknown>[] = []
      if (chunk.content) content.push({ type: 'text', text: chunk.content })
      if (chunk.toolCalls) {
        chunk.toolCalls.forEach((tc) => {
          content.push({
            type: 'tool_use',
            id: tc.id || `call_${Math.random().toString(36).substring(2, 9)}`,
            name: tc.function?.name || tc.name,
            input: typeof tc.function?.arguments === 'string' ? JSON.parse(tc.function.arguments) : (tc.input || {})
          })
        })
      }
      request.payload.messages.push({
        role: 'assistant',
        content: content,
        _is_manual: true,
        _manualId: chunk._manualId
      })
    }
  }

  const promise = request.queue.then(async () => {
    await request.onData({ ...chunk, isFinal: true })
    pendingRequests.delete(id)
    console.log(`[RequestManager] Finished request: ${id}`)
  })
  request.queue = promise
  return promise
}
