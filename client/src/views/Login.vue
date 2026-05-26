<template>
  <div class="login-page">
    <div class="task-bar">
      系统负载: <span :class="taskCount >= maxTasks ? 'full' : 'ok'">{{ taskCount }}/{{ maxTasks }}</span>
    </div>

    <div class="notice-marquee">
      <span>本项目为公益项目，服务器最大承受为50个任务，答题功能未测试，不知道效果如何，望周知。</span>
    </div>

    <div class="card">
      
      <h1>CX_Kitty</h1>
      <p class="desc">超星自助刷课平台</p>

      <div v-if="taskCount >= maxTasks" class="full-warning">
        ⚠️ 服务器已满({{ taskCount }}/{{ maxTasks }})，请稍后再试
      </div>

      <!-- 登录 / 注册 切换 -->
      <div class="tab-bar">
        <span :class="{ active: mode === 'login' }" @click="mode = 'login'">登录</span>
        <span :class="{ active: mode === 'register' }" @click="mode = 'register'">注册</span>
      </div>

      <!-- 登录表单 -->
      <el-form v-if="mode === 'login'" ref="formRef" :model="form" :rules="rules" @keyup.enter="handleLogin">
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

      <!-- 注册表单 -->
      <el-form v-else ref="registerRef" :model="registerForm" :rules="registerRules" @keyup.enter="handleRegister">
        <el-input v-model="registerForm.phone" placeholder="学习通手机号" size="large" style="margin-bottom: 16px;">
          <template #prefix><el-icon><Phone /></el-icon></template>
        </el-input>
        <el-input v-model="registerForm.password" type="password" placeholder="学习通密码" size="large" show-password style="margin-bottom: 16px;">
          <template #prefix><el-icon><Lock /></el-icon></template>
        </el-input>
        <el-input v-model="registerForm.email" placeholder="邮箱" size="large" style="margin-bottom: 16px;">
          <template #prefix><el-icon><Message /></el-icon></template>
        </el-input>
        <div style="display:flex;gap:8px;margin-bottom: 20px;">
          <el-input v-model="registerForm.code" placeholder="验证码" size="large" style="flex:1">
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
import { Phone, Lock, Message, Key } from '@element-plus/icons-vue'
import axios from 'axios'

const emit = defineEmits(['login'])
const formRef = ref(null)
const registerRef = ref(null)
const loading = ref(false)
const taskCount = ref(0)
const maxTasks = ref(100)
let countTimer = null

// 登录表单
const form = ref({ phone: '', password: '' })
const rules = {
  phone: [{ required: true, message: '请输入手机号', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
}

// 注册表单
const mode = ref('login')
const registering = ref(false)
const codeSending = ref(false)
const codeCountdown = ref(0)
let codeTimer = null

const registerForm = ref({ phone: '', password: '', email: '', code: '' })
const registerRules = {
  phone: [{ required: true, message: '请输入手机号', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '邮箱格式不正确', trigger: 'blur' }
  ],
  code: [{ required: true, message: '请输入验证码', trigger: 'blur' }]
}

async function fetchTaskCount() {
  try {
    const { data } = await axios.get('/api/system/task-count')
    if (data.success) {
      taskCount.value = data.count
      maxTasks.value = data.max || 50
    }
  } catch (e) { console.warn("fetchTaskCount:", e?.message) }
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

async function sendCode() {
  if (!registerForm.value.email) { ElMessage.warning('请先填写邮箱'); return }
  codeSending.value = true
  try {
    const { data } = await axios.post('/api/send-verify-code', { email: registerForm.value.email })
    if (!data.success) { ElMessage.error(data.message); return }
    ElMessage.success('验证码已发送')
    codeCountdown.value = 60
    if (codeTimer) clearInterval(codeTimer)
    codeTimer = setInterval(() => {
      codeCountdown.value--
      if (codeCountdown.value <= 0) {
        clearInterval(codeTimer)
        codeTimer = null
      }
    }, 1000)
  } catch { ElMessage.error('发送失败') }
  finally { codeSending.value = false }
}

async function handleRegister() {
  const valid = await registerRef.value.validate().catch(() => false)
  if (!valid) return
  registering.value = true
  try {
    const { data } = await axios.post('/api/register', {
      phone: registerForm.value.phone,
      email: registerForm.value.email,
      code: registerForm.value.code
    })
    if (!data.success) { ElMessage.error(data.message); return }
    ElMessage.success('注册成功！请登录')
    // 切回登录并回填手机号
    form.value.phone = registerForm.value.phone
    mode.value = 'login'
  } catch { ElMessage.error('注册失败') }
  finally { registering.value = false }
}

onMounted(() => { fetchTaskCount(); countTimer = setInterval(fetchTaskCount, 1000) })
onUnmounted(() => {
  if (countTimer) clearInterval(countTimer)
  if (codeTimer) clearInterval(codeTimer)
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
h1 { font-size: 24px; color: #fff; margin-bottom: 4px; font-weight: 700; }
.desc { color: #909399; font-size: 14px; margin-bottom: 32px; }
.desc { color: rgba(255,255,255,0.7); font-size: 14px; margin-bottom: 32px; }
.copyright {
  position: fixed; bottom: 50px; left: 0; right: 0;
  text-align: center; font-size: 13px; color: rgba(255,255,255,0.4);
}

.disclaimer {
  position: fixed; bottom: 10px; left: 0; right: 0;
  text-align: center; font-size: 11px; color: rgba(255,255,255,0.25);
  line-height: 1.6;
}

.tab-bar {
  display: flex; gap: 0; margin-bottom: 24px; border-radius: 8px;
  overflow: hidden; border: 1px solid rgba(255,255,255,0.2);
}
.tab-bar span {
  flex: 1; padding: 8px 0; cursor: pointer; font-size: 14px;
  color: rgba(255,255,255,0.6); background: rgba(255,255,255,0.05);
  transition: all 0.2s; user-select: none;
}
.tab-bar span.active {
  color: #fff; background: rgba(255,255,255,0.15);
  font-weight: 600;
}
.notice-marquee {
  position: fixed; top: 28px; left: 0; right: 0;
  background: rgba(0,0,0,0.35); color: #e6a23c;
  text-align: left;
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
  0% { transform: translateX(100vw); }
  100% { transform: translateX(-100%); }
}
</style>
