export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface PendingRequest {
  id: string
  type: 'openai' | 'claude'
  payload: any
  timestamp: number
  resolve: (data: { content: string, toolCalls?: ToolCall[] }) => void
}

const pendingRequests = new Map<string, PendingRequest>()

export const addRequest = (type: 'openai' | 'claude', payload: any): Promise<{ content: string, toolCalls?: ToolCall[] }> => {
  return new Promise((resolve) => {
    const id = Math.random().toString(36).substring(2, 15)
    pendingRequests.set(id, {
      id,
      type,
      payload,
      timestamp: Date.now(),
      resolve
    })
    console.log(`[RequestManager] Added ${type} request: ${id}`)
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

export const resolveRequest = (id: string, responseContent: string, toolCalls?: ToolCall[]) => {
  const request = pendingRequests.get(id)
  if (!request) {
    throw new Error(`Request ${id} not found`)
  }

  request.resolve({ content: responseContent, toolCalls })
  pendingRequests.delete(id)
  console.log(`[RequestManager] Resolved request: ${id} with ${toolCalls?.length || 0} tool calls`)
}
