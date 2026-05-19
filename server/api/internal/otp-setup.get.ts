import { generateSecret, generateURI } from 'otplib'
import QRCode from 'qrcode'
import { verifySession } from '../../utils/sessionManager'

export default defineEventHandler(async (event) => {
  // Authentication Check
  const sessionId = getCookie(event, 'auth_session')
  if (!verifySession(sessionId)) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized'
    })
  }

  const settings = getSettings()
  let secret = settings.otpSecret

  if (!secret) {
    secret = generateSecret()
  }

  const user = 'admin'
  const service = settings.siteTitle || 'CallMeAsAgent'
  const otpauth = generateURI({
    secret,
    label: user,
    issuer: service,
    strategy: 'totp'
  })
  const qrCodeDataUrl = await QRCode.toDataURL(otpauth)

  return {
    secret,
    qrCodeDataUrl,
    otpauth
  }
})
