<template>
  <div class="config-page" :class="{ 'dialog-mode': dialogMode }">
    <div class="card">
      <p class="phone" v-if="!dialogMode">{{ account.phone }}</p>

      <el-form label-position="top" size="small" class="config-form">
        <el-form-item label="DeepSeek API Key">
          <div v-if="hasKey && !editingKey" class="key-status">
            <span class="key-masked">{{ maskedKey }}</span>
            <el-button size="small" @click="editingKey = true">修改</el-button>
            <el-button size="small" @click="queryBalance">查余额</el-button>
          </div>
          <el-input v-else v-model="form.deepseekApiKey" type="password" placeholder="sk-..." show-password />
          <div v-if="editingKey && !form.deepseekApiKey" class="key-hint">留空则不修改已有 Key</div>
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

const props = defineProps({ account: Object, dialogMode: Boolean })
const emit = defineEmits(['enter', 'close'])

const saving = ref(false)
const checking = ref(false)
const balance = ref(null)
const error = ref('')
const hasKey = ref(false)
const maskedKey = ref('')
const editingKey = ref(false)

const form = ref({
  deepseekApiKey: '',
  deepseekModel: 'deepseek-v4-flash',
  enableAnswering: true,
  autoSubmit: false,
})

async function queryBalance() {
  checking.value = true
  balance.value = null
  try {
    const { data } = await axios.get('/api/balance', { params: { phone: props.account.phone } })
    if (data.success) balance.value = data.balance
  } catch {} finally { checking.value = false }
}

async function save() {
  saving.value = true
  error.value = ''
  try {
    const body = {
      phone: props.account.phone,
      password: props.account.password,
      deepseekModel: form.value.deepseekModel,
      enableAnswering: form.value.enableAnswering,
      autoSubmit: form.value.autoSubmit
    }
    // 仅在用户编辑时发送 API Key（修改或首次设置）
    if (editingKey.value && form.value.deepseekApiKey) {
      body.deepseekApiKey = form.value.deepseekApiKey
    } else if (!hasKey.value && form.value.deepseekApiKey) {
      body.deepseekApiKey = form.value.deepseekApiKey
    }
    await axios.post('/api/account/save', body)
    emit('enter', form.value)
    emit('close')
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
        hasKey.value = data.config.has_deepseek_key || false
        maskedKey.value = data.config.deepseek_key_masked || ''
        form.value.deepseekModel = data.config.deepseek_model || 'deepseek-v4-flash'
        form.value.enableAnswering = data.config.enable_answering !== false
        form.value.autoSubmit = !!data.config.auto_submit
        // 不填充 API Key 到表单，只在有 key 时自动查余额
        if (hasKey.value) setTimeout(queryBalance, 500)
        return
      }
    } catch {}
  }
  // 无本地存储的 API Key 回填
  form.value.deepseekModel = 'deepseek-v4-flash'
  form.value.enableAnswering = true
  form.value.autoSubmit = false
})
</script>

<style scoped>
.config-page.dialog-mode { padding: 0; width: 100%; }
.config-page.dialog-mode .card { background: transparent; backdrop-filter: none; -webkit-backdrop-filter: none; box-shadow: none; border: none; padding: 0; }
.config-form label { color: rgba(255,255,255,0.8) !important; }
.config-form :deep(.el-input__wrapper) { background: rgba(255,255,255,0.1); box-shadow: 0 0 0 1px rgba(255,255,255,0.15) inset; }
.config-form :deep(.el-input__inner) { color: #fff; }
.config-form :deep(.el-select .el-input__wrapper) { background: rgba(255,255,255,0.1); }
.config-form :deep(.el-switch__label) { color: rgba(255,255,255,0.7); }
.config-form :deep(.el-divider) { border-color: rgba(255,255,255,0.1); }
.config-form :deep(.el-form-item__label) { color: rgba(255,255,255,0.8); }
.config-page:not(.dialog-mode) {
  display: flex; justify-content: center; align-items: center;
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 20px;
}
.card {
  background: rgba(255,255,255,0.15);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-radius: 20px; padding: 32px;
  width: 100%;
  box-shadow: 0 8px 32px rgba(0,0,0,0.2);
  border: 1px solid rgba(255,255,255,0.2);
  text-align: center;
}
.logo { font-size: 56px; margin-bottom: 8px; text-align: center; }
h1 { font-size: 22px; color: #fff; text-align: center; margin-bottom: 4px; }
.phone { text-align: center; color: rgba(255,255,255,0.7); font-size: 13px; margin-bottom: 24px; }
.error { color: #f56c6c; font-size: 13px; margin-top: 12px; text-align: center; }
.balance-box {
  display: flex; align-items: center; justify-content: space-between;
  background: #f0f9eb; border-radius: 8px; padding: 8px 14px;
  margin-bottom: 16px; font-size: 14px;
}
.balance-box.checking { background: #f4f4f5; color: #909399; justify-content: center; }
.balance-val { font-weight: 600; color: #67c23a; }
.balance-val.low { color: #e6a23c; }
.key-status { display: flex; align-items: center; gap: 8px; padding: 4px 0; }
.key-masked { font-family: monospace; color: rgba(255,255,255,0.7); font-size: 13px; }
.key-hint { font-size: 12px; color: rgba(255,255,255,0.5); margin-top: 4px; }

</style>
