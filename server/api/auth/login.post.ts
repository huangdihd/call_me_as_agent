import { verifySync } from 'otplib'
import { createSession, verifySession } from '../../utils/sessionManager'

interface RateLimitData {
  count: number
  blockedUntil: number | null
}

const failedAttempts = new Map<string, RateLimitData>()

const MAX_ATTEMPTS = 5
const BLOCK_DURATION_MS = 15 * 60 * 1000

export type LoginResponse = {
  success: boolean
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { password, otpCode, _isSetupVerification, _tempSecret } = body
  const config = useRuntimeConfig()
  const settings = getSettings()

  const forwardedHeader = getHeader(event, 'x-forwarded-for')
  let ip: string
  if (typeof forwardedHeader === 'string' && forwardedHeader.length > 0) {
    ip = forwardedHeader.split(',')[0]?.trim() || 'unknown'
  } else {
    ip = getRequestIP(event) || 'unknown'
  }

  const limitData = failedAttempts.get(ip)
  if (limitData?.blockedUntil && Date.now() < limitData.blockedUntil) {
    const remainingMinutes = Math.ceil((limitData.blockedUntil - Date.now()) / 60000)
    throw createError({
      statusCode: 429,
      statusMessage: `Too many failed attempts. Try again in ${remainingMinutes} minutes.`
    })
  }

  const isPasswordRequired = !!(settings.enablePasswordAuth && config.adminPassword)
  const isOtpRequired = settings.enableOtpAuth
  let isVerified = true

  // 1. Password Verification
  if (isPasswordRequired) {
    let matches = password === config.adminPassword

    // Setup verification bypass: must be already authenticated
    if (!matches && _isSetupVerification) {
      const sessionId = getCookie(event, 'auth_session')
      if (verifySession(sessionId)) {
        matches = true
      }
    }

    isVerified = isVerified && matches
  }

  // 2. OTP Verification
  if (isOtpRequired || _isSetupVerification) {
    const secret = _isSetupVerification ? _tempSecret : settings.otpSecret

    const isValid = otpCode && verifySync({
      token: otpCode,
      secret: secret || '',
      strategy: 'totp'
    }).valid

    isVerified = isVerified && isValid
  }

  if (!isVerified) {
    return handleFailure(ip, 'Invalid OTP code or password')
  }

  // 3. Success
  failedAttempts.delete(ip)
  const sessionId = createSession()
  setCookie(event, 'auth_session', sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60 * 24 * 7
  })

  return { success: true } as LoginResponse
})

function handleFailure(ip: string, message: string) {
  const current = failedAttempts.get(ip)?.count || 0
  const next = current + 1
  failedAttempts.set(ip, {
    count: next,
    blockedUntil: next >= MAX_ATTEMPTS ? Date.now() + BLOCK_DURATION_MS : null
  })
  throw createError({ statusCode: 401, statusMessage: message })
}
