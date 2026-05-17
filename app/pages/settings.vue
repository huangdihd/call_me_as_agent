<script setup lang="ts">
const isAuthenticated = ref(true)
const { t } = useI18n()

const checkAuth = async () => {
  const res: any = await $fetch('/api/auth/check')
  isAuthenticated.value = res.authenticated
}

const settingsForm = ref({
  enableApiKeyAuth: false,
  apiKey: '',
  siteTitle: '',
  siteSubtitle: '',
  pendingRequestsLabel: '',
  publicBaseUrl: '',
  primaryColor: 'green',
  language: 'zh',
  showPendingCountPublic: true,
  showApiKeyPublic: true
})

const isSaving = ref(false)
const toast = useToast()

const colorMap: Record<string, string> = {
  red: '#ef4444',
  orange: '#f97316',
  amber: '#f59e0b',
  yellow: '#eab308',
  lime: '#84cc16',
  green: '#22c55e',
  emerald: '#10b981',
  teal: '#14b8a6',
  cyan: '#06b6d4',
  sky: '#0ea5e9',
  blue: '#3b82f6',
  indigo: '#6366f1',
  violet: '#8b5cf6',
  purple: '#a855f7',
  fuchsia: '#d946ef',
  pink: '#ec4899',
  rose: '#f43f5e'
}

const colors = Object.keys(colorMap)

const loadSettings = async () => {
  try {
    const res: any = await $fetch('/api/internal/settings')
    Object.assign(settingsForm.value, res)
  } catch (e) {
    toast.add({ title: t('settings_load_failed'), color: 'error' })
  }
}

onMounted(() => {
  checkAuth()
  loadSettings()
})

const saveSettings = async () => {
  isSaving.value = true
  try {
    await $fetch('/api/internal/settings', {
      method: 'POST',
      body: settingsForm.value
    })
    toast.add({ title: t('settings_saved'), color: 'success' })
    
    // Update theme reactively
    if (import.meta.client) {
      const appConfig = useAppConfig()
      appConfig.ui.colors.primary = settingsForm.value.primaryColor
      // Refresh to apply language change fully if needed
      setTimeout(() => {
        window.location.reload()
      }, 500)
    }
  } catch (e) {
    toast.add({ title: t('settings_failed'), color: 'error' })
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <div class="min-h-screen w-full bg-gray-50 dark:bg-gray-950 flex flex-col pb-20 text-gray-900 dark:text-gray-100">
    <!-- Top Navigation -->
    <header class="p-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex items-center justify-between sticky top-0 z-10">
      <div class="flex items-center gap-4">
        <UButton
          icon="i-lucide-arrow-left"
          variant="ghost"
          color="neutral"
          to="/"
        />
        <h1 class="font-bold text-lg text-gray-900 dark:text-white">
          {{ t('server_settings') }}
        </h1>
      </div>
      <UButton
        color="primary"
        :loading="isSaving"
        @click="saveSettings"
      >
        {{ t('save') }}
      </UButton>
    </header>

    <!-- Main Content -->
    <main class="flex-1 p-6 flex justify-center">
      <div
        v-if="!isAuthenticated"
        class="text-center mt-20"
      >
        <UIcon
          name="i-lucide-lock"
          class="w-12 h-12 text-gray-400 mx-auto mb-4"
        />
        <h2 class="text-xl font-bold">
          {{ t('auth_required') }}
        </h2>
        <p class="text-gray-500 mt-2">
          {{ t('auth_desc') }}
        </p>
        <UButton
          class="mt-4"
          to="/agent"
        >
          {{ t('admin_dashboard') }}
        </UButton>
      </div>

      <div
        v-else
        class="w-full max-w-3xl space-y-8"
      >
        <!-- Branding Section -->
        <UCard>
          <template #header>
            <div class="flex items-center gap-2 text-primary-500">
              <UIcon
                name="i-lucide-palette"
                class="w-5 h-5"
              />
              <h2 class="font-bold text-lg text-gray-900 dark:text-white">
                {{ t('branding_appearance') }}
              </h2>
            </div>
          </template>

          <div class="space-y-6">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <UFormField
                :label="t('site_title')"
                :description="t('site_title_desc')"
              >
                <UInput
                  v-model="settingsForm.siteTitle"
                  placeholder="Call Me As Agent"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                :label="t('language')"
                :description="t('language_desc')"
              >
                <USelect
                  v-model="settingsForm.language"
                  :items="[{ label: '简体中文', value: 'zh' }, { label: 'English', value: 'en' }]"
                  class="w-full"
                />
              </UFormField>
            </div>

            <UFormField
              :label="t('site_subtitle')"
              :description="t('site_subtitle_desc')"
            >
              <UInput
                v-model="settingsForm.siteSubtitle"
                placeholder="A Human-in-the-loop LLM Proxy Service"
                class="w-full"
              />
            </UFormField>

            <UFormField
              :label="t('primary_color')"
              :description="t('primary_color_desc')"
            >
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="color in colors"
                  :key="color"
                  class="w-8 h-8 rounded-full border-2 transition-all active:scale-95 flex-shrink-0"
                  :style="{ backgroundColor: colorMap[color] }"
                  :class="[
                    settingsForm.primaryColor === color ? 'border-black dark:border-white scale-110 shadow-md ring-2 ring-primary-500/20' : 'border-transparent opacity-80 hover:opacity-100'
                  ]"
                  @click="settingsForm.primaryColor = color"
                />
              </div>
            </UFormField>
          </div>
        </UCard>

        <!-- Network Section -->
        <UCard>
          <template #header>
            <div class="flex items-center gap-2 text-primary-500">
              <UIcon
                name="i-lucide-globe"
                class="w-5 h-5"
              />
              <h2 class="font-bold text-lg text-gray-900 dark:text-white">
                {{ t('network_display') }}
              </h2>
            </div>
          </template>

          <div class="space-y-6">
            <UFormField
              :label="t('public_base_url')"
              :description="t('public_base_url_desc')"
            >
              <UInput
                v-model="settingsForm.publicBaseUrl"
                placeholder="http://localhost:3000"
                class="max-w-md"
              />
            </UFormField>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-gray-100 dark:border-gray-800">
              <UFormField
                :label="t('pending_requests_label')"
                :description="t('pending_requests_label_desc')"
              >
                <UInput
                  v-model="settingsForm.pendingRequestsLabel"
                  :placeholder="t('pending_requests')"
                />
              </UFormField>
              <div class="space-y-4">
                <UFormField
                  :label="t('show_pending_count')"
                  :description="t('show_pending_count_desc')"
                >
                  <USwitch v-model="settingsForm.showPendingCountPublic" />
                </UFormField>
                <UFormField
                  :label="t('show_api_key_hints')"
                  :description="t('show_api_key_hints_desc')"
                >
                  <USwitch v-model="settingsForm.showApiKeyPublic" />
                </UFormField>
              </div>
            </div>
          </div>
        </UCard>

        <!-- Security Section -->
        <UCard>
          <template #header>
            <div class="flex items-center gap-2 text-primary-500">
              <UIcon
                name="i-lucide-shield-check"
                class="w-5 h-5"
              />
              <h2 class="font-bold text-lg text-gray-900 dark:text-white">
                {{ t('api_security') }}
              </h2>
            </div>
          </template>

          <div class="space-y-6">
            <UFormField
              :label="t('enable_api_key_auth')"
              :description="t('enable_api_key_auth_desc')"
            >
              <USwitch v-model="settingsForm.enableApiKeyAuth" />
            </UFormField>

            <UFormField
              v-if="settingsForm.enableApiKeyAuth"
              :label="t('expected_api_key')"
              :description="t('expected_api_key_desc')"
            >
              <UInput
                v-model="settingsForm.apiKey"
                type="password"
                icon="i-lucide-key"
                placeholder="sk-human-agent"
                class="max-w-md"
              />
            </UFormField>
          </div>
        </UCard>

        <div class="flex items-center justify-center gap-4 pt-4 text-gray-900 dark:text-white">
          <UButton
            icon="i-simple-icons-github"
            label="GitHub Repository"
            variant="link"
            color="neutral"
            size="xs"
            to="https://github.com/huangdihd/call_me_as_agent"
            target="_blank"
          />
          <span class="text-xs text-gray-400">|</span>
          <span class="text-xs text-gray-400 text-center">Released under MIT License</span>
        </div>
      </div>
    </main>
  </div>
</template>
