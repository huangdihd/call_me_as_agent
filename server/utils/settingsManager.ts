import fs from 'node:fs'
import path from 'node:path'

export interface AppSettings {
  enableApiKeyAuth: boolean
  apiKey: string
}

const defaultSettings: AppSettings = {
  enableApiKeyAuth: false,
  apiKey: 'sk-human-agent'
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
