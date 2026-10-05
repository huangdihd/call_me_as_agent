import { sendTestEmail, smtpReady } from '../../utils/emailManager'
import { getSettings } from '../../utils/settingsManager'

export type EmailTestResponse = {
  success: boolean
  message: string
}

export default defineEventHandler(async (event) => {
  const { to } = await readBody(event)
  const s = getSettings()
  const recipient = to || s.notifyEmailTo

  if (!recipient) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Recipient email is required'
    })
  }

  if (!smtpReady()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'SMTP is not fully configured (host, user and password are required)'
    })
  }

  try {
    await sendTestEmail(recipient)
    return { success: true, message: `Test email sent to ${recipient}` } as EmailTestResponse
  } catch (error) {
    throw createError({
      statusCode: 502,
      statusMessage: error instanceof Error ? error.message : String(error)
    })
  }
})
