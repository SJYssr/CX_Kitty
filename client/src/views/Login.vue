<template>
  <div class="login-page">
    <div class="task-bar">
      系统负载: <span :class="taskCount >= 100 ? 'full' : 'ok'">{{ taskCount }}/{{ maxTasks }}</span>
    </div>

    <div class="notice-marquee">
      <span>本项目为公益项目，服务器最大承受为50个任务，答题功能未测试，不知道效果如何，望周知。</span>
    </div>

    <div class="card">
      
      <h1>CX_Kitty</h1>
      <p class="desc">超星学习通自动刷课</p>

      <div v-if="taskCount >= 100" class="full-warning">
        ⚠️ 服务器已满({{ taskCount }}/{{ maxTasks }})，请稍后再试
      </div>

      <el-form ref="formRef" :model="form" :rules="rules" @keyup.enter="handleLogin">
        <el-input v-model="form.phone" placeholder="学习通手机号" size="large" style="margin-bottom: 16px;">
          <template #prefix><el-icon><Phone /></el-icon></template>
        </el-input>
        <el-input v-model="form.password" type="password" placeholder="学习通密码" size="large" show-password style="margin-bottom: 20px;">
          <template #prefix><el-icon><Lock /></el-icon></template>
        </el-input>
        <el-button type="primary" size="large" :loading="loading" :disabled="taskCount >= 100" style="width: 100%" @click="handleLogin">
          {{ loading ? '登录中...' : taskCount >= 100 ? '服务器已满' : '登 录' }}
        </el-button>
      </el-form>

      <p v-if="error" class="error">{{ error }}</p>
    </div>
    <div class="copyright">SJYssr 2025-2026 豫ICP备2024069806号-4</div>
    <div class="disclaimer">
      该项目如果对您造成不良后果，需要您个人承担<br>
      一切解释权归SJYssr所有
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { Phone, Lock } from '@element-plus/icons-vue'
import axios from 'axios'

const emit = defineEmits(['login'])
const formRef = ref(null)
const loading = ref(false)
const error = ref('')
const taskCount = ref(0)
const maxTasks = ref(100)
let countTimer = null

const form = ref({ phone: '', password: '' })
const rules = {
  phone: [{ required: true, message: '请输入手机号', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
}

async function fetchTaskCount() {
  try {
    const { data } = await axios.get('/api/system/task-count')
    if (data.success) {
      taskCount.value = data.count
      maxTasks.value = data.max || 100
    }
  } catch {}
}

async function handleLogin() {
  if (taskCount.value >= 100) { error.value = '服务器已满，请稍后再试'; return }
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  loading.value = true
  error.value = ''
  try {
    const { data } = await axios.post('/api/login', form.value)
    if (!data.success) { error.value = data.message || '超星登录失败'; return }
    await axios.post('/api/account/save', form.value).catch(() => {})
    axios.post('/api/account/info', form.value).catch(() => {})
    emit('login', { phone: form.value.phone, password: form.value.password })
  } catch { error.value = '无法连接服务器' }
  finally { loading.value = false }
}

onMounted(() => { fetchTaskCount(); countTimer = setInterval(fetchTaskCount, 1000) })
onUnmounted(() => { if (countTimer) clearInterval(countTimer) })
</script>

<style scoped>
.login-page {
  display: flex; justify-content: center; align-items: center;
  min-height: 100vh;
  padding: 20px;
  position: relative;
}
.login-page::before {
  content: "";
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: url('/bg.jpg') center/cover no-repeat fixed;
  filter: blur(8px);
  z-index: -1;
}
.login-page::after {
  content: "";
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.4);
  z-index: -1;
}
.task-bar {
  position: fixed; top: 0; left: 0; right: 0;
  background: rgba(0,0,0,0.5); color: #fff;
  text-align: center; padding: 6px; font-size: 13px;
  z-index: 100; backdrop-filter: blur(8px);
}
.task-bar .ok { color: #67c23a; }
.task-bar .full { color: #f56c6c; }
.full-warning {
  background: rgba(254,240,240,0.9); color: #f56c6c;
  padding: 10px 16px; border-radius: 8px;
  font-size: 13px; margin-bottom: 16px;
}
.card {
  background: rgba(255,255,255,0.15);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-radius: 20px;
  padding: 40px;
  width: 100%; max-width: 400px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.2), 0 0 0 1px rgba(255,255,255,0.1);
  text-align: center;
  border: 1px solid rgba(255,255,255,0.2);
}
.logo { font-size: 56px; margin-bottom: 8px; }
h1 { font-size: 24px; color: #fff; margin-bottom: 4px; }
.desc { color: #909399; font-size: 14px; margin-bottom: 32px; }
.desc { color: rgba(255,255,255,0.7); font-size: 14px; margin-bottom: 32px; }
.error { color: #f56c6c; font-size: 13px; margin-top: 12px; }
.copyright {
  position: fixed; bottom: 50px; left: 0; right: 0;
  text-align: center; font-size: 13px; color: rgba(255,255,255,0.4);
}

.disclaimer {
  position: fixed; bottom: 10px; left: 0; right: 0;
  text-align: center; font-size: 11px; color: rgba(255,255,255,0.25);
  line-height: 1.6;
}

.notice-marquee {
  position: fixed; top: 28px; left: 0; right: 0;
  background: rgba(0,0,0,0.35); color: #e6a23c;
  text-align: center;
  padding: 6px 0;
  font-size: 14px;
  z-index: 100;
  backdrop-filter: blur(8px);
  overflow: hidden;
  white-space: nowrap;
}
.notice-marquee span {
  display: inline-block;
  animation: marquee 20s linear infinite;
}
@keyframes marquee {
  0% { transform: translateX(100%); }
  100% { transform: translateX(-100%); }
}
</style>
