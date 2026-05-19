<script setup lang="ts">
interface PendingRequest {
  id: string
  type: 'openai' | 'claude' | 'openai-responses'
  payload: Record<string, unknown>
  timestamp: number
  draft?: {
    response: string
    toolCalls: Record<string, unknown>[]
    simulateStream: boolean
  }
}

interface ToolCallItem {
  id: string
  name: string
  description: string
  arguments: Record<string, unknown>
  parameters: Record<string, any>
}

// 1. State declarations first
const { data: requests, refresh } = useFetch<PendingRequest[]>('/api/internal/requests')
const { data: settings } = useFetch<Record<string, unknown>>('/api/settings')
const activeRequestId = ref<string | null>(null)
const isAuthenticated = ref(true)
const isOtpEnabled = ref(false)
const isPasswordRequired = ref(false)
const loginPassword = ref('')
const loginOtpCode = ref('')
const isLoggingIn = ref(false)
const isSidebarOpen = ref(false) // NEW: Mobile sidebar state
const responses = ref<Record<string, string>>({})
const structuredToolCalls = ref<Record<string, ToolCallItem[]>>({})
const simulateStream = ref<Record<string, boolean>>({})
const sentHistory = ref<Record<string, Record<string, unknown>[]>>({})
const submitting = ref<Record<string, boolean>>({})
const finishing = ref<Record<string, boolean>>({})
const { t } = useI18n()
const toast = useToast()

// Multi-device sync: Sync drafts
const syncDraft = async (id: string) => {
  try {
    await $fetch('/api/internal/draft', {
      method: 'POST',
      body: {
        id,
        draft: {
          response: responses.value[id] || '',
          toolCalls: structuredToolCalls.value[id] || [],
          simulateStream: simulateStream.value[id] !== false
        }
      }
    })
  } catch (e) {
    console.error('Failed to sync draft:', e)
  }
}

// Watch for changes and sync (debounced)
const draftTimers: Record<string, ReturnType<typeof setTimeout>> = {}
const queueDraftSync = (id: string) => {
  if (draftTimers[id]) clearTimeout(draftTimers[id])
  draftTimers[id] = setTimeout(() => syncDraft(id), 1000)
}

watch(responses, (newVal, oldVal) => {
  Object.keys(newVal).forEach((id) => {
    if (newVal[id] !== oldVal[id]) queueDraftSync(id)
  })
}, { deep: true })

watch(structuredToolCalls, (newVal, oldVal) => {
  Object.keys(newVal).forEach((id) => {
    if (JSON.stringify(newVal[id]) !== JSON.stringify(oldVal[id])) queueDraftSync(id)
  })
}, { deep: true })

watch(simulateStream, (newVal, oldVal) => {
  Object.keys(newVal).forEach((id) => {
    if (newVal[id] !== oldVal[id]) queueDraftSync(id)
  })
}, { deep: true })

// 2. Auth logic
const checkAuth = async () => {
  const res = await $fetch<Record<string, unknown>>('/api/auth/check')
  isAuthenticated.value = res.authenticated as boolean
  isOtpEnabled.value = res.otpEnabled as boolean
  isPasswordRequired.value = res.passwordRequired as boolean
}

const login = async () => {
  isLoggingIn.value = true
  try {
    await $fetch('/api/auth/login', {
      method: 'POST',
      body: {
        password: loginPassword.value,
        otpCode: loginOtpCode.value
      }
    })
    isAuthenticated.value = true
    await refresh()
  } catch (e: unknown) {
    const errorData = (e as { data?: { statusMessage?: string } })?.data
    toast.add({ title: errorData?.statusMessage || t('invalid_password'), color: 'error' })
  } finally {
    isLoggingIn.value = false
  }
}

const logout = async () => {
  await $fetch('/api/auth/logout', { method: 'POST' })
  isAuthenticated.value = false
  loginPassword.value = ''
}

const activeRequest = computed(() => {
  if (!requests.value) return null
  return requests.value.find(r => r.id === activeRequestId.value) || null
})

watch(requests, (newRequests) => {
  if (newRequests?.length) {
    newRequests.forEach((r) => {
      if (simulateStream.value[r.id] === undefined) {
        simulateStream.value[r.id] = r.draft?.simulateStream !== undefined ? r.draft.simulateStream : true
      }
      // Populate local state from server draft if local is empty
      if (r.draft) {
        if (!responses.value[r.id]) responses.value[r.id] = r.draft.response
        const tc = structuredToolCalls.value[r.id]
        if (!tc || tc.length === 0) {
          structuredToolCalls.value[r.id] = r.draft.toolCalls as unknown as ToolCallItem[]
        }
      }
    })
    if (!activeRequestId.value) {
      activeRequestId.value = newRequests[0]?.id || null
    }
  } else {
    activeRequestId.value = null
  }
}, { immediate: true })

const pollInterval = ref<ReturnType<typeof setInterval> | null>(null)
const chatContainer = ref<HTMLElement | null>(null)

const scrollToBottom = async () => {
  await nextTick()
  if (chatContainer.value) {
    chatContainer.value.scrollTo({
      top: chatContainer.value.scrollHeight,
      behavior: 'smooth'
    })
  }
}

onMounted(() => {
  checkAuth()
  pollInterval.value = setInterval(() => {
    if (isAuthenticated.value) refresh()
  }, 2000)
})

const selectRequest = (id: string) => {
  activeRequestId.value = id
  if (window.innerWidth < 1024) {
    isSidebarOpen.value = false
  }
}

// Scroll when active request changes or messages update
watch([activeRequestId], () => {
  scrollToBottom()
}, { deep: true })

onUnmounted(() => {
  if (pollInterval.value) clearInterval(pollInterval.value)
})

const copyToClipboard = (text: string) => {
  navigator.clipboard.writeText(text)
  toast.add({ title: t('copied'), color: 'success' })
}

const addToolCall = (requestId: string, tool?: Record<string, unknown>) => {
  if (!structuredToolCalls.value[requestId]) {
    structuredToolCalls.value[requestId] = []
  }

  if (simulateStream.value[requestId] === undefined) {
    simulateStream.value[requestId] = true
  }

  const toolFn = (tool?.function || tool) as Record<string, unknown> | undefined
  const parameters = (toolFn?.parameters as Record<string, unknown>)?.properties as Record<string, any> || (toolFn?.input_schema as Record<string, unknown>)?.properties as Record<string, any> || {}
  const args: Record<string, unknown> = {}

  Object.keys(parameters).forEach((key) => {
    const prop = parameters[key]
    const toolName = (toolFn?.name as string) || ''
    if (key === 'questions' && toolName === 'ask_user') {
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
    name: (toolFn?.name as string) || 'custom_tool',
    description: (toolFn?.description as string) || '',
    arguments: args,
    parameters: parameters
  })
}

const removeToolCall = (requestId: string, index: number) => {
  structuredToolCalls.value[requestId]?.splice(index, 1)
}

const promptNewParameter = (tc: ToolCallItem) => {
  const k = window.prompt(t('new_param_name'))
  if (k) {
    tc.arguments[k] = ''
  }
}

const parseToolCalls = (id: string) => {
  return (structuredToolCalls.value[id] || []).map((tc) => {
    const parsedArgs: Record<string, unknown> = {}
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
      if (parsedArgs[key] === undefined) delete parsedArgs[key]
    }
    return { id: tc.id, type: 'function', function: { name: tc.name, arguments: JSON.stringify(parsedArgs) } }
  })
}

const sendPart = async (id: string) => {
  const toolCalls = parseToolCalls(id)
  let content = responses.value[id] || ''
  const isStreaming = simulateStream.value[id] !== false
  const manualId = Math.random().toString(36).substring(2, 15)

  // Clear local input immediately to allow next typing
  responses.value[id] = ''
  structuredToolCalls.value[id] = []

  submitting.value[id] = true
  try {
    // Auto-append newline for multi-turn feel
    if (content && !content.endsWith('\n')) {
      content += '\n'
    }

    await $fetch('/api/internal/respond', {
      method: 'POST',
      body: {
        id,
        response: content,
        toolCalls: toolCalls.length > 0 ? toolCalls : null,
        simulateStream: isStreaming,
        _manualId: manualId
      }
    })

    if (!sentHistory.value[id]) sentHistory.value[id] = []
    sentHistory.value[id].push({
      role: 'assistant',
      content: content,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      _is_manual: true,
      _manualId: manualId
    })

    await refresh()
    toast.add({ title: t('response_sent'), color: 'primary', duration: settings.value?.toastTimeout ? Number(settings.value.toastTimeout) : 3000 })
    scrollToBottom()
  } catch (error) {
    console.error('Failed to send part:', error)
    toast.add({ title: t('response_failed'), color: 'error', duration: settings.value?.toastTimeout ? Number(settings.value.toastTimeout) : 3000 })
  } finally {
    submitting.value[id] = false
  }
}

const finish = async (id: string) => {
  const toolCalls = parseToolCalls(id)
  const content = responses.value[id] || ''
  const isStreaming = simulateStream.value[id] !== false
  const manualId = Math.random().toString(36).substring(2, 15)

  responses.value[id] = ''
  structuredToolCalls.value[id] = []

  finishing.value[id] = true
  try {
    await $fetch('/api/internal/finish', {
      method: 'POST',
      body: {
        id,
        response: content,
        toolCalls: toolCalls.length > 0 ? toolCalls : null,
        simulateStream: isStreaming,
        _manualId: manualId
      }
    })

    delete responses.value[id]
    delete structuredToolCalls.value[id]
    delete simulateStream.value[id]
    delete sentHistory.value[id]
    await refresh()
    toast.add({ title: t('response_sent'), color: 'primary', duration: settings.value?.toastTimeout ? Number(settings.value.toastTimeout) : 3000 })
    scrollToBottom()
  } catch (error) {
    console.error('Failed to finish request:', error)
    toast.add({ title: t('response_failed'), color: 'error', duration: settings.value?.toastTimeout ? Number(settings.value.toastTimeout) : 3000 })
  } finally {
    finishing.value[id] = false
  }
}

const getMessages = (payload: Record<string, any>, reqId: string) => {
  let messages: Record<string, any>[] = []

  const extractText = (content: unknown): string => {
    if (typeof content === 'string') return content
    if (Array.isArray(content)) {
      return content.map((c) => {
        if (typeof c === 'string') return c
        if (c.type === 'text') return c.text
        if (c.type === 'tool_use') return `[Tool Use: ${c.name}]`
        if (c.type === 'tool_result') return extractText(c.content)
        if (['image_url', 'image', 'input_image'].includes(c.type)) return ''
        return c.text || c.output || c.arguments || JSON.stringify(c)
      }).filter(Boolean).join('\n')
    }
    const cObj = content as Record<string, any>
    if (cObj?.type === 'text') return cObj.text
    if (cObj?.type === 'tool_result') return extractText(cObj.content)
    if (['image_url', 'image', 'input_image'].includes(cObj?.type)) return ''
    return cObj?.text || cObj?.output || cObj?.arguments || JSON.stringify(cObj)
  }

  if (payload.messages) {
    messages = [...payload.messages]
    if (payload.system) {
      if (typeof payload.system === 'string') {
        messages.unshift({ role: 'system', content: payload.system })
      } else if (Array.isArray(payload.system)) {
        messages.unshift({ role: 'system', content: payload.system })
      }
    }
  } else if (payload.input || payload.instructions) {
    if (payload.instructions) {
      messages.push({ role: 'system', content: payload.instructions })
    }
    if (typeof payload.input === 'string') {
      messages.push({ role: 'user', content: payload.input })
    } else if (Array.isArray(payload.input)) {
      payload.input.forEach((item: Record<string, any>) => {
        let role = item.role
        if (!role) {
          if (item.type === 'message') role = 'user'
          else if (item.type === 'developer_message') role = 'system'
          else if (item.type === 'function_call_output') role = 'tool'
          else role = 'tool'
        }
        if (role === 'developer') role = 'system'
        messages.push({ role, content: extractText(item.content || item) })
      })
    }
  }

  if (reqId && sentHistory.value[reqId]) {
    const existingIds = new Set(messages.filter(m => m._is_manual).map(m => m._manualId))
    sentHistory.value[reqId].forEach((sm) => {
      if (!sm._manualId || !existingIds.has(sm._manualId)) {
        messages.push(sm)
      }
    })
  }

  return messages.map((m) => {
    const images: string[] = []
    const toolCalls: Record<string, any>[] = []
    const toolResults: Record<string, any>[] = []
    let textContent = ''
    let role = m.role

    if (typeof m.content === 'string') {
      textContent = m.content
    } else if (Array.isArray(m.content)) {
      m.content.forEach((c: Record<string, any>) => {
        if (c.type === 'text') {
          textContent += (textContent ? '\n' : '') + c.text
        } else if (c.type === 'image_url') {
          images.push(c.image_url.url || c.image_url)
        } else if (c.type === 'image') {
          images.push(`data:${c.source.media_type};base64,${c.source.data}`)
        } else if (c.type === 'input_image') {
          let url = typeof c.image_url === 'string' ? c.image_url : (c.image_url?.url || '')
          if (url && !url.startsWith('http') && !url.startsWith('data:')) {
            url = `data:image/jpeg;base64,${url}`
          }
          if (url) images.push(url)
        } else if (c.type === 'tool_use') {
          toolCalls.push(c)
        } else if (c.type === 'tool_result') {
          toolResults.push({
            ...c,
            displayContent: extractText(c.content)
          })
          role = 'tool'
        } else if (c.type === 'thinking' || c.type === 'thought') {
          textContent += (textContent ? '\n' : '') + `> Thinking: ${c.thinking || c.thought || c.text || JSON.stringify(c)}`
        } else {
          // Fallback for unknown block types
          const fallbackText = c.text || c.output || (typeof c === 'object' ? JSON.stringify(c) : String(c))
          if (fallbackText && fallbackText !== '{}') {
            textContent += (textContent ? '\n' : '') + fallbackText
          }
        }
      })
    }

    if (m.tool_calls) m.tool_calls.forEach((tc: Record<string, any>) => toolCalls.push(tc))

    return {
      role,
      content: textContent,
      images,
      toolCalls,
      toolResults,
      tool_call_id: m.tool_call_id,
      _is_manual: m._is_manual
    }
  })
}

const formatTimestamp = (ts: number) => {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

const availableTools = computed(() => {
  if (!activeRequest.value?.payload?.tools) return []
  return activeRequest.value.payload.tools as Record<string, any>[]
})
</script>

<template>
  <div class="h-screen flex flex-col bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 overflow-hidden relative">
    <!-- Auth Screen -->
    <div
      v-if="!isAuthenticated"
      class="h-screen w-full flex items-center justify-center bg-gray-50 dark:bg-gray-900 overflow-auto p-4"
    >
      <UCard class="w-full max-w-sm shadow-xl text-gray-900 dark:text-white bg-white dark:bg-gray-900">
        <template #header>
          <div class="flex flex-col items-center gap-4 py-2">
            <div
              v-if="settings?.siteLogo"
              class="w-16 h-16 rounded-2xl overflow-hidden shadow-md border border-gray-100 dark:border-gray-800"
            >
              <img
                :src="settings.siteLogo as string"
                class="w-full h-full object-cover"
              >
            </div>
            <div
              v-else
              class="w-12 h-12 rounded-xl bg-primary-500 flex items-center justify-center text-white"
            >
              <UIcon
                name="i-lucide-lock"
                class="w-6 h-6"
              />
            </div>
            <h2 class="font-bold text-xl text-center">
              {{ t('auth_required') }}
            </h2>
          </div>
        </template>
        <div class="space-y-4">
          <p class="text-sm text-gray-500">
            {{ t('auth_desc') }}
          </p>
          <UInput
            v-if="isPasswordRequired"
            v-model="loginPassword"
            type="password"
            placeholder="Enter Password"
            autofocus
            icon="i-lucide-key"
            class="w-full"
            @keyup.enter="login"
          />
          <UInput
            v-if="isOtpEnabled"
            v-model="loginOtpCode"
            type="text"
            :placeholder="t('otp_code')"
            icon="i-lucide-shield-check"
            class="w-full"
            maxlength="6"
            @keyup.enter="login"
          />
          <UButton
            block
            color="primary"
            :loading="isLoggingIn"
            @click="login"
          >
            {{ t('login') }}
          </UButton>
        </div>
      </UCard>
    </div>

    <!-- Main Dashboard -->
    <div
      v-else
      class="flex flex-1 overflow-hidden relative"
    >
      <!-- Overlay for mobile sidebar -->
      <div
        v-if="isSidebarOpen"
        class="fixed inset-0 bg-black/50 z-40 lg:hidden"
        @click="isSidebarOpen = false"
      />

      <!-- Sidebar -->
      <aside
        class="absolute inset-y-0 left-0 w-80 lg:relative lg:translate-x-0 transition-transform duration-300 z-50 border-r border-gray-200 dark:border-gray-800 flex flex-col bg-white dark:bg-gray-900"
        :class="isSidebarOpen ? 'translate-x-0' : '-translate-x-full'"
      >
        <div class="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between bg-white dark:bg-gray-900 sticky top-0 z-10">
          <div class="flex items-center gap-3">
            <div
              v-if="settings?.siteLogo"
              class="w-8 h-8 rounded-lg overflow-hidden border border-gray-100 dark:border-gray-800"
            >
              <img
                :src="settings.siteLogo as string"
                class="w-full h-full object-cover"
              >
            </div>
            <div
              v-else
              class="w-8 h-8 rounded-lg bg-primary-500 flex items-center justify-center text-white"
            >
              <UIcon
                name="i-lucide-bot"
                class="w-5 h-5"
              />
            </div>
            <h2 class="font-bold text-sm text-gray-900 dark:text-white truncate max-w-[120px]">
              {{ settings?.siteTitle || 'Agent Dashboard' }}
            </h2>
          </div>
          <div class="flex items-center gap-2">
            <UButton
              icon="i-lucide-home"
              size="xs"
              variant="ghost"
              color="neutral"
              to="/"
            />
            <UBadge
              v-if="requests?.length"
              color="primary"
              variant="subtle"
              size="xs"
            >
              {{ requests.length }}
            </UBadge>
          </div>
        </div>

        <div class="flex-1 overflow-y-auto p-2 space-y-1 font-sans">
          <template v-if="requests?.length">
            <button
              v-for="req in requests"
              :key="req.id"
              class="w-full text-left p-3 rounded-lg transition-colors group relative"
              :class="activeRequestId === req.id ? 'bg-primary-50 dark:bg-primary-950 text-primary-600 dark:text-primary-400' : 'hover:bg-gray-100 dark:hover:bg-gray-800'"
              @click="selectRequest(req.id)"
            >
              <div class="flex justify-between items-start mb-1">
                <UBadge
                  :color="req.type === 'claude' ? 'info' : 'primary'"
                  variant="subtle"
                  size="xs"
                >
                  {{ req.type.toUpperCase() }}
                </UBadge>
                <div class="flex items-center gap-2">
                  <span
                    v-if="submitting[req.id]"
                    class="text-[10px] text-primary-500 font-bold animate-pulse flex items-center gap-1"
                  >
                    <UIcon
                      name="i-lucide-loader-2"
                      class="animate-spin"
                    /> {{ t('sending') }}
                  </span>
                  <span class="text-[10px] text-gray-400">{{ formatTimestamp(req.timestamp) }}</span>
                </div>
              </div>
              <div class="text-sm font-medium truncate">
                {{ getMessages(req.payload, req.id).slice(-1)[0]?.content || 'Multimodal/Tool Call' }}
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
            {{ t('no_pending') }}
          </div>
        </div>

        <div class="p-4 border-t border-gray-200 dark:border-gray-800 space-y-2 bg-white/50 dark:bg-gray-900/50">
          <div class="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
            {{ t('endpoints') }}
          </div>
          <div class="flex flex-col gap-1">
            <UButton
              variant="ghost"
              color="neutral"
              size="xs"
              block
              class="justify-start truncate"
              @click="copyToClipboard(`${settings?.publicBaseUrl || 'http://localhost:3000'}/api/openai/v1`)"
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
              @click="copyToClipboard(`${settings?.publicBaseUrl || 'http://localhost:3000'}/api/claude`)"
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
      <main class="flex-1 flex flex-col min-w-0 bg-white dark:bg-gray-950 h-full relative">
        <!-- Mobile Toggle Header -->
        <div class="lg:hidden p-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between bg-white dark:bg-gray-900 sticky top-0 z-30">
          <UButton
            icon="i-lucide-menu"
            variant="ghost"
            color="neutral"
            size="sm"
            @click="isSidebarOpen = true"
          />
          <div class="flex items-center gap-2">
            <div
              v-if="settings?.siteLogo"
              class="w-6 h-6 rounded border border-gray-100 dark:border-gray-800 overflow-hidden"
            >
              <img
                :src="settings.siteLogo as string"
                class="w-full h-full object-cover"
              >
            </div>
            <span class="text-xs font-bold truncate max-w-[150px]">{{ settings?.siteTitle || 'Dashboard' }}</span>
          </div>
          <div class="w-8" /> <!-- Spacer for balance -->
        </div>

        <template v-if="activeRequest">
          <!-- Fixed Header -->
          <header class="flex-shrink-0 p-4 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center bg-white/50 dark:bg-gray-950/50 backdrop-blur">
            <div>
              <div class="flex items-center gap-2">
                <h1 class="text-lg md:text-xl font-bold text-gray-900 dark:text-white">
                  {{ t('request_details') }}
                </h1>
                <UBadge
                  :color="activeRequest.type === 'claude' ? 'info' : 'primary'"
                  variant="solid"
                  size="xs"
                >
                  {{ activeRequest.type.toUpperCase() }}
                </UBadge>
              </div>
              <div class="text-[10px] md:text-xs text-gray-500 font-mono mt-0.5 md:mt-1 truncate max-w-[200px] md:max-w-none">
                ID: {{ activeRequest.id }}
              </div>
            </div>
            <div class="hidden sm:block text-sm text-gray-400">
              {{ t('received_at') }} {{ new Date(activeRequest.timestamp).toLocaleString() }}
            </div>
          </header>

          <!-- Scrollable Chat History -->
          <div
            ref="chatContainer"
            class="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 md:y-8 min-h-0"
          >
            <section>
              <h3 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">
                {{ t('conv_history') }}
              </h3>
              <div class="space-y-6">
                <div
                  v-for="(msg, index) in getMessages(activeRequest.payload, activeRequest.id)"
                  :key="index"
                >
                  <div
                    v-if="msg.content.trim() || msg.images.length || msg.toolCalls.length || msg.toolResults.length"
                    class="flex flex-col w-full"
                    :class="msg.role === 'assistant' ? 'items-end' : 'items-start'"
                  >
                    <div
                      class="max-w-[95%] sm:max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm border"
                      :class="{
                        'bg-primary-500 text-white border-primary-600': msg.role === 'assistant',
                        'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-200 dark:border-gray-700': msg.role !== 'assistant' && msg.role !== 'tool',
                        'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/50': msg.role === 'tool',
                        'italic': msg.role === 'system',
                        'ring-2 ring-primary-500/30': msg._is_manual
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
                        {{ msg.role }}
                        <span
                          v-if="msg._is_manual"
                          class="ml-1 text-[8px] bg-white/20 px-1 rounded font-black tracking-tighter"
                        >{{ t('manual_badge') }}</span>
                      </div>
                      <div
                        v-if="msg.content.trim()"
                        class="whitespace-pre-wrap break-words"
                      >
                        {{ msg.content }}
                      </div>
                      <div
                        v-if="msg.images.length"
                        class="mt-3 flex flex-col gap-2 w-fit"
                      >
                        <img
                          v-for="(img, i) in msg.images"
                          :key="i"
                          :src="img"
                          class="rounded-lg border border-white/20 max-h-80 max-w-full object-contain bg-black/5 block"
                        >
                      </div>
                      <div
                        v-if="msg.toolCalls.length"
                        class="mt-3 space-y-2"
                      >
                        <div
                          v-for="(tc, i) in msg.toolCalls"
                          :key="i"
                          class="p-2 bg-black/10 dark:bg-white/5 rounded-lg border border-black/5 dark:border-white/5 overflow-hidden"
                        >
                          <div class="text-[10px] font-bold text-blue-500 mb-1 flex items-center gap-1">
                            <UIcon
                              name="i-lucide-play"
                              size="10"
                            />
                            TOOL: {{ tc.function?.name || tc.name }}
                          </div>
                          <pre class="text-[10px] font-mono whitespace-pre-wrap break-all">{{ tc.function?.arguments || JSON.stringify(tc.input || {}) }}</pre>
                        </div>
                      </div>
                      <div
                        v-if="msg.toolResults.length"
                        class="mt-3 space-y-2"
                      >
                        <div
                          v-for="(tr, i) in msg.toolResults"
                          :key="i"
                          class="p-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20 overflow-hidden"
                        >
                          <div class="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 mb-1 flex items-center gap-1">
                            <UIcon
                              name="i-lucide-check-circle"
                              size="10"
                            />
                            RESULT: {{ tr.tool_use_id }}
                          </div>
                          <pre class="text-[10px] font-mono whitespace-pre-wrap break-all">{{ tr.displayContent || tr.content || tr.output || JSON.stringify(tr) }}</pre>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <!-- Fixed Response Footer -->
          <section class="flex-shrink-0 p-4 md:p-6 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] max-h-[60vh] flex flex-col">
            <div class="flex flex-col w-full space-y-4 overflow-hidden">
              <!-- Scrollable Content Area -->
              <div class="flex-1 overflow-y-auto space-y-4 min-h-0 pr-1">
                <div class="flex flex-col w-full space-y-2">
                  <label class="text-xs font-bold text-gray-400 uppercase tracking-wider">{{ t('manual_response') }}</label>
                  <UTextarea
                    v-model="responses[activeRequest.id]"
                    :placeholder="t('text_placeholder')"
                    :rows="3"
                    autoresize
                    class="w-full shadow-sm"
                  />
                </div>

                <!-- Structured Tool Calls -->
                <div class="flex flex-col w-full space-y-3">
                  <div class="flex items-center justify-between">
                    <label class="text-xs font-medium text-gray-500">{{ t('tool_calls') }}</label>
                    <UButton
                      size="xs"
                      variant="ghost"
                      color="neutral"
                      @click="addToolCall(activeRequest.id)"
                    >
                      {{ t('custom_tool') }}
                    </UButton>
                  </div>

                  <!-- Tool Buttons (Responsive Scroll) -->
                  <div
                    v-if="availableTools.length"
                    class="flex overflow-x-auto gap-1 pb-2 no-scrollbar"
                  >
                    <UButton
                      v-for="tool in availableTools"
                      :key="tool.function?.name || tool.name"
                      size="xs"
                      variant="soft"
                      color="primary"
                      class="flex-shrink-0"
                      icon="i-lucide-plus"
                      @click="addToolCall(activeRequest.id, tool)"
                    >
                      {{ tool.function?.name || tool.name }}
                    </UButton>
                  </div>

                  <div
                    v-if="structuredToolCalls[activeRequest.id]?.length"
                    class="flex flex-col gap-4 p-1 mb-2"
                  >
                    <UCard
                      v-for="(tc, idx) in structuredToolCalls[activeRequest.id]"
                      :key="tc.id"
                      size="sm"
                      class="w-full flex-shrink-0 relative group border-primary-200 dark:border-primary-900 shadow-sm bg-primary-50/30 dark:bg-primary-950/20 transition-all"
                    >
                      <template #header>
                        <div class="flex justify-between items-center py-1">
                          <div class="flex items-center gap-2">
                            <UIcon
                              name="i-lucide-wrench"
                              class="text-primary-500 w-4 h-4"
                            />
                            <span class="text-xs font-bold font-mono text-primary-700 dark:text-primary-400">{{ tc.name }}</span>
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
                      <div class="grid grid-cols-1 gap-2">
                        <div
                          v-for="(val, key) in tc.arguments"
                          :key="key"
                          class="space-y-1"
                        >
                          <label class="text-[9px] font-bold text-gray-400 uppercase">{{ key }}</label>
                          <ToolParameterEditor
                            v-model="tc.arguments[key]"
                            :schema="tc.parameters?.[key]"
                            :name="key as unknown as string"
                          />
                        </div>
                        <UButton
                          size="xs"
                          variant="ghost"
                          icon="i-lucide-plus"
                          class="w-fit"
                          @click="promptNewParameter(tc)"
                        >
                          {{ t('add_parameter') }}
                        </UButton>
                      </div>
                    </UCard>
                  </div>
                </div>
              </div>

              <!-- Action Bar (Always Fixed at bottom of footer) -->
              <div class="flex-shrink-0 flex flex-col sm:flex-row justify-between items-center gap-4 pt-4 border-t border-gray-100 dark:border-gray-800 bg-inherit">
                <div class="flex items-center gap-2">
                  <span class="text-xs text-gray-500 font-medium">{{ t('simulate_stream') }}</span>
                  <USwitch
                    v-model="simulateStream[activeRequest.id]"
                    size="sm"
                    :disabled="activeRequest.payload?.stream === false"
                  />
                </div>
                <div class="flex items-center gap-2 w-full sm:w-auto">
                  <template v-if="activeRequest.payload?.stream !== false">
                    <UButton
                      :loading="submitting[activeRequest.id]"
                      color="neutral"
                      variant="soft"
                      size="lg"
                      class="flex-1 sm:flex-none justify-center"
                      :disabled="finishing[activeRequest?.id || ''] || (!responses[activeRequest?.id || ''] && (!structuredToolCalls[activeRequest?.id || ''] || structuredToolCalls[activeRequest?.id || '']?.length === 0))"
                      @click="sendPart(activeRequest.id)"
                    >
                      {{ t('send_to_client') }}
                    </UButton>
                    <UButton
                      :loading="finishing[activeRequest.id]"
                      :disabled="submitting[activeRequest?.id || '']"
                      color="primary"
                      size="lg"
                      class="flex-1 sm:flex-none justify-center"
                      @click="finish(activeRequest.id)"
                    >
                      {{ t('finish_request') }}
                      <template #trailing>
                        <UIcon name="i-lucide-check-circle" />
                      </template>
                    </UButton>
                  </template>
                  <template v-else>
                    <UButton
                      :loading="finishing[activeRequest.id]"
                      color="primary"
                      size="lg"
                      class="flex-1 sm:flex-none justify-center w-full sm:w-auto"
                      @click="finish(activeRequest.id)"
                    >
                      {{ t('send_and_finish') }}
                      <template #trailing>
                        <UIcon name="i-lucide-check-circle" />
                      </template>
                    </UButton>
                  </template>
                </div>
              </div>
            </div>
          </section>
        </template>

        <div
          v-else
          class="flex-1 flex flex-col items-center justify-center text-gray-500 p-6 text-center"
        >
          <div class="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-900 flex items-center justify-center mb-4">
            <UIcon
              name="i-lucide-message-square"
              class="w-8 h-8 text-gray-300"
            />
          </div>
          <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-2">
            {{ t('select_request') }}
          </h2>
          <p class="text-sm max-w-xs">
            {{ t('select_request_desc') }}
          </p>
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
