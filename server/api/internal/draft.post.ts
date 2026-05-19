export default defineEventHandler(async (event) => {
  const { id, draft } = await readBody(event)
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'ID is required'
    })
  }

  updateDraft(id, draft)
  return { success: true }
})
