import { startEmailReplyPolling } from '../utils/emailReplyManager'

export default defineNitroPlugin(() => {
  startEmailReplyPolling()
})
