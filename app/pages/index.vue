<script setup lang="ts">
const { data: requests } = useFetch<Record<string, unknown>[]>('/api/internal/requests')
const { data: settings } = useFetch<Record<string, unknown>>('/api/settings')
const { data: authStatus } = useFetch<Record<string, unknown>>('/api/auth/check')
const { t } = useI18n()

const pendingCount = computed(() => requests.value?.length || 0)

const copyToClipboard = (text: string) => {
  navigator.clipboard.writeText(text)
  useToast().add({ title: t('copied'), color: 'success' })
}

const statusItems = computed(() => {
  const items = []
  if (settings.value?.showPendingCountPublic) {
    items.push({
      label: settings.value?.pendingRequestsLabel || t('pending_requests'),
      value: pendingCount.value,
      icon: 'i-lucide-message-square',
      color: 'primary'
    })
  }
  items.push({
    label: t('api_key_auth'),
    value: settings.value?.enableApiKeyAuth ? t('enabled') : t('disabled'),
    icon: 'i-lucide-shield',
    color: settings.value?.enableApiKeyAuth ? 'success' : 'neutral'
  })
  items.push({
    label: t('admin_auth'),
    value: authStatus.value?.authRequired ? t('active') : t('bypass'),
    icon: 'i-lucide-lock',
    color: 'info'
  })
  if (settings.value?.showTokensPublic) {
    items.push({
      label: `${settings.value?.tokensLabel || 'Tokens'} (In)`,
      value: (settings.value?.tokensInputToday || 0).toLocaleString(),
      icon: 'i-lucide-arrow-right-to-line',
      color: 'indigo'
    })
    items.push({
      label: `${settings.value?.tokensLabel || 'Tokens'} (Out)`,
      value: (settings.value?.tokensOutputToday || 0).toLocaleString(),
      icon: 'i-lucide-arrow-up-circle',
      color: 'violet'
    })
  }
  return items
})

const baseUrl = computed(() => settings.value?.publicBaseUrl || 'http://localhost:3000')
const siteTitle = computed(() => settings.value?.siteTitle || 'Call Me As Agent')
const siteSubtitle = computed(() => settings.value?.siteSubtitle || 'A Human-in-the-loop LLM Proxy Service')
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-950 p-6 md:p-10 transition-colors">
    <UContainer>
      <!-- Hero / Logo -->
      <header class="mb-10 text-center animate-in fade-in duration-500">
        <div class="flex justify-center mb-4">
          <div
            v-if="settings?.siteLogo"
            class="w-20 h-20 rounded-2xl overflow-hidden shadow-lg border border-white dark:border-gray-800"
          >
            <img
              :src="settings.siteLogo"
              class="w-full h-full object-cover"
              :alt="siteTitle"
            >
          </div>
          <div
            v-else
            class="w-16 h-16 rounded-2xl bg-primary-500 flex items-center justify-center shadow-lg shadow-primary-500/20 text-white"
          >
            <UIcon
              name="i-lucide-bot"
              class="w-10 h-10"
            />
          </div>
        </div>
        <h1 class="text-4xl font-black tracking-tight text-gray-900 dark:text-white">
          {{ siteTitle }}
        </h1>
        <p class="text-gray-500 mt-2 italic">
          {{ siteSubtitle }}
        </p>
      </header>

      <!-- Stats Grid -->
      <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 mb-10">
        <UCard
          v-for="item in statusItems"
          :key="item.label"
          class="shadow-sm border-none bg-white dark:bg-gray-900"
        >
          <div class="flex items-center gap-4">
            <div
              class="p-3 rounded-xl"
              :class="`bg-${item.color}-500/10 text-${item.color}-500`"
            >
              <UIcon
                :name="item.icon"
                class="w-6 h-6"
              />
            </div>
            <div>
              <div class="text-xs text-gray-500 font-bold uppercase tracking-wider">
                {{ item.label }}
              </div>
              <div class="text-2xl font-black text-gray-900 dark:text-white">
                {{ item.value }}
              </div>
            </div>
          </div>
        </UCard>
      </div>

      <div class="grid grid-cols-1 gap-8">
        <!-- Endpoint Management -->
        <section class="space-y-6 max-w-2xl mx-auto w-full">
          <h2 class="text-xl font-bold flex items-center gap-2 text-gray-900 dark:text-white">
            <UIcon
              name="i-lucide-network"
              class="text-gray-400"
            />
            {{ t('active_endpoints') }}
          </h2>

          <div class="space-y-4">
            <UCard
              variant="subtle"
              class="border border-gray-100 dark:border-gray-800"
            >
              <template #header>
                <div class="flex justify-between items-center py-0.5">
                  <div class="flex items-center gap-2">
                    <UIcon
                      name="i-simple-icons-openai"
                      class="text-[#00A67E]"
                    />
                    <span class="font-bold text-gray-900 dark:text-white">OpenAI V1</span>
                  </div>
                  <UButton
                    icon="i-lucide-copy"
                    size="xs"
                    variant="ghost"
                    color="neutral"
                    @click="copyToClipboard(`${baseUrl}/api/openai/v1`)"
                  />
                </div>
              </template>
              <div class="space-y-2">
                <code class="text-xs break-all bg-black/5 dark:bg-white/5 p-2 block rounded font-mono text-gray-800 dark:text-gray-200">{{ baseUrl }}/api/openai/v1</code>
                <div
                  v-if="settings?.showApiKeyPublic && settings?.enableApiKeyAuth"
                  class="text-[10px] text-amber-500 uppercase font-bold tracking-widest flex items-center gap-1"
                >
                  <UIcon name="i-lucide-key" /> {{ t('auth_hint') }}
                </div>
              </div>
            </UCard>

            <UCard
              variant="subtle"
              class="border border-gray-100 dark:border-gray-800"
            >
              <template #header>
                <div class="flex justify-between items-center py-0.5">
                  <div class="flex items-center gap-2">
                    <UIcon
                      name="i-simple-icons-anthropic"
                      class="text-[#D97757]"
                    />
                    <span class="font-bold text-gray-900 dark:text-white">Claude V1</span>
                  </div>
                  <UButton
                    icon="i-lucide-copy"
                    size="xs"
                    variant="ghost"
                    color="neutral"
                    @click="copyToClipboard(`${baseUrl}/api/claude`)"
                  />
                </div>
              </template>
              <div class="space-y-2">
                <code class="text-xs break-all bg-black/5 dark:bg-white/5 p-2 block rounded font-mono text-gray-800 dark:text-gray-200">{{ baseUrl }}/api/claude</code>
                <div
                  v-if="settings?.showApiKeyPublic && settings?.enableApiKeyAuth"
                  class="text-[10px] text-amber-500 uppercase font-bold tracking-widest flex items-center gap-1"
                >
                  <UIcon name="i-lucide-key" /> {{ t('auth_hint') }}
                </div>
              </div>
            </UCard>
          </div>
        </section>
      </div>

      <footer class="mt-20 pt-10 border-t border-gray-200 dark:border-gray-800 flex flex-col md:flex-row justify-between items-center gap-6 text-xs text-gray-400">
        <div class="flex flex-wrap justify-center items-center gap-4">
          <div class="flex items-center gap-2">
            <span class="font-bold text-gray-500 dark:text-gray-300">{{ siteTitle }}</span>
            <span>{{ t('released_under') }}</span>
          </div>
          <UButton
            to="/agent"
            variant="link"
            color="neutral"
            size="xs"
            icon="i-lucide-lock"
          >
            {{ t('admin_dashboard') }}
          </UButton>
          <UButton
            to="https://github.com/huangdihd/call_me_as_agent"
            target="_blank"
            variant="link"
            color="neutral"
            size="xs"
            icon="i-simple-icons-github"
          >
            GitHub
          </UButton>
          <UButton
            to="https://t.me/call_me_as_agent"
            target="_blank"
            variant="link"
            color="neutral"
            size="xs"
            icon="i-simple-icons-telegram"
          >
            @call_me_as_agent
          </UButton>
        </div>
        <div>v1.0.0</div>
      </footer>
    </UContainer>
  </div>
</template>
