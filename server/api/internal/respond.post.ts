export type RespondResponse = {
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
    await pushToRequest(id, { content: response || '', toolCalls, simulateStream, _manualId })
    return { success: true } as RespondResponse
  } catch (error) {
    throw createError({
      statusCode: 404,
      statusMessage: error instanceof Error ? error.message : String(error)
    })
  }
})
