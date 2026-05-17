// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxt/eslint', '@nuxt/ui', '@ant-design-vue/nuxt'],

  devtools: {
    enabled: true
  },

  devtools: {

    '/': { prerender: true }
  },

  css: ['~/assets/css/main.css'],

  ui: {
    fonts: false
  },

  runtimeConfig: {
    adminPassword: process.env.ADMIN_PASSWORD || ''
  },

  compatibilityDate: '2025-01-15',

  nitro: {
    experimental: {
      active: true
    }
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  }
})
