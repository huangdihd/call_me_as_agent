<script setup lang="ts">
const isAuthenticated = ref(true)

const checkAuth = async () => {
  const res: any = await $fetch('/api/auth/check')
  isAuthenticated.value = res.authenticated
}

const settingsForm = ref({
  enableApiKeyAuth: false,
  apiKey: ''
})

const isSaving = ref(false)
const toast = useToast()
const router = useRouter()

const loadSettings = async () => {
  try {
    const res: any = await $fetch('/api/internal/settings')
    settingsForm.value.enableApiKeyAuth = res.enableApiKeyAuth
    settingsForm.value.apiKey = res.apiKey
  } catch (e) {
    toast.add({ title: 'Failed to load settings', color: 'error' })
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
    toast.add({ title: 'Settings saved successfully', color: 'success' })
    router.push('/')
  } catch (e) {
    toast.add({ title: 'Failed to save settings', color: 'error' })
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <div class="h-screen w-full bg-gray-50 dark:bg-gray-950 flex flex-col">
    <!-- Header -->
    <header class="p-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex items-center gap-4">
      <UButton
        icon="i-lucide-arrow-left"
        variant="ghost"
        color="neutral"
        to="/"
      />
      <h1 class="font-bold text-lg">
        Server Settings
      </h1>
    </header>

    <!-- Main Content -->
    <main class="flex-1 overflow-y-auto p-6 flex justify-center">
      <div
        v-if="!isAuthenticated"
        class="text-center mt-20"
      >
        <UIcon
          name="i-lucide-lock"
          class="w-12 h-12 text-gray-400 mx-auto mb-4"
        />
        <h2 class="text-xl font-bold">
          Authentication Required
        </h2>
        <p class="text-gray-500 mt-2">
          Please log in from the main page first.
        </p>
        <UButton
          class="mt-4"
          to="/"
        >
          Go to Dashboard
        </UButton>
      </div>

      <div
        v-else
        class="w-full max-w-2xl space-y-6"
      >
        <UCard>
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon
                name="i-lucide-shield"
                class="text-primary-500 w-5 h-5"
              />
              <h2 class="font-bold text-lg">
                Security & Authentication
              </h2>
            </div>
            <p class="text-sm text-gray-500 mt-1">
              Configure how clients connect to your local LLM endpoints.
            </p>
          </template>

          <div class="space-y-6 p-2">
            <UFormField
              label="Enable API Key Auth"
              description="Require clients to provide an API key to access OpenAI and Claude endpoints."
            >
              <USwitch v-model="settingsForm.enableApiKeyAuth" />
            </UFormField>

            <UFormField
              v-if="settingsForm.enableApiKeyAuth"
              label="Expected API Key"
              description="Clients must send this exact key in their headers."
            >
              <UInput
                v-model="settingsForm.apiKey"
                type="password"
                icon="i-lucide-key"
                placeholder="sk-human-agent"
              />
            </UFormField>
          </div>

          <template #footer>
            <div class="flex justify-end gap-3">
              <UButton
                color="neutral"
                variant="ghost"
                to="/"
              >
                Cancel
              </UButton>
              <UButton
                color="primary"
                :loading="isSaving"
                @click="saveSettings"
              >
                Save Settings
              </UButton>
            </div>
          </template>
        </UCard>
      </div>
    </main>
  </div>
</template>
