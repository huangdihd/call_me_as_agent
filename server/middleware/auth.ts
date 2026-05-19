import { verifySession } from '../utils/sessionManager'

export default defineEventHandler((event) => {
  const url = getRequestURL(event)
  const decodedPath = decodeURI(url.pathname)

  // Protect internal API routes
  if (decodedPath.startsWith('/api/internal/')) {
    const config = useRuntimeConfig()
    const settings = getSettings()
    
    const otpEnabled = !!settings.enableOtpAuth
    const passwordRequired = !!(settings.enablePasswordAuth && config.adminPassword)
    
    // Only enforce if at least one auth method is enabled
    if (otpEnabled || passwordRequired) {
      const sessionId = getCookie(event, 'auth_session')
      if (!verifySession(sessionId)) {
        throw createError({
          statusCode: 401,
          statusMessage: 'Unauthorized'
        })
      }
    }
  }
})
