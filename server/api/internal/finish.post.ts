export type FinishResponse = {
  success: boolean
}

export default defineEventHandler(async (event) => {
  const { id, response, toolCalls, simulateStream, _manualId } = await readBody(event)
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'ID is required'
    })
  }

  try {
    await finishRequest(id, { content: response || '', toolCalls, simulateStream, _manualId })
    return { success: true } as FinishResponse
  } catch (error) {
    throw createError({
      statusCode: 404,
      statusMessage: error instanceof Error ? error.message : String(error)
    })
  }
})
