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

const SESSION_DURATION = 30 * 60 * 1000; // 30 分钟

async function onLogin(data) {
  account.value = data
  // 登录后从服务端加载配置（答题开关等）
  try {
    const { data: cfg } = await axios.get('/api/account/config', { params: { phone: data.phone } })
    if (cfg.success && cfg.config) {
      account.value = { ...data, ...cfg.config }
    }
  } catch {}
  // 存到 localStorage，带过期时间
  localStorage.setItem('cx_account', JSON.stringify({
    ...account.value,
    _expiresAt: Date.now() + SESSION_DURATION
  }))
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
      const parsed = JSON.parse(saved)
      // 检查是否过期
      if (!parsed.password || (parsed._expiresAt && Date.now() > parsed._expiresAt)) {
        localStorage.removeItem('cx_account')
        page.value = 'login'
        return
      }
      account.value = parsed
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
