import { verifySession } from '../../utils/sessionManager'

export default defineEventHandler((event) => {
  const config = useRuntimeConfig()
  const settings = getSettings()
  
  const otpEnabled = !!settings.enableOtpAuth
  const passwordRequired = !!(settings.enablePasswordAuth && config.adminPassword)
  const authRequired = passwordRequired || otpEnabled

  if (!authRequired) {
    return { authenticated: true, authRequired: false, otpEnabled: false, passwordRequired: false }
  }

  const sessionId = getCookie(event, 'auth_session')
  const isAuthenticated = verifySession(sessionId)

  return { 
    authenticated: isAuthenticated, 
    authRequired: true, 
    otpEnabled, 
    passwordRequired 
  }
})
