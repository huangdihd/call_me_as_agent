<script setup lang="ts">
import type { AuthCheckResponse } from '#server/api/auth/check.get'
import type { OtpSetupResponse } from '#server/api/internal/otp-setup.get'
import type { SettingsGetResponse } from '#server/api/internal/settings.get'

const isAuthenticated = ref(true)
const { t } = useI18n()

const checkAuth = async () => {
  const res: AuthCheckResponse = await $fetch('/api/auth/check')
  isAuthenticated.value = res.authenticated
}

const settingsForm = ref({
  enableApiKeyAuth: false,
  apiKey: '',
  enablePasswordAuth: true,
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
  toastTimeout: 3000,
  shutdownMessage: '',
  useHeaderForIp: true,
  ipHeaderName: 'x-forwarded-for',
  enableEmailNotify: false,
  notifyEmailTo: '',
  smtpHost: '',
  smtpPort: 465,
  smtpSecure: true,
  smtpUser: '',
  smtpPass: '',
  enableEmailReply: false,
  imapHost: '',
  imapPort: 993,
  imapSecure: true,
  imapUser: '',
  imapPass: '',
  imapMailbox: 'INBOX',
  emailPollInterval: 60,
  emailReplyAllowFrom: ''
})

const isOtpModalOpen = ref(false)
const otpSetupData = ref<null | OtpSetupResponse>(null)
const otpVerificationCode = ref('')
const isVerifyingOtp = ref(false)

const openOtpSetup = async () => {
  try {
    otpSetupData.value = await $fetch('/api/internal/otp-setup')
    isOtpModalOpen.value = true
  } catch {
    toast.add({ title: t('settings_load_failed'), color: 'error' })
  }
}

const verifyAndEnableOtp = async () => {
  if (!otpVerificationCode.value) return
  if (otpSetupData.value == null) return
  isVerifyingOtp.value = true
  try {
    await $fetch('/api/auth/login', {
      method: 'POST',
      body: {
        password: '',
        otpCode: otpVerificationCode.value,
        _isSetupVerification: true,
        _tempSecret: otpSetupData.value.secret
      }
    })
    settingsForm.value.enableOtpAuth = true
    settingsForm.value.otpSecret = otpSetupData.value.secret
    isOtpModalOpen.value = false
    otpVerificationCode.value = ''
    toast.add({ title: t('otp_enabled_success'), color: 'success' })
  } catch {
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
const triggerLogoUpload = () => logoInput.value?.click()
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
  red: '#ef4444', orange: '#f97316', amber: '#f59e0b', yellow: '#eab308',
  lime: '#84cc16', green: '#22c55e', emerald: '#10b981', teal: '#14b8a6',
  cyan: '#06b6d4', sky: '#0ea5e9', blue: '#3b82f6', indigo: '#6366f1',
  violet: '#8b5cf6', purple: '#a855f7', fuchsia: '#d946ef', pink: '#ec4899', rose: '#f43f5e'
}
const colors = Object.keys(colorMap)

const loadSettings = async () => {
  try {
    const res: SettingsGetResponse = await $fetch('/api/internal/settings')
    Object.assign(settingsForm.value, res)
  } catch {
    toast.add({ title: t('settings_load_failed'), color: 'error' })
  }
}

const isSendingTestEmail = ref(false)
const testEmailTo = ref('')

const sendTestEmail = async () => {
  isSendingTestEmail.value = true
  try {
    await $fetch('/api/internal/email-test', {
      method: 'POST',
      body: { to: testEmailTo.value || settingsForm.value.notifyEmailTo }
    })
    toast.add({ title: t('email_test_success'), color: 'success', duration: settingsForm.value.toastTimeout })
  } catch (e: unknown) {
    const message = e instanceof Error && 'data' in e && typeof (e as { data?: { statusMessage?: string } }).data === 'object'
      ? (e as { data?: { statusMessage?: string } }).data?.statusMessage
      : undefined
    toast.add({ title: t('email_test_failed'), description: message, color: 'error', duration: settingsForm.value.toastTimeout })
  } finally {
    isSendingTestEmail.value = false
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
    toast.add({ title: t('settings_saved'), color: 'success', duration: settingsForm.value.toastTimeout })
    if (import.meta.client) {
      const appConfig = useAppConfig()
      appConfig.ui.colors.primary = settingsForm.value.primaryColor
      setTimeout(
        () => {
          window.location.reload()
        }, 500
      )
    }
  } catch {
    toast.add({ title: t('settings_failed'), color: 'error' })
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 flex flex-col pb-10 overflow-x-hidden">
    <!-- Centered Layout Wrapper -->
    <div class="w-full flex-1 flex flex-col items-center">
      <!-- Header -->
      <header class="w-full border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md sticky top-0 z-20">
        <div class="max-w-4xl w-full mx-auto px-6 py-4 flex items-center justify-between">
          <div class="flex items-center gap-4">
            <UButton
              icon="i-lucide-arrow-left"
              variant="ghost"
              color="neutral"
              to="/"
            />
            <h1 class="font-bold text-xl">
              {{ t('server_settings') }}
            </h1>
          </div>
          <UButton
            color="primary"
            size="lg"
            :loading="isSaving"
            @click="saveSettings"
          >
            {{ t('save') }}
          </UButton>
        </div>
      </header>

      <!-- Main content restricted to same max-width -->
      <main class="max-w-4xl w-full px-6 py-8 space-y-8">
        <div
          v-if="!isAuthenticated"
          class="text-center py-20 bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm"
        >
          <UIcon
            name="i-lucide-lock"
            class="w-16 h-16 text-gray-300 mx-auto mb-4"
          />
          <h2 class="text-2xl font-bold">
            {{ t('auth_required') }}
          </h2>
          <p class="text-gray-500 mt-2">
            {{ t('auth_desc') }}
          </p>
          <UButton
            class="mt-6"
            to="/agent"
            size="lg"
          >
            {{ t('admin_dashboard') }}
          </UButton>
        </div>

        <div
          v-else
          class="space-y-8"
        >
          <!-- Branding Section -->
          <UCard>
            <template #header>
              <div class="flex items-center gap-2 text-primary-500">
                <UIcon
                  name="i-lucide-palette"
                  class="w-5 h-5"
                />
                <h2 class="font-bold text-lg">
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
                <div class="flex items-center gap-6">
                  <div
                    v-if="settingsForm.siteLogo"
                    class="w-20 h-20 rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-inner"
                  >
                    <img
                      :src="settingsForm.siteLogo"
                      class="w-full h-full object-cover"
                    >
                  </div>
                  <div
                    v-else
                    class="w-20 h-20 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-800 flex items-center justify-center text-gray-300"
                  >
                    <UIcon
                      name="i-lucide-image"
                      class="w-10 h-10"
                    />
                  </div>
                  <div class="flex-1 space-y-3">
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
                    <p class="text-[10px] text-gray-400 leading-tight">
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
                <div class="flex flex-wrap gap-2.5">
                  <button
                    v-for="color in colors"
                    :key="color"
                    class="w-10 h-10 rounded-full border-2 transition-all active:scale-90"
                    :style="{ backgroundColor: colorMap[color] }"
                    :class="[settingsForm.primaryColor === color ? 'border-black dark:border-white scale-110 shadow-lg ring-4 ring-primary-500/10' : 'border-transparent opacity-80 hover:opacity-100']"
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
                <h2 class="font-bold text-lg">
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
                  class="w-full max-w-xl"
                />
              </UFormField>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4 border-t border-gray-100 dark:border-gray-800">
                <div class="space-y-6">
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
                    />
                  </UFormField>
                  <UFormField
                    :label="t('shutdown_message')"
                    :description="t('shutdown_message_desc')"
                  >
                    <UTextarea
                      v-model="settingsForm.shutdownMessage"
                      :rows="3"
                      autoresize
                    />
                  </UFormField>
                </div>
                <div class="space-y-4 pt-2">
                  <div class="flex items-center justify-between p-4 rounded-2xl bg-gray-50/50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 shadow-sm">
                    <div class="flex flex-col pr-4">
                      <span class="text-sm font-bold">{{ t('show_pending_count') }}</span>
                      <span class="text-[10px] text-gray-400 mt-0.5 leading-tight">{{ t('show_pending_count_desc') }}</span>
                    </div>
                    <USwitch v-model="settingsForm.showPendingCountPublic" />
                  </div>
                  <div class="flex items-center justify-between p-4 rounded-2xl bg-gray-50/50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 shadow-sm">
                    <div class="flex flex-col pr-4">
                      <span class="text-sm font-bold">{{ t('show_api_key_hints') }}</span>
                      <span class="text-[10px] text-gray-400 mt-0.5 leading-tight">{{ t('show_api_key_hints_desc') }}</span>
                    </div>
                    <USwitch v-model="settingsForm.showApiKeyPublic" />
                  </div>
                  <div class="flex items-center justify-between p-4 rounded-2xl bg-gray-50/50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 shadow-sm">
                    <div class="flex flex-col pr-4">
                      <span class="text-sm font-bold">{{ t('show_tokens_public') }}</span>
                      <span class="text-[10px] text-gray-400 mt-0.5 leading-tight">{{ t('show_tokens_public_desc') }}</span>
                    </div>
                    <USwitch v-model="settingsForm.showTokensPublic" />
                  </div>
                  <div class="flex items-center justify-between p-4 rounded-2xl bg-gray-50/50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 shadow-sm">
                    <div class="flex flex-col pr-4">
                      <span class="text-sm font-bold">{{ t('use_header_for_ip') }}</span>
                      <span class="text-[10px] text-gray-400 mt-0.5 leading-tight">{{ t('use_header_for_ip_desc') }}</span>
                    </div>
                    <USwitch v-model="settingsForm.useHeaderForIp" />
                  </div>
                  <UFormField
                    v-if="settingsForm.useHeaderForIp"
                    :label="t('ip_header_name')"
                    :description="t('ip_header_name_desc')"
                    class="p-4"
                  >
                    <UInput
                      v-model="settingsForm.ipHeaderName"
                      placeholder="x-forwarded-for"
                    />
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
                <h2 class="font-bold text-lg">
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
                  class="max-w-xl"
                />
              </UFormField>

              <div class="pt-6 border-t border-gray-100 dark:border-gray-800 space-y-4">
                <div class="flex items-center justify-between p-4 rounded-2xl bg-gray-50/50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 shadow-sm">
                  <div class="space-y-1">
                    <h3 class="text-sm font-bold">
                      {{ t('password_auth') }}
                    </h3>
                    <p class="text-xs text-gray-400">
                      {{ t('enable_password_desc') }}
                    </p>
                  </div>
                  <USwitch v-model="settingsForm.enablePasswordAuth" />
                </div>

                <div class="flex items-center justify-between p-4 rounded-xl bg-gray-50/50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 shadow-sm">
                  <div class="space-y-1 pr-4">
                    <h3 class="text-sm font-bold">
                      {{ t('otp_auth') }}
                    </h3>
                    <p class="text-xs text-gray-400">
                      {{ t('enable_otp_desc') }}
                    </p>
                  </div>
                  <div class="flex items-center gap-3">
                    <UBadge
                      v-if="settingsForm.enableOtpAuth"
                      color="success"
                      variant="subtle"
                      size="sm"
                      class="px-2.5 font-bold uppercase tracking-tighter"
                    >
                      {{ t('enabled') }}
                    </UBadge>
                    <UButton
                      v-if="!settingsForm.enableOtpAuth"
                      size="sm"
                      color="primary"
                      class="px-5 font-bold"
                      @click="openOtpSetup"
                    >
                      {{ t('otp_setup_title') }}
                    </UButton>
                    <UButton
                      v-else
                      size="sm"
                      color="error"
                      variant="soft"
                      class="px-5 font-bold"
                      @click="disableOtp"
                    >
                      {{ t('disable') }}
                    </UButton>
                  </div>
                </div>
              </div>
            </div>
          </UCard>

          <!-- Email Section -->
          <UCard>
            <template #header>
              <div class="flex items-center gap-2 text-primary-500">
                <UIcon
                  name="i-lucide-mail"
                  class="w-5 h-5"
                />
                <h2 class="font-bold text-lg">
                  {{ t('email_integration') }}
                </h2>
              </div>
            </template>
            <div class="space-y-6">
              <div class="p-4 rounded-2xl bg-primary-50 dark:bg-primary-950/30 text-primary-700 dark:text-primary-300 text-sm leading-relaxed border border-primary-100 dark:border-primary-900/50">
                {{ t('email_notify_hint') }}
              </div>

              <div class="flex items-center justify-between p-4 rounded-2xl bg-gray-50/50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 shadow-sm">
                <div class="flex flex-col pr-4">
                  <span class="text-sm font-bold">{{ t('email_notify') }}</span>
                  <span class="text-[10px] text-gray-400 mt-0.5 leading-tight">{{ t('email_notify_desc') }}</span>
                </div>
                <USwitch v-model="settingsForm.enableEmailNotify" />
              </div>
              <UFormField
                v-if="settingsForm.enableEmailNotify"
                :label="t('notify_email_to')"
                :description="t('notify_email_to_desc')"
              >
                <UInput
                  v-model="settingsForm.notifyEmailTo"
                  placeholder="you@example.com"
                  class="w-full max-w-xl"
                />
              </UFormField>

              <div class="pt-6 border-t border-gray-100 dark:border-gray-800 space-y-6">
                <h3 class="text-xs font-black text-gray-400 uppercase tracking-widest">
                  {{ t('smtp_section') }}
                </h3>
                <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <UFormField
                    :label="t('smtp_host')"
                    class="md:col-span-2"
                  >
                    <UInput
                      v-model="settingsForm.smtpHost"
                      placeholder="smtp.qq.com"
                      class="w-full"
                    />
                  </UFormField>
                  <UFormField :label="t('smtp_port')">
                    <UInput
                      v-model="settingsForm.smtpPort"
                      type="number"
                      class="w-full"
                    />
                  </UFormField>
                  <UFormField :label="t('smtp_secure')">
                    <USwitch v-model="settingsForm.smtpSecure" />
                  </UFormField>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <UFormField :label="t('smtp_user')">
                    <UInput
                      v-model="settingsForm.smtpUser"
                      placeholder="you@example.com"
                      class="w-full"
                    />
                  </UFormField>
                  <UFormField
                    :label="t('smtp_pass')"
                    :description="t('smtp_pass_desc')"
                  >
                    <UInput
                      v-model="settingsForm.smtpPass"
                      type="password"
                      icon="i-lucide-key"
                      class="w-full"
                    />
                  </UFormField>
                </div>
                <div class="flex flex-col md:flex-row md:items-end gap-4">
                  <UFormField
                    :label="t('email_test_to')"
                    class="flex-1 w-full"
                  >
                    <UInput
                      v-model="testEmailTo"
                      placeholder="you@example.com"
                      class="w-full"
                    />
                  </UFormField>
                  <UButton
                    :loading="isSendingTestEmail"
                    icon="i-lucide-send"
                    class="md:mb-0.5"
                    @click="sendTestEmail"
                  >
                    {{ t('email_test') }}
                  </UButton>
                </div>
              </div>

              <div class="pt-6 border-t border-gray-100 dark:border-gray-800 space-y-6">
                <div class="flex items-center justify-between p-4 rounded-2xl bg-gray-50/50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 shadow-sm">
                  <div class="flex flex-col pr-4">
                    <span class="text-sm font-bold">{{ t('email_reply') }}</span>
                    <span class="text-[10px] text-gray-400 mt-0.5 leading-tight">{{ t('email_reply_desc') }}</span>
                  </div>
                  <USwitch v-model="settingsForm.enableEmailReply" />
                </div>
                <template v-if="settingsForm.enableEmailReply">
                  <h3 class="text-xs font-black text-gray-400 uppercase tracking-widest">
                    {{ t('imap_section') }}
                  </h3>
                  <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <UFormField
                      :label="t('imap_host')"
                      class="md:col-span-2"
                    >
                      <UInput
                        v-model="settingsForm.imapHost"
                        placeholder="imap.qq.com"
                        class="w-full"
                      />
                    </UFormField>
                    <UFormField :label="t('smtp_port')">
                      <UInput
                        v-model="settingsForm.imapPort"
                        type="number"
                        class="w-full"
                      />
                    </UFormField>
                    <UFormField :label="t('smtp_secure')">
                      <USwitch v-model="settingsForm.imapSecure" />
                    </UFormField>
                  </div>
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <UFormField :label="t('smtp_user')">
                      <UInput
                        v-model="settingsForm.imapUser"
                        placeholder="you@example.com"
                        class="w-full"
                      />
                    </UFormField>
                    <UFormField :label="t('smtp_pass')">
                      <UInput
                        v-model="settingsForm.imapPass"
                        type="password"
                        icon="i-lucide-key"
                        class="w-full"
                      />
                    </UFormField>
                  </div>
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <UFormField :label="t('imap_mailbox')">
                      <UInput
                        v-model="settingsForm.imapMailbox"
                        placeholder="INBOX"
                        class="w-full"
                      />
                    </UFormField>
                    <UFormField :label="t('email_poll_interval')">
                      <UInput
                        v-model="settingsForm.emailPollInterval"
                        type="number"
                        class="w-full"
                      />
                    </UFormField>
                  </div>
                  <UFormField
                    :label="t('email_reply_allow_from')"
                    :description="t('email_reply_allow_from_desc')"
                  >
                    <UInput
                      v-model="settingsForm.emailReplyAllowFrom"
                      placeholder="you@example.com"
                      class="w-full max-w-xl"
                    />
                  </UFormField>
                </template>
              </div>
            </div>
          </UCard>

          <!-- Footer -->
          <footer class="flex flex-col items-center gap-4 pt-4 pb-12 border-t border-gray-100 dark:border-gray-800 text-gray-400">
            <div class="flex items-center gap-4">
              <UButton
                icon="i-simple-icons-github"
                :label="t('github_repo')"
                variant="link"
                color="neutral"
                size="xs"
                to="https://github.com/huangdihd/call_me_as_agent"
                target="_blank"
              />
              <span class="text-xs opacity-50">|</span>
              <span class="text-xs text-center leading-loose">{{ t('released_under') }}</span>
            </div>
          </footer>
        </div>
      </main>
    </div>

    <!-- Modal (ClientOnly) -->
    <ClientOnly>
      <UModal
        v-if="isOtpModalOpen"
        v-model:open="isOtpModalOpen"
      >
        <template #header>
          <div class="w-full flex items-center justify-between">
            <h3 class="text-lg font-black">
              {{ t('otp_setup_title') }}
            </h3>
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-x"
              class="rounded-full"
              @click="isOtpModalOpen = false"
            />
          </div>
        </template>
        <template #body>
          <div class="space-y-8 py-2">
            <div class="p-4 rounded-2xl bg-primary-50 dark:bg-primary-950/30 text-primary-700 dark:text-primary-300 text-sm leading-relaxed border border-primary-100 dark:border-primary-900/50">
              {{ t('otp_setup_step1') }}
            </div>
            <div class="space-y-6">
              <p class="text-xs font-black text-gray-400 uppercase tracking-[0.2em] text-center">
                {{ t('otp_setup_step2') }}
              </p>
              <div class="flex flex-col items-center gap-6">
                <div class="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm ring-8 ring-gray-50 dark:ring-gray-900/50">
                  <img
                    v-if="otpSetupData?.qrCodeDataUrl"
                    :src="otpSetupData.qrCodeDataUrl"
                    class="w-56 h-56"
                    alt="OTP QR Code"
                  >
                </div>
                <div class="w-full bg-gray-50 dark:bg-gray-900 p-5 rounded-2xl border border-gray-100 dark:border-gray-800 space-y-3">
                  <label class="text-[9px] font-black text-gray-400 uppercase tracking-widest block text-center">{{ t('otp_secret_label') }}</label>
                  <code class="text-sm font-mono block text-center text-primary-600 dark:text-primary-400 select-all break-all leading-relaxed">{{ otpSetupData?.secret }}</code>
                </div>
              </div>
            </div>
            <div class="space-y-4 pt-6 border-t border-gray-100 dark:border-gray-800">
              <p class="text-xs font-black text-gray-400 uppercase tracking-[0.2em] text-center">
                {{ t('otp_setup_step3') }}
              </p>
              <UInput
                v-model="otpVerificationCode"
                placeholder="······"
                class="w-full text-center text-4xl font-black tracking-[0.5em] py-3"
                maxlength="6"
                @keyup.enter="verifyAndEnableOtp"
              />
            </div>
          </div>
        </template>
        <template #footer>
          <div class="w-full items-center justify-between">
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
      </UModal>
    </ClientOnly>
  </div>
</template>
