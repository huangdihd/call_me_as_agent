export default defineEventHandler((event) => {
  const config = useRuntimeConfig()
  if (!config.adminPassword) {
    return { authenticated: true, authRequired: false }
  }

  const token = getCookie(event, 'auth_token')
  if (token === config.adminPassword) {
    return { authenticated: true, authRequired: true }
  }

  return { authenticated: false, authRequired: true }
})
