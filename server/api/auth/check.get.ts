export default defineEventHandler((event) => {
  const config = useRuntimeConfig()
  const settings = getSettings()
  
  const otpEnabled = !!settings.enableOtpAuth
  const passwordRequired = !!config.adminPassword
  const authRequired = passwordRequired || otpEnabled

  if (!authRequired) {
    return { authenticated: true, authRequired: false, otpEnabled: false }
  }

  const token = getCookie(event, 'auth_token')
  // For now we still use adminPassword as the token if it exists
  const expectedToken = config.adminPassword || 'authenticated'
  
  if (token === expectedToken) {
    return { authenticated: true, authRequired: true, otpEnabled }
  }

  return { authenticated: false, authRequired: true, otpEnabled }
})
