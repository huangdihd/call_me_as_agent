import fs from 'node:fs'
import path from 'node:path'

export interface AppSettings {
  // Auth
  enableApiKeyAuth: boolean
  apiKey: string
  // UI Customization
  siteTitle: string
  siteSubtitle: string
  publicBaseUrl: string
  primaryColor: string
  language: 'zh' | 'en'
  pendingRequestsLabel: string
  // Visibility Toggles
  showPendingCountPublic: boolean
  showApiKeyPublic: boolean
}

const defaultSettings: AppSettings = {
  enableApiKeyAuth: false,
  apiKey: 'sk-human-agent',
  siteTitle: 'Call Me As Agent',
  siteSubtitle: 'A Human-in-the-loop LLM Proxy Service',
  publicBaseUrl: 'http://localhost:3000',
  primaryColor: 'green',
  language: 'zh',
  pendingRequestsLabel: '',
  showPendingCountPublic: true,
  showApiKeyPublic: true
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
