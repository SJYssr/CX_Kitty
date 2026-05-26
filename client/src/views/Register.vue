<template>
  <div class="login-page">
    <div class="card">
      <h1>注册</h1>


      <el-form ref="registerRef" :model="form" :rules="rules" @keyup.enter="handleRegister">
        <el-input v-model="form.phone" placeholder="学习通手机号" size="large" style="margin-bottom: 16px;">
          <template #prefix><el-icon><Phone /></el-icon></template>
        </el-input>
        <el-input v-model="form.password" type="password" placeholder="学习通密码" size="large" show-password style="margin-bottom: 16px;">
          <template #prefix><el-icon><Lock /></el-icon></template>
        </el-input>
        <el-input v-model="form.email" placeholder="邮箱" size="large" style="margin-bottom: 16px;">
          <template #prefix><el-icon><Message /></el-icon></template>
        </el-input>
        <div style="display:flex;gap:8px;margin-bottom: 20px;">
          <el-input v-model="form.code" placeholder="验证码" size="large" style="flex:1">
            <template #prefix><el-icon><Key /></el-icon></template>
          </el-input>
          <el-button size="large" style="flex-shrink:0;width:120px" :disabled="codeSending || codeCountdown > 0" @click="sendCode">
            {{ codeCountdown > 0 ? codeCountdown + 's' : codeSending ? '发送中...' : '获取验证码' }}
          </el-button>
        </div>
        <el-button type="primary" size="large" :loading="registering" style="width: 100%" @click="handleRegister">
          {{ registering ? '注册中...' : '注 册' }}
        </el-button>
      </el-form>

      <div class="back-link" @click="$emit('back')">返回登录</div>
    </div>
    <div class="copyright">SJYssr 2025-2026 豫ICP备2024069806号-4</div>
    <div class="disclaimer">
      该项目如果对您造成不良后果，需要您个人承担<br>
      一切解释权归SJYssr所有
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Phone, Lock, Message, Key } from '@element-plus/icons-vue'
import axios from 'axios'

defineEmits(['back'])
const registerRef = ref(null)
const registering = ref(false)
const codeSending = ref(false)
const codeCountdown = ref(0)
let codeTimer = null

const form = ref({ phone: '', password: '', email: '', code: '' })
const rules = {
  phone: [{ required: true, message: '请输入手机号', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '邮箱格式不正确', trigger: 'blur' }
  ],
  code: [{ required: true, message: '请输入验证码', trigger: 'blur' }]
}

async function sendCode() {
  if (!form.value.email) { ElMessage.warning('请先填写邮箱'); return }
  codeSending.value = true
  try {
    const { data } = await axios.post('/api/send-verify-code', { email: form.value.email })
    if (!data.success) { ElMessage.error(data.message); return }
    ElMessage.success('验证码已发送')
    codeCountdown.value = 60
    if (codeTimer) clearInterval(codeTimer)
    codeTimer = setInterval(() => {
      codeCountdown.value--
      if (codeCountdown.value <= 0) { clearInterval(codeTimer); codeTimer = null }
    }, 1000)
  } catch { ElMessage.error('发送失败') }
  finally { codeSending.value = false }
}

async function handleRegister() {
  if (registering.value) return
  const valid = await registerRef.value.validate().catch(() => false)
  if (!valid) return
  registering.value = true
  try {
    const { data } = await axios.post('/api/register', {
      phone: form.value.phone,
      password: form.value.password,
      email: form.value.email,
      code: form.value.code
    })
    if (!data.success) { ElMessage.error(data.message); return }
    ElMessage.success('注册成功！')
    form.value.phone = ''
    form.value.password = ''
    form.value.email = ''
    form.value.code = ''
    emit('back')
  } catch { ElMessage.error('注册失败') }
  finally { registering.value = false }
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
.desc { color: rgba(255,255,255,0.7); font-size: 14px; margin-bottom: 28px; }
.back-link {
  position: absolute; bottom: 14px; right: 24px;
  color: rgba(255,255,255,0.5); font-size: 13px; cursor: pointer;
  transition: color 0.2s;
}
.back-link:hover { color: #409EFF; }
.copyright {
  position: fixed; bottom: 50px; left: 0; right: 0;
  text-align: center; font-size: 13px; color: rgba(255,255,255,0.4);
}
.disclaimer {
  position: fixed; bottom: 10px; left: 0; right: 0;
  text-align: center; font-size: 11px; color: rgba(255,255,255,0.25);
  line-height: 1.6;
}
</style>
