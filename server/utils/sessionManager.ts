import crypto from 'node:crypto'

const sessions = new Set<string>()

export const createSession = () => {
  const sessionId = crypto.randomBytes(32).toString('hex')
  sessions.add(sessionId)
  return sessionId
}

export const verifySession = (sessionId?: string) => {
  if (!sessionId) return false
  return sessions.has(sessionId)
}

export const destroySession = (sessionId?: string) => {
  if (sessionId) sessions.delete(sessionId)
}

// For persistent setup bypass check
const setupTokens = new Set<string>()
export const createSetupToken = () => {
  const token = crypto.randomBytes(16).toString('hex')
  setupTokens.add(token)
  setTimeout(() => setupTokens.delete(token), 5 * 60 * 1000) // 5 min expiry
  return token
}
export const verifySetupToken = (token: string) => setupTokens.has(token)
