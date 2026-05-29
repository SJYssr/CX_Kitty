<template>
  <!-- 顶部负载 + 公告（登录/注册页显示，保持一致） -->
  <div v-if="showTopBar" class="top-container">
    <div class="task-bar">
      系统负载: <span :class="taskCount >= maxTasks ? 'full' : 'ok'">{{ taskCount }}/{{ maxTasks }}</span>
    </div>
    <div class="notice-marquee">
      <span>{{ announcement }}</span>
    </div>
  </div>

  <router-view v-slot="{ Component }">
    <component :is="Component" :account="account" @login="onLogin" @register="goRegister" @back="goBack" @logout="onLogout" />
  </router-view>
</template>

<script setup>
import { ref, computed, provide, onMounted, onUnmounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import axios from 'axios'

const router = useRouter()
const route = useRoute()
const account = ref(null)
const sessionToken = ref('')

const taskCount = ref(0)
const maxTasks = ref(50)
const announcement = ref('')
provide('taskCount', taskCount)
provide('maxTasks', maxTasks)
let countTimer = null

const showTopBar = computed(() => route.name === 'Login' || route.name === 'Register')

const SESSION_DURATION = 30 * 60 * 1000

// axios 拦截器：自动附加 token，401 → 退出登录
axios.interceptors.request.use(config => {
  if (sessionToken.value) {
    config.headers.Authorization = 'Bearer ' + sessionToken.value
  }
  return config
})
axios.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      sessionToken.value = ''
      account.value = null
      localStorage.removeItem('cx_account')
      if (route.name !== 'Login' && route.name !== 'Register') {
        router.push('/login')
      }
    }
    return Promise.reject(err)
  }
)

async function fetchAnnouncement() {
  try {
    const { data } = await axios.get('/api/system/announcement')
    if (data.success) announcement.value = data.text
  } catch (e) { console.warn('fetchAnnouncement:', e?.message) }
}

async function fetchTaskCount() {
  try {
    const { data } = await axios.get('/api/system/task-count')
    if (data.success) {
      taskCount.value = data.count
      maxTasks.value = data.max || 50
    }
  } catch (e) { console.warn('fetchTaskCount:', e?.message) }
}

async function onLogin(data) {
  account.value = { phone: data.phone, password: data.password }
  sessionToken.value = data.token
  try {
    const { data: cfg } = await axios.get('/api/account/config')
    if (cfg.success && cfg.config) {
      account.value = { ...account.value, ...cfg.config }
    }
  } catch (e) {
    console.warn('加载服务端配置失败:', e?.message || e)
  }
  localStorage.setItem('cx_account', JSON.stringify({
    phone: data.phone,
    password: data.password,
    token: data.token,
    _expiresAt: Date.now() + SESSION_DURATION
  }))
  router.push('/dashboard')
}

function goRegister() {
  router.push('/register')
}

function goBack() {
  router.push('/login')
}

function onLogout() {
  account.value = null
  sessionToken.value = ''
  localStorage.removeItem('cx_account')
  router.push('/login')
}

onMounted(() => {
  fetchTaskCount()
  fetchAnnouncement()
  countTimer = setInterval(fetchTaskCount, 1000)
  const saved = localStorage.getItem('cx_account')
  if (saved) {
    try {
      const parsed = JSON.parse(saved)
      if (!parsed.password || !parsed.token || (parsed._expiresAt && Date.now() > parsed._expiresAt)) {
        localStorage.removeItem('cx_account')
        router.push('/login')
        return
      }
      sessionToken.value = parsed.token
      account.value = parsed
      if (route.name !== 'Dashboard' && route.name !== 'AdminLogin' && route.name !== 'AdminDashboard') router.push('/dashboard')
      // 异步验证 token 有效性（检测是否被顶号），失败则踢回登录
      axios.get('/api/auth/verify').then(({ data }) => {
        if (!data.success) {
          // token 已失效 → 被顶号
          localStorage.removeItem('cx_account')
          sessionToken.value = ''
          account.value = null
          router.push('/login')
          return
        }
        // 刷新服务端配置（含姓名等）
        axios.get('/api/account/config').then(({ data: cfg }) => {
          if (cfg.success && cfg.config) {
            account.value = { ...account.value, ...cfg.config }
          }
        }).catch(() => {})
      }).catch(() => {
        localStorage.removeItem('cx_account')
        account.value = null
        router.push('/login')
      })
    } catch (e) {
      console.warn('解析 localStorage 失败:', e?.message || e)
      localStorage.removeItem('cx_account')
    }
  }
})

onUnmounted(() => {
  if (countTimer) clearInterval(countTimer)
})
</script>

<style>
.task-bar {
  position: fixed; top: 0; left: 0; right: 0;
  background: rgba(0,0,0,0.5); color: #fff;
  text-align: center; padding: 6px; font-size: 13px;
  z-index: 100; backdrop-filter: blur(8px);
}
.task-bar .ok { color: #67c23a; }
.task-bar .full { color: #f56c6c; }
.notice-marquee {
  position: fixed; top: 28px; left: 0; right: 0;
  background: rgba(0,0,0,0.35); color: #e6a23c;
  text-align: left; padding: 6px 0;
  font-size: 14px; z-index: 100;
  backdrop-filter: blur(8px);
  overflow: hidden; white-space: nowrap;
}
.notice-marquee span {
  display: inline-block;
  animation: marquee 20s linear infinite;
}
@keyframes marquee {
  0% { transform: translateX(100vw); }
  100% { transform: translateX(-100%); }
}
.top-container { position: fixed; top: 0; left: 0; right: 0; z-index: 100; }
html, body { margin: 0; padding: 0; height: 100%; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
* { margin: 0; padding: 0; box-sizing: border-box; }
#app { height: 100%; }
</style>
