<script setup lang="ts">
interface PendingRequest {
  id: string
  type: 'openai' | 'claude'
  payload: any
  timestamp: number
}

const { data: requests, refresh } = useFetch<PendingRequest[]>('/api/internal/requests')
const activeRequestId = ref<string | null>(null)
const isAuthenticated = ref(true)
const loginPassword = ref('')
const isLoggingIn = ref(false)

const checkAuth = async () => {
  const res: any = await $fetch('/api/auth/check')
  isAuthenticated.value = res.authenticated
}

const login = async () => {
  isLoggingIn.value = true
  try {
    await $fetch('/api/auth/login', {
      method: 'POST',
      body: { password: loginPassword.value }
    })
    isAuthenticated.value = true
    await refresh()
  } catch (e: any) {
    toast.add({ title: e.data?.statusMessage || 'Invalid password', color: 'error' })
  } finally {
    isLoggingIn.value = false
  }
}

const logout = async () => {
  await $fetch('/api/auth/logout', { method: 'POST' })
  isAuthenticated.value = false
  loginPassword.value = ''
}

// Computed for active request
const activeRequest = computed(() => {
  if (!requests.value) return null
  return requests.value.find(r => r.id === activeRequestId.value) || null
})

// Automatically select first request if none selected
watch(requests, (newRequests) => {
  if (newRequests?.length && !activeRequestId.value) {
    activeRequestId.value = newRequests[0]?.id || null
  } else if (!newRequests?.length) {
    activeRequestId.value = null
  }
}, { immediate: true })

// Poll for new requests every 2 seconds
let pollInterval: any
onMounted(() => {
  checkAuth()
  pollInterval = setInterval(() => {
    if (isAuthenticated.value) refresh()
  }, 2000)
})

onUnmounted(() => {
  if (pollInterval) clearInterval(pollInterval)
})

const responses = ref<Record<string, string>>({})
const structuredToolCalls = ref<Record<string, any[]>>({})
const submitting = ref<Record<string, boolean>>({})
const toast = useToast()

const copyToClipboard = (text: string) => {
  navigator.clipboard.writeText(text)
  toast.add({ title: 'Copied to clipboard', color: 'success' })
}

const addToolCall = (requestId: string, tool?: any) => {
  if (!structuredToolCalls.value[requestId]) {
    structuredToolCalls.value[requestId] = []
  }

  const parameters = tool?.function?.parameters?.properties || {}
  const args: Record<string, any> = {}
  Object.keys(parameters).forEach((key) => {
    const prop = parameters[key]
    if (key === 'questions' && (tool?.function?.name === 'ask_user' || tool?.name === 'ask_user')) {
      args[key] = [{
        question: 'Your question here?',
        header: 'Query',
        type: 'text'
      }]
    } else if (prop.type === 'array') {
      args[key] = []
    } else if (prop.type === 'object') {
      args[key] = {}
    } else {
      args[key] = ''
    }
  })

  structuredToolCalls.value[requestId].push({
    id: 'call_' + Math.random().toString(36).substring(2, 9),
    name: tool?.function?.name || tool?.name || 'custom_tool',
    description: tool?.function?.description || tool?.description || '',
    arguments: args,
    parameters: parameters
  })
}

const removeToolCall = (requestId: string, index: number) => {
  structuredToolCalls.value[requestId]?.splice(index, 1)
}

const promptNewParameter = (tc: any) => {
  const k = window.prompt('New parameter name:')
  if (k) {
    tc.arguments[k] = ''
  }
}

const submitResponse = async (id: string) => {
  submitting.value[id] = true
  try {
    const toolCalls = (structuredToolCalls.value[id] || []).map((tc) => {
      const parsedArgs: Record<string, any> = {}
      for (const [key, val] of Object.entries(tc.arguments)) {
        const prop = tc.parameters?.[key]
        if (typeof val === 'string') {
          if (prop?.type === 'number' || prop?.type === 'integer') {
            parsedArgs[key] = val !== '' ? Number(val) : undefined
          } else if (prop?.type === 'boolean') {
            parsedArgs[key] = val === 'true' || val === '1'
          } else {
            parsedArgs[key] = val
          }
        } else {
          parsedArgs[key] = val
        }
        // Clean up undefined
        if (parsedArgs[key] === undefined) {
          delete parsedArgs[key]
        }
      }

      return {
        id: tc.id,
        type: 'function',
        function: {
          name: tc.name,
          arguments: JSON.stringify(parsedArgs)
        }
      }
    })
    await $fetch('/api/internal/respond', {
      method: 'POST',
      body: {
        id,
        response: responses.value[id] || '',
        toolCalls: toolCalls.length > 0 ? toolCalls : null
      }
    })
    delete responses.value[id]
    delete structuredToolCalls.value[id]
    await refresh()
    toast.add({ title: 'Response sent successfully', color: 'success' })
  } catch (error) {
    console.error('Failed to submit response:', error)
    toast.add({ title: 'Failed to submit response', color: 'error' })
  } finally {
    submitting.value[id] = false
  }
}

const getMessages = (payload: any) => {
  let messages: any[] = []
  if (payload.messages) {
    messages = [...payload.messages]
  }
  if (payload.system && typeof payload.system === 'string') {
    messages.unshift({ role: 'system', content: payload.system })
  }

  return messages.map((m) => {
    const images: string[] = []
    const toolCalls: any[] = []
    const toolResults: any[] = []
    let textContent = ''

    if (typeof m.content === 'string') {
      textContent = m.content
    } else if (Array.isArray(m.content)) {
      m.content.forEach((c: any) => {
        if (c.type === 'text') textContent += (textContent ? '\n' : '') + c.text
        if (c.type === 'image_url') images.push(c.image_url.url)
        if (c.type === 'image') images.push(`data:${c.source.media_type};base64,${c.source.data}`)
        if (c.type === 'tool_use') toolCalls.push(c)
        if (c.type === 'tool_result') toolResults.push(c)
      })
    }

    if (m.tool_calls) {
      m.tool_calls.forEach((tc: any) => toolCalls.push(tc))
    }

    return {
      role: m.role,
      content: textContent,
      images,
      toolCalls,
      toolResults,
      tool_call_id: m.tool_call_id // OpenAI tool result role
    }
  })
}

const formatTimestamp = (ts: number) => {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

const availableTools = computed(() => {
  if (!activeRequest.value?.payload?.tools) return []
  return activeRequest.value.payload.tools
})
</script>

<template>
  <div>
    <div
      v-if="!isAuthenticated"
      class="h-screen w-full flex items-center justify-center bg-gray-50 dark:bg-gray-900"
    >
      <UCard class="w-full max-w-sm shadow-xl">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon
              name="i-lucide-lock"
              class="text-primary-500 w-5 h-5"
            />
            <h2 class="font-bold text-xl">
              Authentication Required
            </h2>
          </div>
        </template>
        <div class="space-y-4">
          <p class="text-sm text-gray-500">
            Please enter the admin password to access the panel.
          </p>
          <UInput
            v-model="loginPassword"
            type="password"
            placeholder="Enter Password"
            autofocus
            icon="i-lucide-key"
            class="w-full"
            @keyup.enter="login"
          />
          <UButton
            block
            color="primary"
            :loading="isLoggingIn"
            @click="login"
          >
            Login
          </UButton>
        </div>
      </UCard>
    </div>

    <div
      v-else
      class="flex h-screen overflow-hidden bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100"
    >
      <!-- Sidebar -->
      <aside class="w-80 flex-shrink-0 border-r border-gray-200 dark:border-gray-800 flex flex-col bg-gray-50/50 dark:bg-gray-900/50">
        <div class="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <h2 class="font-bold text-lg">
            Requests
          </h2>
          <UBadge
            v-if="requests?.length"
            color="primary"
            variant="subtle"
          >
            {{ requests.length }}
          </UBadge>
        </div>

        <div class="flex-1 overflow-y-auto p-2 space-y-1">
          <template v-if="requests?.length">
            <button
              v-for="req in requests"
              :key="req.id"
              class="w-full text-left p-3 rounded-lg transition-colors group relative"
              :class="activeRequestId === req.id ? 'bg-primary-50 dark:bg-primary-950 text-primary-600 dark:text-primary-400' : 'hover:bg-gray-100 dark:hover:bg-gray-800'"
              @click="activeRequestId = req.id"
            >
              <div class="flex justify-between items-start mb-1">
                <UBadge
                  :color="req.type === 'openai' ? 'primary' : 'info'"
                  variant="subtle"
                  size="xs"
                >
                  {{ req.type.toUpperCase() }}
                </UBadge>
                <span class="text-[10px] text-gray-400">{{ formatTimestamp(req.timestamp) }}</span>
              </div>
              <div class="text-sm font-medium truncate">
                {{ getMessages(req.payload).slice(-1)[0]?.content || 'Multimodal/Tool Call' }}
              </div>
              <div class="text-[10px] text-gray-500 font-mono mt-1">
                ID: {{ req.id.slice(0, 8) }}
              </div>
            </button>
          </template>
          <div
            v-else
            class="flex flex-col items-center justify-center h-40 text-gray-400 text-sm italic"
          >
            No pending requests
          </div>
        </div>

        <div class="p-4 border-t border-gray-200 dark:border-gray-800 space-y-2">
          <div class="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
            Endpoints
          </div>
          <div class="flex flex-col gap-1">
            <UButton
              variant="ghost"
              color="neutral"
              size="xs"
              block
              class="justify-start truncate"
              @click="copyToClipboard('http://localhost:3000/api/openai/v1')"
            >
              <template #leading>
                <UIcon name="i-simple-icons-openai" />
              </template>
              OpenAI V1
            </UButton>
            <UButton
              variant="ghost"
              color="neutral"
              size="xs"
              block
              class="justify-start truncate"
              @click="copyToClipboard('http://localhost:3000/api/claude')"
            >
              <template #leading>
                <UIcon name="i-simple-icons-anthropic" />
              </template>
              Claude V1
            </UButton>
          </div>
          <div class="flex items-center justify-between mt-2">
            <UColorModeButton size="sm" />
            <div class="flex items-center gap-1">
              <UButton
                icon="i-lucide-settings"
                size="sm"
                variant="ghost"
                color="neutral"
                to="/settings"
              />
              <UButton
                icon="i-lucide-log-out"
                size="sm"
                variant="ghost"
                color="error"
                @click="logout"
              />
            </div>
          </div>
        </div>
      </aside>

      <!-- Main Content -->
      <main class="flex-1 flex flex-col min-w-0 bg-white dark:bg-gray-950">
        <template v-if="activeRequest">
          <header class="p-4 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center bg-white/50 dark:bg-gray-950/50 backdrop-blur">
            <div>
              <div class="flex items-center gap-2">
                <h1 class="text-xl font-bold">
                  Request Details
                </h1>
                <UBadge
                  :color="activeRequest.type === 'openai' ? 'primary' : 'info'"
                  variant="solid"
                >
                  {{ activeRequest.type.toUpperCase() }}
                </UBadge>
              </div>
              <div class="text-xs text-gray-500 font-mono mt-1">
                ID: {{ activeRequest.id }}
              </div>
            </div>
            <div class="text-sm text-gray-400">
              Received at {{ new Date(activeRequest.timestamp).toLocaleString() }}
            </div>
          </header>

          <div class="flex-1 overflow-y-auto p-6 space-y-8">
            <section>
              <h3 class="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">
                Conversation History
              </h3>
              <div class="space-y-6">
                <div
                  v-for="(msg, index) in getMessages(activeRequest.payload)"
                  :key="index"
                  class="flex flex-col w-full"
                  :class="msg.role === 'assistant' ? 'items-end' : 'items-start'"
                >
                  <div
                    class="max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm border"
                    :class="{
                      'bg-primary-500 text-white border-primary-600': msg.role === 'assistant',
                      'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-200 dark:border-gray-700': msg.role !== 'assistant' && msg.role !== 'tool',
                      'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/50': msg.role === 'tool',
                      'italic': msg.role === 'system'
                    }"
                  >
                    <div class="text-[10px] font-bold uppercase opacity-70 mb-2 flex items-center gap-1">
                      <UIcon
                        v-if="msg.role === 'system'"
                        name="i-lucide-settings"
                      />
                      <UIcon
                        v-else-if="msg.role === 'user'"
                        name="i-lucide-user"
                      />
                      <UIcon
                        v-else-if="msg.role === 'tool'"
                        name="i-lucide-wrench"
                      />
                      <UIcon
                        v-else
                        name="i-lucide-bot"
                      />
                      {{ msg.role }} {{ msg.tool_call_id ? `(Result for ${msg.tool_call_id.slice(0, 8)})` : '' }}
                    </div>

                    <div
                      v-if="msg.content"
                      class="whitespace-pre-wrap"
                    >
                      {{ msg.content }}
                    </div>

                    <!-- Images -->
                    <div
                      v-if="msg.images.length"
                      class="mt-3 grid grid-cols-2 gap-2"
                    >
                      <img
                        v-for="(img, i) in msg.images"
                        :key="i"
                        :src="img"
                        class="rounded-lg border border-white/20 max-h-60 w-full object-cover"
                      >
                    </div>

                    <!-- Tool Calls -->
                    <div
                      v-if="msg.toolCalls.length"
                      class="mt-3 space-y-2"
                    >
                      <div
                        v-for="(tc, i) in msg.toolCalls"
                        :key="i"
                        class="p-2 bg-black/10 dark:bg-white/5 rounded-lg border border-black/5 dark:border-white/5"
                      >
                        <div class="text-[10px] font-bold text-blue-500 mb-1 flex items-center gap-1">
                          <UIcon
                            name="i-lucide-play"
                            size="10"
                          />
                          TOOL CALL: {{ tc.function?.name || tc.name }}
                        </div>
                        <pre class="text-[10px] font-mono overflow-x-auto">{{ tc.function?.arguments || JSON.stringify(tc.input, null, 2) }}</pre>
                      </div>
                    </div>

                    <!-- Tool Results -->
                    <div
                      v-if="msg.toolResults.length"
                      class="mt-3 space-y-2"
                    >
                      <div
                        v-for="(tr, i) in msg.toolResults"
                        :key="i"
                        class="p-2 bg-green-500/10 rounded-lg border border-green-500/20"
                      >
                        <div class="text-[10px] font-bold text-green-500 mb-1 flex items-center gap-1">
                          <UIcon
                            name="i-lucide-check-circle"
                            size="10"
                          />
                          TOOL RESULT: {{ tr.tool_use_id }}
                        </div>
                        <pre class="text-[10px] font-mono overflow-x-auto">{{ typeof tr.content === 'string' ? tr.content : JSON.stringify(tr.content, null, 2) }}</pre>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section class="border-t border-gray-200 dark:border-gray-800 pt-6">
              <h3 class="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">
                Manual Response
              </h3>
              <div class="flex flex-col w-full space-y-6">
                <div class="flex flex-col w-full space-y-2">
                  <div class="flex items-center justify-between">
                    <label class="text-xs font-medium text-gray-500">Text Content</label>
                  </div>
                  <UTextarea
                    v-model="responses[activeRequest.id]"
                    placeholder="Type your response as the assistant..."
                    :rows="6"
                    autoresize
                    autofocus
                    class="w-full shadow-sm"
                  />
                </div>

                <!-- Structured Tool Calls -->
                <div class="flex flex-col w-full space-y-4">
                  <div class="flex items-center justify-between">
                    <div class="flex flex-col gap-1">
                      <label class="text-xs font-medium text-gray-500">Tool Calls</label>
                      <div
                        v-if="availableTools.length"
                        class="flex flex-wrap gap-1 mt-1"
                      >
                        <UButton
                          v-for="tool in availableTools"
                          :key="tool.function?.name || tool.name"
                          size="xs"
                          variant="soft"
                          color="primary"
                          icon="i-lucide-plus"
                          @click="addToolCall(activeRequest.id, tool)"
                        >
                          {{ tool.function?.name || tool.name }}
                        </UButton>
                      </div>
                    </div>
                    <UButton
                      size="xs"
                      variant="ghost"
                      color="neutral"
                      @click="addToolCall(activeRequest.id)"
                    >
                      Custom Tool
                    </UButton>
                  </div>

                  <!-- Tool Call List -->
                  <div
                    v-if="structuredToolCalls[activeRequest.id]?.length"
                    class="space-y-3"
                  >
                    <UCard
                      v-for="(tc, idx) in structuredToolCalls[activeRequest.id]"
                      :key="tc.id"
                      size="sm"
                      class="relative group border-primary-200 dark:border-primary-900 shadow-none bg-primary-50/30 dark:bg-primary-950/20"
                    >
                      <template #header>
                        <div class="flex justify-between items-center py-1">
                          <div class="flex items-center gap-2">
                            <UIcon
                              name="i-lucide-wrench"
                              class="text-primary-500"
                            />
                            <span class="text-xs font-bold font-mono">{{ tc.name }}</span>
                            <span class="text-[10px] text-gray-400 font-mono">{{ tc.id }}</span>
                          </div>
                          <UButton
                            icon="i-lucide-trash"
                            size="xs"
                            color="error"
                            variant="ghost"
                            @click="removeToolCall(activeRequest.id, idx)"
                          />
                        </div>
                      </template>

                      <div class="grid grid-cols-1 gap-3">
                        <div
                          v-if="tc.description"
                          class="text-[11px] text-gray-500 bg-white/50 dark:bg-black/20 p-2 rounded border border-black/5 dark:border-white/5"
                        >
                          {{ tc.description }}
                        </div>
                        <div
                          v-for="(val, key) in tc.arguments"
                          :key="key"
                          class="space-y-1"
                        >
                          <label class="text-[10px] font-bold text-gray-400 uppercase">{{ key }}</label>
                          <ToolParameterEditor
                            v-model="tc.arguments[key]"
                            :schema="tc.parameters?.[key]"
                            :name="key as string"
                          />
                        </div>

                        <div
                          v-if="Object.keys(tc.arguments).length === 0"
                          class="text-xs text-gray-400 italic py-2"
                        >
                          No parameters defined for this tool.
                        </div>
                        <UButton
                          size="xs"
                          variant="ghost"
                          icon="i-lucide-plus"
                          class="w-fit mt-1"
                          @click="promptNewParameter(tc)"
                        >
                          Add Parameter
                        </UButton>
                      </div>
                    </UCard>
                  </div>
                </div>

                <div class="flex justify-end gap-3">
                  <UButton
                    :loading="submitting[activeRequest.id]"
                    color="primary"
                    size="lg"
                    :disabled="!responses[activeRequest?.id || ''] && (!structuredToolCalls[activeRequest?.id || ''] || structuredToolCalls[activeRequest?.id || '']?.length === 0)"
                    @click="submitResponse(activeRequest.id)"
                  >
                    Send to Client
                    <template #trailing>
                      <UIcon name="i-lucide-send" />
                    </template>
                  </UButton>
                </div>
              </div>
            </section>
          </div>
        </template>

        <div
          v-else
          class="flex-1 flex flex-col items-center justify-center text-gray-500 p-10 text-center"
        >
          <div class="w-20 h-20 rounded-full bg-gray-100 dark:bg-gray-900 flex items-center justify-center mb-6">
            <UIcon
              name="i-lucide-message-square"
              class="w-10 h-10 text-gray-300"
            />
          </div>
          <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Select a request
          </h2>
          <p class="max-w-md">
            Choose a pending request from the sidebar to view details and provide a response. New requests will appear here automatically.
          </p>
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
.flex-1 {
  min-height: 0;
}
</style>
