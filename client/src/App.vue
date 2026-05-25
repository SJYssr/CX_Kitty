<template>
  <!-- 登录页 -->
  <Login v-if="page === 'login'" @login="onLogin" />

  <!-- 配置页 -->
  <Config
    v-else-if="page === 'config'"
    :account="account"
    @enter="onConfigDone"
  />

  <!-- 刷课面板 -->
  <Dashboard
    v-else-if="page === 'dashboard'"
    :account="account"
    @logout="onLogout"
    @config="page = 'config'"
  />
</template>

<script setup>
import { ref, onMounted } from 'vue'
import axios from 'axios'
import Login from './views/Login.vue'
import Config from './views/Config.vue'
import Dashboard from './views/Dashboard.vue'

const page = ref('login')
const account = ref(null)

async function onLogin(data) {
  account.value = data
  localStorage.setItem('cx_account', JSON.stringify(data))
  // Check if account already has config saved on server
  try {
    const { data: cfg } = await axios.get('/api/account/config', { params: { phone: data.phone } })
    if (cfg.success && cfg.config?.deepseek_api_key) {
      account.value = { ...data, ...cfg.config }
      localStorage.setItem('cx_account', JSON.stringify(account.value))
      page.value = 'dashboard'
      return
    }
  } catch {}
  page.value = 'config'
}

function onConfigDone(configData) {
  // 合并配置到 account
  account.value = { ...account.value, ...configData }
  localStorage.setItem('cx_account', JSON.stringify(account.value))
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
