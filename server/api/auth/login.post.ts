import { verifySync } from 'otplib'
import { createSession } from '../../utils/sessionManager'

interface RateLimitData {
  count: number
  blockedUntil: number | null
}

const failedAttempts = new Map<string, RateLimitData>()

// Configuration for brute-force protection
const MAX_ATTEMPTS = 5
const BLOCK_DURATION_MS = 15 * 60 * 1000 // 15 minutes

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { password, otpCode, _isSetupVerification, _tempSecret } = body
  const config = useRuntimeConfig()
  const settings = getSettings()

  // Get client IP for rate limiting
  const forwardedHeader = getHeader(event, 'x-forwarded-for')
  let ip = 'unknown'
  if (typeof forwardedHeader === 'string' && forwardedHeader.length > 0) {
    ip = forwardedHeader.split(',')[0]?.trim() || 'unknown'
  } else {
    ip = getRequestIP(event) || 'unknown'
  }

  // Check Rate Limit
  const limitData = failedAttempts.get(ip)
  if (limitData && limitData.blockedUntil && Date.now() < limitData.blockedUntil) {
    const remainingMinutes = Math.ceil((limitData.blockedUntil - Date.now()) / 60000)
    throw createError({
      statusCode: 429,
      statusMessage: `Too many failed attempts. Try again in ${remainingMinutes} minutes.`
    })
  }

  // Auth Factors
  const isPasswordRequired = !!(settings.enablePasswordAuth && config.adminPassword)
  const isOtpRequired = !!settings.enableOtpAuth

  let isPasswordValid = true
  if (isPasswordRequired) {
    if (password !== config.adminPassword) {
      // Setup verification bypass: only if already authenticated via session
      if (_isSetupVerification) {
        const sessionId = getCookie(event, 'auth_session')
        if (!verifySession(sessionId)) isPasswordValid = false
      } else {
        isPasswordValid = false
      }
    }
  }

  let isOtpValid = true
  if (isOtpRequired || _isSetupVerification) {
    const verificationSecret = _isSetupVerification ? _tempSecret : settings.otpSecret
    if (!otpCode || !verifySync({
      token: otpCode,
      secret: verificationSecret || '',
      strategy: 'totp'
    })) {
      isOtpValid = false
    }
  }

  if (isPasswordValid && isOtpValid) {
    failedAttempts.delete(ip)
    
    // Create a secure random session ID
    const sessionId = createSession()
    setCookie(event, 'auth_session', sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 7 // 1 week
    })
    
    // Clean up old insecure cookie if it exists
    deleteCookie(event, 'auth_token')
    
    return { success: true }
  }

  // Failure
  const currentAttempts = failedAttempts.get(ip)?.count || 0
  const newCount = currentAttempts + 1
  failedAttempts.set(ip, {
    count: newCount,
    blockedUntil: newCount >= MAX_ATTEMPTS ? Date.now() + BLOCK_DURATION_MS : null
  })

  let statusMessage = 'Invalid credentials'
  if (isPasswordRequired && !isPasswordValid) statusMessage = 'Invalid password'
  else if ((isOtpRequired || _isSetupVerification) && !isOtpValid) statusMessage = 'Invalid OTP code'

  throw createError({ statusCode: 401, statusMessage })
})
