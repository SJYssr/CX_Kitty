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
        <el-input v-model="form.password" type="password" placeholder="学习通密码" size="large" show-password style="margin-bottom: 16px;">
          <template #prefix><el-icon><Lock /></el-icon></template>
        </el-input>

        <!-- 图形验证码 -->
        <div class="captcha-row">
          <el-input v-model="form.captchaCode" placeholder="验证码" size="large" style="flex:1" @keyup.enter="handleLogin">
            <template #prefix><el-icon><Key /></el-icon></template>
          </el-input>
          <div class="captcha-img" @click="loadCaptcha" v-html="captchaSvg" title="点击刷新验证码"></div>
        </div>

        <el-button type="primary" size="large" :loading="loading" :disabled="taskCount >= maxTasks" style="width: 100%;margin-top:8px" @click="handleLogin">
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
import { ref, inject, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Phone, Lock, Key } from '@element-plus/icons-vue'
import axios from 'axios'

defineEmits(['login', 'register'])
const taskCount = inject('taskCount', ref(0))
const maxTasks = inject('maxTasks', ref(50))
const formRef = ref(null)
const loading = ref(false)
const form = ref({ phone: '', password: '', captchaCode: '', captchaToken: '' })
const captchaSvg = ref('')
const rules = {
  phone: [{ required: true, message: '请输入手机号', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
  captchaCode: [{ required: true, message: '请输入验证码', trigger: 'blur' }]
}

async function loadCaptcha() {
  try {
    const { data } = await axios.get('/api/captcha')
    if (data.success) {
      captchaSvg.value = data.svg
      form.value.captchaToken = data.token
      form.value.captchaCode = ''
    }
  } catch (e) {
    console.warn('loadCaptcha:', e?.message)
  }
}

async function handleLogin() {
  if (taskCount.value >= maxTasks.value) { ElMessage.warning('服务器已满，请稍后再试'); return }
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  loading.value = true
  try {
    const { data } = await axios.post('/api/login', {
      phone: form.value.phone,
      password: form.value.password,
      captchaToken: form.value.captchaToken,
      captchaCode: form.value.captchaCode
    })
    if (!data.success) {
      ElMessage.error(data.message || '登录失败')
      loadCaptcha()
      return
    }
    emit('login', { phone: form.value.phone, password: form.value.password })
  } catch (e) {
    console.error('登录请求失败:', e?.message || e, e?.response?.status, e?.response?.data)
    ElMessage.error('无法连接服务器')
    loadCaptcha()
  }
  finally { loading.value = false }
}

onMounted(() => {
  loadCaptcha()
})
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
.captcha-row {
  display: flex; gap: 10px; align-items: center;
  margin-bottom: 16px;
}
.captcha-img {
  flex-shrink: 0;
  width: 110px; height: 40px;
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  background: rgba(255,255,255,0.9);
  display: flex; align-items: center; justify-content: center;
  border: 1px solid rgba(255,255,255,0.3);
}
.captcha-img :deep(svg) {
  width: 100%; height: 100%;
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
