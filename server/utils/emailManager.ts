import nodemailer from 'nodemailer'
import { getSettings } from './settingsManager'
import type { ApiPayload, BaseMessage } from './requestManager'

export const CMAR_MESSAGE_ID_DOMAIN = 'call-me-as-agent.agent'

export const buildMessageId = (requestId: string) => `<cmar-${requestId}@${CMAR_MESSAGE_ID_DOMAIN}>`

export const extractRequestIdFromReferences = (refs: string[] | string | undefined): string | null => {
  if (!refs) return null
  const list = Array.isArray(refs) ? refs : [refs]
  for (const ref of list) {
    const match = ref.match(/<cmar-([a-f0-9]+)@/)
    if (match) return match[1] ?? null
  }
  return null
}

const extractContentText = (content: unknown): string => {
  if (content == null) return ''
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part
        if (part && typeof part === 'object') {
          const p = part as Record<string, unknown>
          if (typeof p.text === 'string') return p.text
          if (p.type === 'input_image' || p.type === 'image') return '[image]'
          if (p.type === 'tool_use' || p.type === 'tool_result') return ''
          if (typeof p.content === 'string') return p.content
        }
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }
  return ''
}

const ROLE_LABELS: Record<string, string> = {
  system: 'SYSTEM',
  developer: 'SYSTEM',
  user: 'USER',
  assistant: 'ASSISTANT',
  tool: 'TOOL_RESULT'
}

const renderToolCalls = (msg: BaseMessage): string[] => {
  const lines: string[] = []
  const calls = msg.tool_calls || []
  for (const tc of calls) {
    const name = tc.function?.name || tc.name || 'unknown'
    const args = tc.function?.arguments
      || (tc.input ? JSON.stringify(tc.input, null, 2) : '')
    lines.push(`[TOOL_CALL] ${name}\n${args}`)
  }
  return lines
}

export const renderPayload = (payload: ApiPayload): string => {
  const chunks: string[] = []
  if (typeof payload.instructions === 'string' && payload.instructions.trim()) {
    chunks.push(`[SYSTEM]\n${payload.instructions.trim()}`)
  }
  if (typeof payload.system === 'string' && payload.system.trim()) {
    chunks.push(`[SYSTEM]\n${payload.system.trim()}`)
  }

  const messages = Array.isArray(payload.messages)
    ? payload.messages
    : Array.isArray(payload.input)
      ? (payload.input as BaseMessage[])
      : []

  if (typeof payload.input === 'string' && payload.input.trim()) {
    chunks.push(`[USER]\n${payload.input.trim()}`)
  }

  for (const msg of messages) {
    if (!msg || typeof msg !== 'object') continue
    const role = msg.role || 'user'
    const label = ROLE_LABELS[role] || role.toUpperCase()
    const text = extractContentText(msg.content)
    if (text.trim()) chunks.push(`[${label}]\n${text.trim()}`)
    chunks.push(...renderToolCalls(msg))
  }

  return chunks.join('\n\n').trim() || '(empty payload)'
}

const getTransporter = (smtpHost: string, smtpPort: number, smtpSecure: boolean, smtpUser: string, smtpPass: string) => {
  return nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: { user: smtpUser, pass: smtpPass }
  })
}

export const isEmailConfigured = (): boolean => {
  const s = getSettings()
  if (!s.smtpHost || !s.smtpUser || !s.smtpPass) return false
  return !!(s.enableEmailReply || (s.enableEmailNotify && s.notifyEmailTo))
}

export const smtpReady = (): boolean => {
  const s = getSettings()
  return !!(s.smtpHost && s.smtpUser && s.smtpPass)
}

const resolveFrom = (): string => {
  const s = getSettings()
  return s.smtpUser.includes('@') ? s.smtpUser : `${s.smtpUser || 'call-me-as-agent'}@${s.smtpHost}`
}

const MAX_EMAIL_BODY = 60000

interface SendOptions {
  to: string
  subject: string
  text: string
  html?: string
  messageId?: string
  inReplyTo?: string
}

export const sendMail = async (opts: SendOptions): Promise<void> => {
  const s = getSettings()
  if (!smtpReady()) throw new Error('SMTP is not configured')
  const transporter = getTransporter(s.smtpHost, s.smtpPort, s.smtpSecure, s.smtpUser, s.smtpPass)
  await transporter.sendMail({
    from: resolveFrom(),
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
    messageId: opts.messageId,
    inReplyTo: opts.inReplyTo,
    references: opts.inReplyTo
  })
  transporter.close()
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const toHtml = (text: string) =>
  `<pre style="font-family:Menlo,Consolas,monospace;font-size:13px;white-space:pre-wrap;word-break:break-word;line-height:1.6;">${escapeHtml(text)}</pre>`

export const sendTestEmail = async (to: string): Promise<void> => {
  await sendMail({
    to,
    subject: '[call-me-as-agent] Test email / 测试邮件',
    text: 'This is a test email from call-me-as-agent. SMTP is configured correctly.\n\n这是来自 call-me-as-agent 的测试邮件，SMTP 配置正确。',
    html: '<p>This is a test email from <b>call-me-as-agent</b>. SMTP is configured correctly.</p><p>这是来自 call-me-as-agent 的测试邮件，SMTP 配置正确。</p>'
  })
}

export const notifyNewRequest = async (requestId: string, payload: ApiPayload): Promise<void> => {
  const s = getSettings()
  if (!s.enableEmailNotify || !smtpReady() || !s.notifyEmailTo) return

  const conversation = renderPayload(payload)
  const truncated = conversation.length > MAX_EMAIL_BODY
    ? `${conversation.slice(0, MAX_EMAIL_BODY)}\n\n... [truncated]`
    : conversation

  const dashboardUrl = s.publicBaseUrl ? `${s.publicBaseUrl.replace(/\/$/, '')}/agent` : ''
  const footer = [
    '---',
    'Reply directly to this email to send your response to the waiting client.',
    'Only the new text you write at the top of the reply is used (quoted conversation is stripped automatically).',
    dashboardUrl ? `Or reply from the web dashboard: ${dashboardUrl}` : ''
  ].filter(Boolean).join('\n')

  const text = `New request #${requestId} is waiting for your reply.\n\n${truncated}\n\n${footer}`

  const html = [
    `<h3 style="font-family:sans-serif;">New request <code>#${requestId}</code> is waiting for your reply</h3>`,
    toHtml(truncated),
    `<hr><p style="font-family:sans-serif;font-size:12px;color:#666;">Reply directly to this email to send your response to the waiting client. Only the new text at the top of your reply is used (quoted conversation is stripped automatically).${dashboardUrl ? ` Or reply from the web dashboard: <a href="${dashboardUrl}">${dashboardUrl}</a>` : ''}</p>`
  ].join('\n')

  await sendMail({
    to: s.notifyEmailTo,
    subject: `[call-me-as-agent #${requestId}] New request waiting for reply`,
    text,
    html,
    messageId: buildMessageId(requestId)
  })
}
