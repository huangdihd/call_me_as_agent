import { generateSecret, generateURI } from 'otplib'
import QRCode from 'qrcode'

export default defineEventHandler(async (event) => {
  // Ensure authenticated
  const config = useRuntimeConfig()
  const token = getCookie(event, 'auth_token')
  const expectedToken = config.adminPassword || 'authenticated'
  
  if (config.adminPassword && token !== expectedToken) {
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
