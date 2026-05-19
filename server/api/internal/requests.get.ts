export type RequestsGetResponse = Array<{
  id: string
  type: 'openai' | 'claude' | 'openai-responses'
  payload: Record<string, unknown>
  timestamp: number
  draft?: {
    response: string
    toolCalls: Record<string, unknown>[]
    simulateStream: boolean
  }
}>

export default defineEventHandler((_event) => {
  return getPendingRequests() as RequestsGetResponse
})
