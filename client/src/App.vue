<template>
  <Login v-if="page === 'login'" @login="onLogin" />
  <Dashboard v-else :account="account" @logout="onLogout" />
</template>

<script setup>
import { ref, onMounted } from 'vue'
import axios from 'axios'
import Login from './views/Login.vue'
import Dashboard from './views/Dashboard.vue'

const page = ref('login')
const account = ref(null)

async function onLogin(data) {
  account.value = data
  localStorage.setItem('cx_account', JSON.stringify(data))
  try {
    const { data: cfg } = await axios.get('/api/account/config', { params: { phone: data.phone } })
    if (cfg.success && cfg.config?.deepseek_api_key) {
      account.value = { ...data, ...cfg.config }
      localStorage.setItem('cx_account', JSON.stringify(account.value))
    }
  } catch {}
  page.value = 'dashboard'
}

function onLogout() {
  account.value = null
  localStorage.removeItem('cx_account')
  page.value = 'login'
}

onMounted(() => {
  const saved = localStorage.getItem('cx_account')
  if (saved) {
    try {
      account.value = JSON.parse(saved)
      page.value = 'dashboard'
    } catch { localStorage.removeItem('cx_account') }
  }
})
</script>

<style>
html, body { margin: 0; padding: 0; height: 100%; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
* { margin: 0; padding: 0; box-sizing: border-box; }
#app { height: 100%; }
</style>
