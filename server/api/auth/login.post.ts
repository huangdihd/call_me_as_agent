import { verifySync } from 'otplib'

interface RateLimitData {
  count: number
  blockedUntil: number | null
}

const failedAttempts = new Map<string, RateLimitData>()

// Configuration for brute-force protection
const MAX_ATTEMPTS = 5
const BLOCK_DURATION_MS = 15 * 60 * 1000 // 15 minutes

export default defineEventHandler(async (event) => {
  const { password, otpCode } = await readBody(event)
  const config = useRuntimeConfig()
  const settings = getSettings()

  // Get client IP for rate limiting tracking (supports reverse proxy)
  const forwardedHeader = getHeader(event, 'x-forwarded-for')
  let ip = 'unknown'

  if (typeof forwardedHeader === 'string' && forwardedHeader.length > 0) {
    const firstIp = forwardedHeader.split(',')[0]
    if (firstIp) {
      ip = firstIp.trim()
    }
  } else {
    ip = getRequestIP(event) || 'unknown'
  }

  // Check if IP is currently blocked
  const limitData = failedAttempts.get(ip)
  if (limitData && limitData.blockedUntil) {
    if (Date.now() < limitData.blockedUntil) {
      const remainingMinutes = Math.ceil((limitData.blockedUntil - Date.now()) / 60000)
      throw createError({
        statusCode: 429,
        statusMessage: `Too many failed attempts. Try again in ${remainingMinutes} minutes.`
      })
    } else {
      // Unblock if time has passed
      failedAttempts.delete(ip)
    }
  }

  // Verification logic
  let isPasswordValid = true
  const token = getCookie(event, 'auth_token')
  const expectedToken = config.adminPassword || 'authenticated'

  if (config.adminPassword && password !== config.adminPassword) {
    // If password is wrong, check if we are already authenticated via cookie
    if (!token || token !== expectedToken) {
      isPasswordValid = false
    }
  }

  let isOtpValid = true
  const body = await readBody(event)
  if (settings.enableOtpAuth || body._isSetupVerification) {
    const verificationSecret = body._tempSecret || settings.otpSecret
    if (!otpCode || !verifySync({
      token: otpCode,
      secret: verificationSecret,
      strategy: 'totp'
    })) {
      isOtpValid = false
    }
  }

  if (isPasswordValid && isOtpValid) {
    // Successful login, clear failed attempts
    failedAttempts.delete(ip)

    // We still use password as the token for now, or a fixed string if no password
    const token = config.adminPassword || 'authenticated'
    setCookie(event, 'auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 7 // 1 week
    })
    return { success: true }
  }

  // Failed attempt logic
  const currentAttempts = failedAttempts.get(ip)?.count || 0
  const newCount = currentAttempts + 1

  if (newCount >= MAX_ATTEMPTS) {
    failedAttempts.set(ip, {
      count: newCount,
      blockedUntil: Date.now() + BLOCK_DURATION_MS
    })
    throw createError({
      statusCode: 429,
      statusMessage: `Too many failed attempts. Try again in 15 minutes.`
    })
  } else {
    failedAttempts.set(ip, {
      count: newCount,
      blockedUntil: null
    })
  }

  throw createError({
    statusCode: 401,
    statusMessage: settings.enableOtpAuth && isPasswordValid ? 'Invalid OTP code' : 'Invalid credentials'
  })
})
