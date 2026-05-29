<template>
  <div class="admin-page">
    <div class="card">
      <h1>CX_Kitty</h1>
      <p class="desc">后台管理系统</p>

      <el-form ref="formRef" :model="form" :rules="rules" @keyup.enter="handleLogin">
        <el-input v-model="form.username" placeholder="管理员账号" size="large" style="margin-bottom: 16px;">
          <template #prefix><el-icon><User /></el-icon></template>
        </el-input>
        <el-input v-model="form.password" type="password" placeholder="管理员密码" size="large" show-password style="margin-bottom: 16px;">
          <template #prefix><el-icon><Lock /></el-icon></template>
        </el-input>

        <el-button type="primary" size="large" :loading="loading" style="width: 100%;margin-top:8px" @click="handleLogin">
          {{ loading ? '登录中...' : '登 录' }}
        </el-button>
      </el-form>

      <div class="login-link" @click="$router.push('/login')">用户登录</div>
    </div>
    <div class="copyright">SJYssr 2025-2026 豫ICP备2024069806号-4</div>
    <div class="disclaimer">
      后台管理系统 — 仅供管理员使用
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { User, Lock } from '@element-plus/icons-vue'
import axios from 'axios'

const router = useRouter()
const formRef = ref(null)
const loading = ref(false)
const form = reactive({ username: '', password: '' })
const rules = {
  username: [{ required: true, message: '请输入管理员账号', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
}

async function handleLogin() {
  if (loading.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  loading.value = true
  try {
    const { data } = await axios.post('/api/admin/login', {
      username: form.username,
      password: form.password
    })
    if (!data.success) {
      ElMessage.error(data.message || '登录失败')
      return
    }
    localStorage.setItem('admin_token', data.token)
    ElMessage.success('登录成功')
    router.push('/admin/dashboard')
  } catch (e) {
    ElMessage.error('无法连接服务器')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.admin-page {
  display: flex; justify-content: center; align-items: center;
  min-height: 100vh;
  padding: 20px;
  position: relative;
}
.admin-page::before {
  content: "";
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: url('/bg.jpg') center/cover no-repeat fixed;
  filter: blur(8px);
  z-index: -1;
}
.admin-page::after {
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
.desc { color: rgba(255,255,255,0.7); font-size: 14px; margin-bottom: 32px; }
.login-link {
  position: absolute; bottom: 14px; right: 24px;
  color: rgba(255,255,255,0.5); font-size: 13px; cursor: pointer;
  transition: color 0.2s;
}
.login-link:hover { color: #409EFF; }
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
