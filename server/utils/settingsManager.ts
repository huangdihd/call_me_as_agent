import fs from 'node:fs'
import path from 'node:path'

export interface AppSettings {
  // Auth
  enableApiKeyAuth: boolean
  apiKey: string
  enablePasswordAuth: boolean
  enableOtpAuth: boolean
  otpSecret: string
  // UI Customization
  siteTitle: string
  siteSubtitle: string
  siteLogo: string
  publicBaseUrl: string
  primaryColor: string
  language: 'zh' | 'en'
  pendingRequestsLabel: string
  streamSpeed: number // ms delay between characters
  keepAliveInterval: number // seconds between keep-alive pings
  // Visibility Toggles
  showPendingCountPublic: boolean
  showApiKeyPublic: boolean
  showTokensPublic: boolean
  tokensLabel: string
  toastTimeout: number
  useHeaderForIp: boolean
  ipHeaderName: string
  shutdownMessage: string
  // Email notification & reply
  enableEmailNotify: boolean
  notifyEmailTo: string
  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
  smtpUser: string
  smtpPass: string
  enableEmailReply: boolean
  imapHost: string
  imapPort: number
  imapSecure: boolean
  imapUser: string
  imapPass: string
  imapMailbox: string
  emailPollInterval: number // seconds between IMAP polls
  emailReplyAllowFrom: string // comma-separated allowlist, empty = accept any sender
}

const defaultSettings: AppSettings = {
  enableApiKeyAuth: false,
  apiKey: 'sk-human-agent',
  enablePasswordAuth: true,
  enableOtpAuth: false,
  otpSecret: '',
  siteTitle: 'Call Me As Agent',
  siteSubtitle: 'A Human-in-the-loop LLM Proxy Service',
  siteLogo: '',
  publicBaseUrl: 'http://localhost:3000',
  primaryColor: 'green',
  language: 'zh',
  pendingRequestsLabel: '',
  streamSpeed: 30,
  keepAliveInterval: 10,
  showPendingCountPublic: true,
  showApiKeyPublic: true,
  showTokensPublic: true,
  tokensLabel: '',
  toastTimeout: 3000,
  useHeaderForIp: true,
  ipHeaderName: 'x-forwarded-for',
  shutdownMessage: '\n\n[Server Shutdown] The proxy server is closing. Please retry your request if needed.',
  enableEmailNotify: false,
  notifyEmailTo: '',
  smtpHost: '',
  smtpPort: 465,
  smtpSecure: true,
  smtpUser: '',
  smtpPass: '',
  enableEmailReply: false,
  imapHost: '',
  imapPort: 993,
  imapSecure: true,
  imapUser: '',
  imapPass: '',
  imapMailbox: 'INBOX',
  emailPollInterval: 60,
  emailReplyAllowFrom: ''
}

const settingsPath = path.resolve(process.cwd(), '.data', 'settings.json')

export const getSettings = (): AppSettings => {
  try {
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf-8')
      return { ...defaultSettings, ...JSON.parse(data) }
    }
  } catch (e) {
    console.error('[SettingsManager] Failed to read settings', e)
  }
  return defaultSettings
}

export const updateSettings = (newSettings: Partial<AppSettings>): AppSettings => {
  const current = getSettings()
  const updated = { ...current, ...newSettings }
  try {
    const dir = path.dirname(settingsPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(settingsPath, JSON.stringify(updated, null, 2))
  } catch (e) {
    console.error('[SettingsManager] Failed to write settings', e)
  }
  return updated
}
