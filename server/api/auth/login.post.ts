interface RateLimitData {
  count: number
  blockedUntil: number | null
}

const failedAttempts = new Map<string, RateLimitData>()

// Configuration for brute-force protection
const MAX_ATTEMPTS = 5
const BLOCK_DURATION_MS = 15 * 60 * 1000 // 15 minutes

export default defineEventHandler(async (event) => {
  const { password } = await readBody(event)
  const config = useRuntimeConfig()

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

  if (!config.adminPassword) {
    return { success: true }
  }

  if (password === config.adminPassword) {
    // Successful login, clear failed attempts
    failedAttempts.delete(ip)

    setCookie(event, 'auth_token', password, {
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
    statusMessage: 'Invalid password'
  })
})
