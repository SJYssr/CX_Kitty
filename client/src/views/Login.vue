<template>
  <div class="login-page">
<div class="card">
      
      <h1>CX_Kitty</h1>
      <p class="desc">超星自助刷课平台</p>

      <div v-if="taskCount >= maxTasks" class="full-warning">
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
          {{ loading ? '登录中...' : taskCount >= maxTasks ? '服务器已满' : '登 录' }}
        </el-button>
      </el-form>

      <div class="register-link" @click="$emit('register')">注册</div>
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
import { ElMessage } from 'element-plus'
import { Phone, Lock } from '@element-plus/icons-vue'
import axios from 'axios'

defineEmits(['login', 'register'])
const formRef = ref(null)
const loading = ref(false)
const form = ref({ phone: '', password: '' })
const rules = {
  phone: [{ required: true, message: '请输入手机号', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
}

async function handleLogin() {
  if (taskCount.value >= maxTasks.value) { ElMessage.warning('服务器已满，请稍后再试'); return }
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  loading.value = true
  try {
    const { data } = await axios.post('/api/login', form.value)
    if (!data.success) { ElMessage.error(data.message || '超星登录失败'); return }
    await axios.post('/api/account/save', form.value).catch(() => {})
    const info = await axios.post('/api/account/info', form.value).catch(() => ({ data: {} }))
    emit('login', { phone: form.value.phone, password: form.value.password, name: info?.data?.info?.name || '' })
  } catch { ElMessage.error('无法连接服务器') }
  finally { loading.value = false }
}
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
}.full-warning {
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
  position: relative;
}
h1 { font-size: 24px; color: #fff; margin-bottom: 4px; font-weight: 700; }
.desc { color: rgba(255,255,255,0.7); font-size: 14px; margin-bottom: 32px; }
.register-link {
  position: absolute; bottom: 14px; right: 24px;
  color: rgba(255,255,255,0.5); font-size: 13px; cursor: pointer;
  transition: color 0.2s;
}
.register-link:hover { color: #409EFF; }
.copyright {
  position: fixed; bottom: 50px; left: 0; right: 0;
  text-align: center; font-size: 13px; color: rgba(255,255,255,0.4);
}
.disclaimer {
  position: fixed; bottom: 10px; left: 0; right: 0;
  text-align: center; font-size: 11px; color: rgba(255,255,255,0.25);
  line-height: 1.6;
}</style>
