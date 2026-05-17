export default defineEventHandler((event) => {
  const url = getRequestURL(event)

  // Only protect internal API routes
  if (url.pathname.startsWith('/api/internal/')) {
    const config = useRuntimeConfig()
    if (config.adminPassword) {
      const token = getCookie(event, 'auth_token')
      if (token !== config.adminPassword) {
        throw createError({
          statusCode: 401,
          statusMessage: 'Unauthorized'
        })
      }
    }
  }
})
