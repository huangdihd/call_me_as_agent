export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
  name?: string
  input?: any
}

export interface RequestChunk {
  content?: string
  toolCalls?: ToolCall[]
  simulateStream?: boolean
  isFinal?: boolean
}

export interface PendingRequest {
  id: string
  type: 'openai' | 'claude' | 'openai-responses'
  payload: any
  timestamp: number
  // Callback to push data to the handler
  onData: (chunk: RequestChunk) => Promise<void>
  queue: Promise<void>
}

const pendingRequests = new Map<string, PendingRequest>()

export const addRequest = (type: 'openai' | 'claude' | 'openai-responses', payload: any): Promise<PendingRequest> => {
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
  return Array.from(pendingRequests.values()).map(({ id, type, payload, timestamp }) => ({
    id,
    type,
    payload,
    timestamp
  }))
}

export const pushToRequest = (id: string, chunk: Omit<RequestChunk, 'isFinal'>) => {
  const request = pendingRequests.get(id)
  if (!request) throw new Error(`Request ${id} not found`)

  request.queue = request.queue.then(async () => {
    await request.onData({ ...chunk, isFinal: false })
  })
  console.log(`[RequestManager] Queued data for request: ${id}`)
}

export const finishRequest = (id: string, chunk?: Omit<RequestChunk, 'isFinal'>) => {
  const request = pendingRequests.get(id)
  if (!request) throw new Error(`Request ${id} not found`)

  request.queue = request.queue.then(async () => {
    await request.onData({ ...chunk, isFinal: true })
    pendingRequests.delete(id)
    console.log(`[RequestManager] Finished request: ${id}`)
  })
}
