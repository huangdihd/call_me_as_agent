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
  enableOtpAuth: false,
  otpSecret: '',
  siteTitle: '',
  siteSubtitle: '',
  siteLogo: '',
  pendingRequestsLabel: '',
  streamSpeed: 30,
  keepAliveInterval: 15,
  publicBaseUrl: '',
  primaryColor: 'green',
  language: 'zh',
  showPendingCountPublic: true,
  showApiKeyPublic: true,
  showTokensPublic: true,
  tokensLabel: '',
  toastTimeout: 3000
})

const isOtpModalOpen = ref(false)
const otpSetupData = ref<any>(null)
const otpVerificationCode = ref('')
const isVerifyingOtp = ref(false)

const openOtpSetup = async () => {
  try {
    otpSetupData.value = await $fetch('/api/internal/otp-setup')
    isOtpModalOpen.value = true
  } catch (e) {
    toast.add({ title: t('settings_load_failed'), color: 'error' })
  }
}

const verifyAndEnableOtp = async () => {
  if (!otpVerificationCode.value) return
  isVerifyingOtp.value = true
  try {
    // We send a login request to verify the OTP code
    await $fetch('/api/auth/login', {
      method: 'POST',
      body: { 
        password: '', // We are already authenticated, but we need to verify the OTP
        otpCode: otpVerificationCode.value,
        _isSetupVerification: true,
        _tempSecret: otpSetupData.value.secret
      }
    })
    
    // If successful, update settings
    settingsForm.value.enableOtpAuth = true
    settingsForm.value.otpSecret = otpSetupData.value.secret
    isOtpModalOpen.value = false
    otpVerificationCode.value = ''
    toast.add({ title: t('otp_enabled_success'), color: 'success' })
  } catch (e: any) {
    toast.add({ title: t('invalid_otp'), color: 'error' })
  } finally {
    isVerifyingOtp.value = false
  }
}

const disableOtp = () => {
  settingsForm.value.enableOtpAuth = false
  settingsForm.value.otpSecret = ''
  toast.add({ title: t('otp_disabled_success'), color: 'primary' })
}

const logoInput = ref<HTMLInputElement | null>(null)

const triggerLogoUpload = () => {
  logoInput.value?.click()
}

const onLogoUpload = (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return

  if (file.size > 2 * 1024 * 1024) {
    toast.add({ title: 'File too large (max 2MB)', color: 'error' })
    return
  }

  const reader = new FileReader()
  reader.onload = (event) => {
    settingsForm.value.siteLogo = event.target?.result as string
  }
  reader.readAsDataURL(file)
}

const clearLogo = () => {
  settingsForm.value.siteLogo = ''
}

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

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <UFormField
                :label="t('stream_speed')"
                :description="t('stream_speed_desc')"
              >
                <UInput
                  v-model="settingsForm.streamSpeed"
                  type="number"
                  class="w-full"
                  min="0"
                  max="1000"
                />
              </UFormField>
              <UFormField
                :label="t('keep_alive_interval')"
                :description="t('keep_alive_desc')"
              >
                <UInput
                  v-model="settingsForm.keepAliveInterval"
                  type="number"
                  class="w-full"
                  min="0"
                  max="300"
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
              :label="t('site_logo')"
              :description="t('site_logo_desc')"
            >
              <div class="flex items-center gap-4">
                <div
                  v-if="settingsForm.siteLogo"
                  class="w-16 h-16 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-800 flex-shrink-0 bg-white dark:bg-gray-900"
                >
                  <img
                    :src="settingsForm.siteLogo"
                    class="w-full h-full object-cover"
                  >
                </div>
                <div
                  v-else
                  class="w-16 h-16 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-800 flex items-center justify-center text-gray-400 flex-shrink-0"
                >
                  <UIcon
                    name="i-lucide-image"
                    class="w-6 h-6"
                  />
                </div>

                <div class="flex flex-col gap-2">
                  <div class="flex items-center gap-2">
                    <UButton
                      size="xs"
                      color="neutral"
                      variant="soft"
                      icon="i-lucide-upload"
                      @click="triggerLogoUpload"
                    >
                      {{ t('upload') }}
                    </UButton>
                    <UButton
                      v-if="settingsForm.siteLogo"
                      size="xs"
                      color="error"
                      variant="ghost"
                      icon="i-lucide-trash"
                      @click="clearLogo"
                    />
                  </div>
                  <p class="text-[10px] text-gray-400">
                    {{ t('max_logo_size_hint') }}
                  </p>
                </div>
                <input
                  ref="logoInput"
                  type="file"
                  accept="image/*"
                  class="hidden"
                  @change="onLogoUpload"
                >
              </div>
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
              <div class="space-y-4">
                <UFormField
                  :label="t('pending_requests_label')"
                  :description="t('pending_requests_label_desc')"
                >
                  <UInput
                    v-model="settingsForm.pendingRequestsLabel"
                    :placeholder="t('pending_requests')"
                  />
                </UFormField>
                <UFormField
                  :label="t('tokens_label')"
                  :description="t('tokens_label_desc')"
                >
                  <UInput
                    v-model="settingsForm.tokensLabel"
                    placeholder="Tokens"
                  />
                </UFormField>
                <UFormField
                  :label="t('toast_timeout')"
                  :description="t('toast_timeout_desc')"
                >
                  <UInput
                    v-model="settingsForm.toastTimeout"
                    type="number"
                    min="1000"
                    max="10000"
                  />
                </UFormField>
              </div>
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
                <UFormField
                  :label="t('show_tokens_public')"
                  :description="t('show_tokens_public_desc')"
                >
                  <USwitch v-model="settingsForm.showTokensPublic" />
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

            <div class="pt-6 border-t border-gray-100 dark:border-gray-800">
              <div class="flex items-center justify-between">
                <div>
                  <h3 class="text-sm font-bold text-gray-900 dark:text-white">
                    {{ t('otp_auth') }}
                  </h3>
                  <p class="text-xs text-gray-500">
                    {{ t('enable_otp_desc') }}
                  </p>
                </div>
                <div class="flex items-center gap-2">
                  <UBadge
                    v-if="settingsForm.enableOtpAuth"
                    color="success"
                    variant="subtle"
                  >
                    {{ t('enabled') }}
                  </UBadge>
                  <UButton
                    v-if="!settingsForm.enableOtpAuth"
                    size="sm"
                    color="primary"
                    @click="openOtpSetup"
                  >
                    {{ t('otp_setup_title') }}
                  </UButton>
                  <UButton
                    v-else
                    size="sm"
                    color="error"
                    variant="soft"
                    @click="disableOtp"
                  >
                    {{ t('disabled') }}
                  </UButton>
                </div>
              </div>
            </div>
          </div>
        </UCard>

        <!-- OTP Setup Modal -->
        <UModal v-model="isOtpModalOpen">
          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <h3 class="text-base font-semibold leading-6">
                  {{ t('otp_setup_title') }}
                </h3>
                <UButton
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-x"
                  class="-my-1"
                  @click="isOtpModalOpen = false"
                />
              </div>
            </template>

            <div class="space-y-6 py-2">
              <p class="text-sm text-gray-600 dark:text-gray-400">
                {{ t('otp_setup_step1') }}
              </p>
              
              <div class="space-y-4">
                <p class="text-sm text-gray-600 dark:text-gray-400">
                  {{ t('otp_setup_step2') }}
                </p>
                <div class="flex justify-center bg-white p-4 rounded-xl">
                  <img
                    v-if="otpSetupData?.qrCodeDataUrl"
                    :src="otpSetupData.qrCodeDataUrl"
                    class="w-48 h-48"
                  >
                </div>
                <div class="bg-gray-50 dark:bg-gray-900 p-3 rounded-lg border border-gray-100 dark:border-gray-800">
                  <label class="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">{{ t('otp_secret_label') }}</label>
                  <code class="text-xs font-mono break-all text-primary-600 dark:text-primary-400">{{ otpSetupData?.secret }}</code>
                </div>
              </div>

              <div class="space-y-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                <p class="text-sm text-gray-600 dark:text-gray-400">
                  {{ t('otp_setup_step3') }}
                </p>
                <UInput
                  v-model="otpVerificationCode"
                  placeholder="000000"
                  class="w-full text-center text-lg tracking-[1em]"
                  maxlength="6"
                  @keyup.enter="verifyAndEnableOtp"
                />
              </div>
            </div>

            <template #footer>
              <div class="flex justify-end gap-3">
                <UButton
                  variant="ghost"
                  color="neutral"
                  @click="isOtpModalOpen = false"
                >
                  {{ t('cancel') }}
                </UButton>
                <UButton
                  color="primary"
                  :loading="isVerifyingOtp"
                  :disabled="!otpVerificationCode"
                  @click="verifyAndEnableOtp"
                >
                  {{ t('verify_and_enable') }}
                </UButton>
              </div>
            </template>
          </UCard>
        </UModal>

        <div class="flex items-center justify-center gap-4 pt-4 text-gray-900 dark:text-white">
          <UButton
            icon="i-simple-icons-github"
            :label="t('github_repo')"
            variant="link"
            color="neutral"
            size="xs"
            to="https://github.com/huangdihd/call_me_as_agent"
            target="_blank"
          />
          <span class="text-xs text-gray-400">|</span>
          <span class="text-xs text-gray-400 text-center">{{ t('released_under') }}</span>
        </div>
      </div>
    </main>
  </div>
</template>
