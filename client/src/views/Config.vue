<template>
  <div class="config-page">
    <div class="card">
      
      <h1>AI 刷课配置</h1>
      <p class="phone">{{ account.phone }}</p>

      <el-form label-position="top" size="small">
        <el-form-item label="DeepSeek API Key">
          <el-input v-model="form.deepseekApiKey" type="password" placeholder="sk-..." show-password @input="onKeyChange" />
        </el-form-item>

        <!-- 余额 -->
        <div v-if="balance !== null" class="balance-box">
          <span>余额</span>
          <span class="balance-val" :class="{ low: balance < 1 }">¥{{ balance.toFixed(2) }}</span>
        </div>
        <div v-else-if="checking" class="balance-box checking">查询余额中...</div>

        <el-form-item label="模型">
          <el-select v-model="form.deepseekModel" style="width:100%">
            <el-option value="deepseek-v4-flash" label="deepseek-v4-flash（快）" />
            <el-option value="deepseek-v4-pro" label="deepseek-v4-pro（强）" />
          </el-select>
        </el-form-item>

        <el-form-item label="答题开关">
          <el-switch v-model="form.enableAnswering" active-text="答题" inactive-text="不答题" />
        </el-form-item>

        <el-form-item v-if="form.enableAnswering" label="自动提交">
          <el-switch v-model="form.autoSubmit" active-text="自动提交" inactive-text="仅保存" />
        </el-form-item>

        <el-divider />

        <div class="config-row">
          <div class="config-item">
            <label>默认倍速</label>
            <el-select v-model="form.defaultSpeed" size="small">
              <el-option :value="1" label="1x" />
              <el-option :value="1.5" label="1.5x" />
              <el-option :value="2" label="2x" />
            </el-select>
          </div>
          <div class="config-item">
            <label>默认并发</label>
            <el-select v-model="form.defaultJobs" size="small">
              <el-option :value="1" label="1" />
              <el-option :value="2" label="2" />
              <el-option :value="3" label="3" />
              <el-option :value="5" label="5" />
            </el-select>
          </div>
        </div>

        <el-button type="primary" size="large" style="width:100%;margin-top:12px" :loading="saving" @click="save">
          {{ saving ? '保存中...' : '保存配置' }}
        </el-button>
      </el-form>

      <p v-if="error" class="error">{{ error }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import axios from 'axios'

const props = defineProps({ account: Object })
const emit = defineEmits(['enter'])

const saving = ref(false)
const checking = ref(false)
const balance = ref(null)
const error = ref('')

const form = ref({
  deepseekApiKey: '',
  deepseekModel: 'deepseek-v4-flash',
  enableAnswering: true,
  autoSubmit: false,
  defaultSpeed: 1,
  defaultJobs: 3
})

let timer = null

function onKeyChange(val) {
  if (timer) clearTimeout(timer)
  balance.value = null
  if (!val || val.length < 10) return
  timer = setTimeout(async () => {
    checking.value = true
    try {
      const { data } = await axios.get('/api/balance', { params: { key: val } })
      if (data.success) balance.value = data.balance
    } catch {} finally { checking.value = false }
  }, 600)
}

async function save() {
  saving.value = true
  error.value = ''
  try {
    await axios.post('/api/account/save', {
      phone: props.account.phone,
      password: props.account.password,
      ...form.value
    })
    emit('enter', form.value)
  } catch (e) {
    error.value = '保存失败'
  } finally { saving.value = false }
}

onMounted(async () => {
  // 先从数据库加载已有配置
  if (props.account?.phone) {
    try {
      const { data } = await axios.get('/api/account/config', { params: { phone: props.account.phone } })
      if (data.success && data.config) {
        form.value.deepseekApiKey = data.config.deepseek_api_key || ''
        form.value.deepseekModel = data.config.deepseek_model || 'deepseek-v4-flash'
        form.value.enableAnswering = data.config.enable_answering !== false
        form.value.autoSubmit = !!data.config.auto_submit
        form.value.defaultSpeed = data.config.default_speed || 1
        form.value.defaultJobs = data.config.default_jobs || 3
        if (form.value.deepseekApiKey) onKeyChange(form.value.deepseekApiKey)
        return
      }
    } catch {}
  }
  // 从 localStorage 回填
  if (props.account) {
    form.value.deepseekApiKey = props.account.deepseekApiKey || ''
    form.value.deepseekModel = props.account.deepseekModel || 'deepseek-v4-flash'
    form.value.enableAnswering = props.account.enableAnswering !== false
    form.value.autoSubmit = !!props.account.autoSubmit
    form.value.defaultSpeed = props.account.defaultSpeed || 1
    form.value.defaultJobs = props.account.defaultJobs || 3
    if (form.value.deepseekApiKey) onKeyChange(form.value.deepseekApiKey)
  }
})
</script>

<style scoped>
.config-page {
  display: flex; justify-content: center; align-items: center;
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 20px;
}
.card {
  background: #fff; border-radius: 16px; padding: 40px;
  width: 100%; max-width: 420px; box-shadow: 0 20px 60px rgba(0,0,0,0.15);
}
.logo { font-size: 56px; margin-bottom: 8px; text-align: center; }
h1 { font-size: 22px; color: #303133; text-align: center; margin-bottom: 4px; }
.phone { text-align: center; color: #909399; font-size: 13px; margin-bottom: 24px; }
.error { color: #f56c6c; font-size: 13px; margin-top: 12px; text-align: center; }
.balance-box {
  display: flex; align-items: center; justify-content: space-between;
  background: #f0f9eb; border-radius: 8px; padding: 8px 14px;
  margin-bottom: 16px; font-size: 14px;
}
.balance-box.checking { background: #f4f4f5; color: #909399; justify-content: center; }
.balance-val { font-weight: 600; color: #67c23a; }
.balance-val.low { color: #e6a23c; }
.config-row { display: flex; gap: 12px; margin-bottom: 12px; }
.config-item { flex: 1; }
.config-item label { display: block; color: #606266; font-size: 13px; margin-bottom: 6px; }
</style>
