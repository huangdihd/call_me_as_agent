export default defineEventHandler((event) => {
  deleteCookie(event, 'auth_token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production'
  })
  return { success: true }
})
