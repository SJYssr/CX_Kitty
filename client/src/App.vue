<template>
  <!-- 顶部负载 + 公告（登录/注册页显示，保持一致） -->
  <div v-if="showTopBar" class="top-container">
    <div class="task-bar">
      系统负载: <span :class="taskCount >= maxTasks ? 'full' : 'ok'">{{ taskCount }}/{{ maxTasks }}</span>
    </div>
    <div class="notice-marquee">
      <span>本项目为公益项目，服务器最大承受为50个任务，答题功能未测试，不知道效果如何，望周知。</span>
    </div>
  </div>

  <router-view v-slot="{ Component }">
    <component :is="Component" :account="account" @login="onLogin" @register="goRegister" @back="goBack" @logout="onLogout" />
  </router-view>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import axios from 'axios'

const router = useRouter()
const route = useRoute()
const account = ref(null)

const taskCount = ref(0)
const maxTasks = ref(100)
let countTimer = null

const showTopBar = computed(() => route.name === 'Login' || route.name === 'Register')

const SESSION_DURATION = 30 * 60 * 1000

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
  account.value = data
  try {
    const { data: cfg } = await axios.get('/api/account/config', { params: { phone: data.phone } })
    if (cfg.success && cfg.config) {
      account.value = { ...data, ...cfg.config }
    }
  } catch (e) {
    console.warn('加载服务端配置失败:', e?.message || e)
  }
  localStorage.setItem('cx_account', JSON.stringify({
    ...account.value,
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
  localStorage.removeItem('cx_account')
  router.push('/login')
}

onMounted(() => {
  fetchTaskCount()
  countTimer = setInterval(fetchTaskCount, 1000)
  const saved = localStorage.getItem('cx_account')
  if (saved) {
    try {
      const parsed = JSON.parse(saved)
      if (!parsed.password || (parsed._expiresAt && Date.now() > parsed._expiresAt)) {
        localStorage.removeItem('cx_account')
        router.push('/login')
        return
      }
      account.value = parsed
      router.push('/dashboard')
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
