export default defineNuxtPlugin(() => {
  const appConfig = useAppConfig()
  
  if (import.meta.client) {
    // Initial load
    $fetch('/api/settings').then((settings: any) => {
      if (settings?.primaryColor) {
        appConfig.ui.colors.primary = settings.primaryColor
      }
    }).catch(err => {
      console.error('[ThemePlugin] Failed to load settings', err)
    })
  }
})
