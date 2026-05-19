export default defineEventHandler((event) => {
  const url = getRequestURL(event)
  
  // Decode the pathname to prevent URL-encoding bypass (e.g. /%61pi/internal/)
  const decodedPath = decodeURI(url.pathname)

  // Only protect internal API routes
  if (decodedPath.startsWith('/api/internal/')) {
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
