import type { ImapFlow } from 'imapflow'
import { getSettings } from './settingsManager'
import { finishRequest } from './requestManager'
import { buildMessageId, extractRequestIdFromReferences } from './emailManager'

const QUOTE_MARKERS: RegExp[] = [
  /^-{2,}\s*原始邮件\s*-{2,}$/,
  /^-{2,}\s*原始消息\s*-{2,}$/,
  /^-{2,}\s*Forwarded message\s*-{2,}$/i,
  /^_{2,}\s*Original Message\s*_{2,}$/i,
  /^-{2,}\s*Original Message\s*-{2,}$/i,
  /^\s*On\b.*\bwrote\s*:\s*$/i,
  /^在\s*\S.*\s写道\s*[:：]?\s*$/,
  /^发件人\s*[:：]/,
  /^发送自\s*(我的\s*)?(iPhone|iPad|Android).*$/i,
  /^Sent from my (iPhone|iPad|Android).*$/i,
  /^_{5,}\s*$/
]

// Strip the quoted conversation below a reply so only the admin's own words are delivered
export const stripQuotedText = (text: string): string => {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  let end = lines.length
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (QUOTE_MARKERS.some(re => re.test(line)) || /^\s*>/.test(line)) {
      // Ignore quote markers that appear in the first line of an empty-ish body (rare), keep at least one line
      if (i === 0 && lines.length > 1) continue
      end = i
      break
    }
  }
  const stripped = lines.slice(0, end).join('\n').trim()
  // Never deliver an empty reply: if stripping removed everything, fall back to the original text
  return stripped || text.trim()
}

export const matchRequestId = (subject: string | undefined, inReplyTo: string | string[] | undefined): string | null => {
  const fromRefs = extractRequestIdFromReferences(inReplyTo)
  if (fromRefs) return fromRefs
  if (subject) {
    const match = subject.match(/\[call-me-as-agent #([a-f0-9]+)\]/)
    if (match) return match[1] ?? null
  }
  return null
}

const isSenderAllowed = (fromAddress: string): boolean => {
  const s = getSettings()
  if (!s.emailReplyAllowFrom.trim()) return true
  const allowed = s.emailReplyAllowFrom.split(',').map(a => a.trim().toLowerCase()).filter(Boolean)
  return allowed.includes(fromAddress.toLowerCase())
}

interface ParsedReply {
  requestId: string
  fromAddress: string
  text: string
}

const parseReplyFromSource = async (source: Buffer, subject: string | undefined, inReplyTo: string | string[] | undefined): Promise<ParsedReply | null> => {
  const requestId = matchRequestId(subject, inReplyTo)
  if (!requestId) return null

  const { simpleParser } = await import('mailparser')
  const parsed = await simpleParser(source)
  const fromAddress = (parsed.from?.value?.[0]?.address) || ''

  let text = parsed.text || ''
  if (!text && parsed.html) {
    text = parsed.html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
  }

  return {
    requestId,
    fromAddress,
    text: stripQuotedText(text)
  }
}

// --- Persistent connection with IDLE push notifications ---

let conn: { client: ImapFlow, hash: string } | null = null
let processing = false
let processingQueued = false
let lastSweep = 0

const closeConnection = async (): Promise<void> => {
  const c = conn
  conn = null
  if (!c) return
  try {
    c.client.removeAllListeners('exists')
    c.client.removeAllListeners('error')
  } catch { /* ignore */ }
  try {
    await c.client.logout()
  } catch {
    try {
      c.client.close()
    } catch { /* ignore */ }
  }
}

const processUnseen = async (client: ImapFlow): Promise<number> => {
  const s = getSettings()
  if (!s.enableEmailReply) return 0

  const candidates: { uid: number, subject?: string, inReplyTo?: string | string[] }[] = []
  for await (const msg of client.fetch({ seen: false }, { uid: true, envelope: true })) {
    candidates.push({
      uid: msg.uid,
      subject: msg.envelope?.subject,
      inReplyTo: (msg.envelope as unknown as { inReplyTo?: string })?.inReplyTo
    })
  }

  for (const candidate of candidates) {
    const requestId = matchRequestId(candidate.subject, candidate.inReplyTo)
    if (!requestId) continue

    // Fetch the full source only for messages that look like replies to our notifications
    const fetched = await client.fetchOne(candidate.uid, { source: true }, { uid: true })
    if (!fetched || !fetched.source) continue
    const reply = await parseReplyFromSource(fetched.source, candidate.subject, candidate.inReplyTo)
    if (!reply) continue

    if (reply.fromAddress && !isSenderAllowed(reply.fromAddress)) {
      console.log(`[EmailReply] Rejected reply from ${reply.fromAddress} (not in allowlist) for request ${requestId}`)
    } else {
      try {
        await finishRequest(requestId, { content: reply.text, simulateStream: true })
        console.log(`[EmailReply] Delivered email reply to request ${requestId}`)
        if (reply.fromAddress && reply.text) {
          import('./emailManager').then(({ sendMail }) => sendMail({
            to: reply.fromAddress,
            subject: `[call-me-as-agent #${requestId}] Reply delivered`,
            inReplyTo: buildMessageId(requestId),
            text: `Your reply to request #${requestId} has been delivered to the client.\n\n你对请求 #${requestId} 的回复已成功发送给客户端。`
          })).catch(() => {})
        }
      } catch {
        console.log(`[EmailReply] Request ${requestId} no longer exists, notifying sender`)
        // Tell the sender why nothing happened, so stale replies are not silently swallowed
        if (reply.fromAddress && reply.text) {
          import('./emailManager').then(({ sendMail }) => sendMail({
            to: reply.fromAddress,
            subject: `[call-me-as-agent #${requestId}] Request no longer active`,
            inReplyTo: buildMessageId(requestId),
            text: `Your reply was received, but request #${requestId} is no longer pending (it may have been answered already, or the client disconnected).\n\n你的回复已收到，但请求 #${requestId} 已不在等待列表中（可能已被处理，或客户端已断开连接/超时）。请让客户端重新发起请求，然后回复最新的那封通知邮件。`
          })).catch(() => {})
        }
      }
    }

    // Mark processed so it is not picked up again
    try {
      await client.messageFlagsAdd(String(candidate.uid), ['\\Seen'], { uid: true })
    } catch {
      // best effort
    }
  }
  return candidates.length
}

const triggerProcess = async (reason: string): Promise<void> => {
  if (!conn) return
  if (processing) {
    processingQueued = true
    return
  }
  processing = true
  try {
    do {
      processingQueued = false
      const count = await processUnseen(conn.client)
      lastSweep = Date.now()
      if (count > 0) console.log(`[EmailReply] ${reason}: scanned ${count} unseen message(s)`)
    } while (processingQueued && conn)
  } catch (e) {
    console.error('[EmailReply] Processing failed:', e instanceof Error ? e.message : e)
    await closeConnection()
  } finally {
    processing = false
  }
}

const ensureConnection = async (): Promise<boolean> => {
  const s = getSettings()
  if (!s.enableEmailReply || !s.imapHost || !s.imapUser || !s.imapPass) {
    await closeConnection()
    return false
  }
  const hash = [s.imapHost, s.imapPort, s.imapSecure, s.imapUser, s.imapPass, s.imapMailbox].join('|')
  if (conn && conn.hash === hash && conn.client.usable) return true
  await closeConnection()

  const { ImapFlow: Client } = await import('imapflow')
  const client = new Client({
    host: s.imapHost,
    port: s.imapPort,
    secure: s.imapSecure,
    auth: { user: s.imapUser, pass: s.imapPass },
    logger: false,
    emitLogs: false,
    // On servers without IDLE support this caps the internal poll interval,
    // so 'exists' notifications still fire within ~20s
    maxIdleTime: 20000
  })
  client.on('exists', () => {
    void triggerProcess('exists')
  })
  client.on('error', (e) => {
    console.error('[EmailReply] Connection error:', e instanceof Error ? e.message : e)
    void closeConnection()
  })
  await client.connect()
  await client.mailboxOpen(s.imapMailbox || 'INBOX')
  conn = { client, hash }
  console.log(`[EmailReply] Connected to ${s.imapHost} (IDLE ${client.capabilities?.has('IDLE') ? 'supported' : 'not supported, relying on sweeps'})`)
  return true
}

const tick = async (): Promise<void> => {
  try {
    const ok = await ensureConnection()
    if (!ok || !conn) return
    // Safety-net sweep in case IDLE notifications are missed on flaky servers
    const s = getSettings()
    const sweepInterval = Math.max(30, s.emailPollInterval || 60) * 1000
    if (Date.now() - lastSweep >= sweepInterval) {
      await triggerProcess('sweep')
    }
  } catch (e) {
    console.error('[EmailReply] Tick failed:', e instanceof Error ? e.message : e)
    await closeConnection()
  }
}

let pollTimer: ReturnType<typeof setInterval> | null = null

export const startEmailReplyPolling = () => {
  if (pollTimer) return
  pollTimer = setInterval(() => {
    void tick()
  }, 10000)
}
