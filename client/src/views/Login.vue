<template>
  <div class="login-page">
    <div class="task-bar">
      系统负载: <span :class="taskCount >= 100 ? 'full' : 'ok'">{{ taskCount }}/{{ maxTasks }}</span>
    </div>

    <div class="card">
      <div class="logo">🐱</div>
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
    const { data } = await axios.post('/api/courses', form.value)
    if (!data.success) { error.value = data.message || '超星登录失败'; return }
    await axios.post('/api/account/save', form.value).catch(() => {})
    emit('login', { phone: form.value.phone, password: form.value.password })
  } catch { error.value = '无法连接服务器' }
  finally { loading.value = false }
}

onMounted(() => { fetchTaskCount(); countTimer = setInterval(fetchTaskCount, 5000) })
onUnmounted(() => { if (countTimer) clearInterval(countTimer) })
</script>

<style scoped>
.login-page {
  display: flex; justify-content: center; align-items: center;
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 20px;
}
.task-bar {
  position: fixed; top: 0; left: 0; right: 0;
  background: rgba(0,0,0,0.6); color: #fff;
  text-align: center; padding: 6px; font-size: 13px;
  z-index: 100; backdrop-filter: blur(4px);
}
.task-bar .ok { color: #67c23a; }
.task-bar .full { color: #f56c6c; }
.full-warning {
  background: #fef0f0; color: #f56c6c;
  padding: 10px 16px; border-radius: 8px;
  font-size: 13px; margin-bottom: 16px;
}
.card {
  background: #fff; border-radius: 16px; padding: 40px;
  width: 100%; max-width: 400px; box-shadow: 0 20px 60px rgba(0,0,0,0.15);
  text-align: center;
}
.logo { font-size: 56px; margin-bottom: 8px; }
h1 { font-size: 24px; color: #303133; margin-bottom: 4px; }
.desc { color: #909399; font-size: 14px; margin-bottom: 32px; }
.error { color: #f56c6c; font-size: 13px; margin-top: 12px; }
</style>
