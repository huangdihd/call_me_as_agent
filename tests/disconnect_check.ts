import { spawn } from 'node:child_process'
import http from 'node:http'

const BASE_URL = 'http://localhost:3000'

async function waitReady() {
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(`${BASE_URL}/api/settings`)
      console.log('Server is ready')
      return
    } catch (e) {
      await new Promise(r => setTimeout(r, 1000))
    }
  }
  throw new Error('Server timed out')
}

async function getPendingRequests() {
  const res = await fetch(`${BASE_URL}/api/internal/requests`)
  return await res.json()
}

async function runTests() {
  console.log('Running Comprehensive Disconnection Tests...')

  const testConfigs = [
    { name: 'OpenAI Chat', url: '/api/openai/v1/chat/completions', body: { model: 'gpt-4o', messages: [{ role: 'user', content: 'Hello' }] } },
    { name: 'OpenAI Responses', url: '/api/openai/v1/responses', body: { model: 'gpt-4o', input: [{ role: 'user', content: 'Hello' }] } },
    { name: 'Claude Messages', url: '/api/claude/v1/messages', body: { model: 'claude-3-5-sonnet', messages: [{ role: 'user', content: 'Hello' }] } },
  ]

  for (const config of testConfigs) {
    for (const stream of [false, true]) {
      const mode = stream ? 'Streaming' : 'Non-streaming'
      console.log(`\nTesting ${config.name} (${mode}) Disconnection...`)
      
      const controller = new AbortController()
      const respPromise = fetch(`${BASE_URL}${config.url}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...config.body, stream }),
        signal: controller.signal
      }).catch(e => {
        if (e.name === 'AbortError') return 'aborted'
        throw e
      })

      // Wait for request to appear
      let requestId = ''
      for (let i = 0; i < 20; i++) {
        const requests = await getPendingRequests()
        if (requests.length > 0) {
          requestId = requests[0].id
          break
        }
        await new Promise(r => setTimeout(r, 200))
      }

      if (!requestId) {
        throw new Error(`No pending request found for ${config.name} (${mode})`)
      }
      console.log(`Request found: ${requestId}`)

      // Abort the client request
      console.log(`Aborting client ${mode} request...`)
      controller.abort()
      await respPromise

      // Check if it's still in the list
      await new Promise(r => setTimeout(r, 500))
      const requestsAfter = await getPendingRequests()
      const found = requestsAfter.find((r: any) => r.id === requestId)
      
      if (found) {
        throw new Error(`${config.name} (${mode}) request still in list after client disconnect`)
      }
      console.log(`✓ ${config.name} (${mode}) request GONE after client disconnect`)
    }
  }

  console.log('\nAll comprehensive disconnection tests passed!')
}

const server = spawn('npm', ['run', 'dev'], { 
  stdio: 'inherit',
  env: { ...process.env, SKIP_AUTH: 'true' }
})
process.on('exit', () => server.kill())

try {
  await waitReady()
  await runTests()
  process.exit(0)
} catch (e) {
  console.error('Test failed:', e)
  process.exit(1)
}
