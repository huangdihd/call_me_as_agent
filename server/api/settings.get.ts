export default defineEventHandler((_event) => {
  const settings = getSettings()
  // Return only safe-to-share settings
  return {
    siteTitle: settings.siteTitle,
    siteSubtitle: settings.siteSubtitle,
    publicBaseUrl: settings.publicBaseUrl,
    primaryColor: settings.primaryColor,
    language: settings.language,
    pendingRequestsLabel: settings.pendingRequestsLabel,
    showPendingCountPublic: settings.showPendingCountPublic,
    showApiKeyPublic: settings.showApiKeyPublic,
    enableApiKeyAuth: settings.enableApiKeyAuth,
    // Do NOT return the actual apiKey here
  }
})
