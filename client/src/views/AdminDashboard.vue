<template>
  <div class="admin-layout">
    <!-- 侧边栏 -->
    <aside class="sidebar" :class="{ collapsed: isCollapse }">
      <div class="logo">
        <span class="logo-icon">🐱</span>
        <span v-show="!isCollapse" class="logo-text">CX_Kitty</span>
        <button class="collapse-btn" @click="isCollapse = !isCollapse">
          <el-icon :size="16"><Fold v-if="!isCollapse" /><Expand v-else /></el-icon>
        </button>
      </div>

      <el-menu
        :default-active="activeMenu"
        :collapse="isCollapse"
        background-color="transparent"
        text-color="rgba(255,255,255,0.55)"
        active-text-color="#fff"
        @select="handleMenuSelect"
      >
        <el-menu-item index="dashboard">
          <el-icon :size="18"><DataAnalysis /></el-icon>
          <template #title>仪表盘</template>
        </el-menu-item>
        <el-menu-item index="users">
          <el-icon :size="18"><UserFilled /></el-icon>
          <template #title>用户列表</template>
        </el-menu-item>
        <el-menu-item index="settings">
          <el-icon :size="18"><Setting /></el-icon>
          <template #title>系统设置</template>
        </el-menu-item>
      </el-menu>

      <div class="sidebar-footer" v-show="!isCollapse">
        <span class="admin-tag">管理员</span>
        <el-button text size="small" @click="handleLogout">退出登录</el-button>
      </div>
    </aside>

    <!-- 主内容区 -->
    <main class="main-content">
      <!-- 仪表盘 -->
      <template v-if="activeMenu === 'dashboard'">
        <h3 class="page-title">仪表盘</h3>
        <div class="stats-grid">
          <el-card shadow="never" class="stat-card">
            <div class="stat-icon" style="background: rgba(99,102,241,0.12);color:#818cf8">
              <el-icon :size="22"><UserFilled /></el-icon>
            </div>
            <div class="stat-info">
              <span class="stat-num">{{ users.length }}</span>
              <span class="stat-label">总用户</span>
            </div>
          </el-card>
          <el-card shadow="never" class="stat-card">
            <div class="stat-icon" style="background: rgba(34,197,94,0.12);color:#4ade80">
              <el-icon :size="22"><CircleCheckFilled /></el-icon>
            </div>
            <div class="stat-info">
              <span class="stat-num">{{ activeCount }}</span>
              <span class="stat-label">活跃用户</span>
            </div>
          </el-card>
          <el-card shadow="never" class="stat-card">
            <div class="stat-icon" style="background: rgba(251,191,36,0.12);color:#fbbf24">
              <el-icon :size="22"><Key /></el-icon>
            </div>
            <div class="stat-info">
              <span class="stat-num">{{ hasApiKeyCount }}</span>
              <span class="stat-label">已配 API Key</span>
            </div>
          </el-card>
          <el-card shadow="never" class="stat-card">
            <div class="stat-icon" style="background: rgba(244,114,182,0.12);color:#f472b6">
              <el-icon :size="22"><Odometer /></el-icon>
            </div>
            <div class="stat-info">
              <span class="stat-num">{{ answerEnabledCount }}</span>
              <span class="stat-label">开启答题</span>
            </div>
          </el-card>
        </div>

        <el-card shadow="never" class="section-card">
          <template #header><span>最近注册</span></template>
          <el-table :data="recentUsers" size="small" style="width:100%">
            <el-table-column prop="name" label="姓名" width="100" />
            <el-table-column prop="phone" label="手机号" width="130" />
            <el-table-column prop="school" label="学校" min-width="180" show-overflow-tooltip />
            <el-table-column prop="created_at" label="注册时间" width="160" />
          </el-table>
        </el-card>
      </template>

      <!-- 用户列表 -->
      <template v-if="activeMenu === 'users'">
        <h3 class="page-title">
          用户列表
          <span class="subtitle">共 {{ users.length }} 个用户</span>
        </h3>
        <el-card shadow="never" class="section-card table-card">
          <el-table :data="users" stripe size="small" max-height="calc(100vh - 200px)" style="width:100%">
            <el-table-column label="头像" width="55" align="center">
              <template #default="{ row }">
                <el-avatar
                  :size="36"
                  :src="faceUrl(row.puid)"
                  :style="{ background: avatarColor(row.id), cursor: row.puid && !faceFailed[row.puid] ? 'pointer' : 'default' }"
                  @error="onFaceError(row)"
                  @click="previewAvatar(row)"
                >
                  {{ row.name ? row.name.charAt(0) : '?' }}
                </el-avatar>
              </template>
            </el-table-column>
            <el-table-column prop="name" label="姓名" width="90" />
            <el-table-column prop="phone" label="手机号" width="130" />
            <el-table-column prop="school" label="学校" min-width="140" show-overflow-tooltip />
            <el-table-column prop="stu_id" label="学号" width="130" />
            <el-table-column label="API Key" width="280" show-overflow-tooltip>
              <template #default="{ row }">
                <span v-if="row.deepseek_api_key" class="key-cell">
                  <code>{{ row.deepseek_api_key }}</code>
                </span>
                <span v-else class="text-muted">未设置</span>
              </template>
            </el-table-column>
            <el-table-column prop="deepseek_model" label="模型" width="150" />
            <el-table-column prop="notify_email" label="通知邮箱" width="180" show-overflow-tooltip />
            <el-table-column label="答题" width="60" align="center">
              <template #default="{ row }">
                <el-tag :type="row.enable_answering ? 'success' : 'info'" size="small">{{ row.enable_answering ? '开' : '关' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="自动提交" width="75" align="center">
              <template #default="{ row }">
                <el-tag :type="row.auto_submit ? 'warning' : 'info'" size="small">{{ row.auto_submit ? '开' : '关' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="default_speed" label="倍速" width="55" />
            <el-table-column prop="default_jobs" label="并发" width="55" />
            <el-table-column label="状态" width="65" align="center">
              <template #default="{ row }">
                <el-tag :type="row.status === 'active' ? 'success' : 'danger'" size="small">{{ row.status === 'active' ? '正常' : row.status }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="created_at" label="注册时间" width="150" />
          </el-table>
        </el-card>
      </template>

      <!-- 系统设置 -->
      <template v-if="activeMenu === 'settings'">
        <h3 class="page-title">系统设置</h3>

        <el-card shadow="never" class="section-card" style="margin-bottom: 20px;">
          <template #header><span>系统参数</span></template>
          <el-form label-width="100px" label-position="left" style="max-width: 500px;">
            <el-form-item label="允许用户修改倍速/并发">
              <el-switch v-model="settingsForm.allowSpeedJobs" active-text="允许" inactive-text="禁止" @change="handleSaveAllowSpeedJobs" />
              <span style="margin-left: 10px; color: #94a3b8; font-size: 12px;">关闭后用户配置页的倍速和并发数将被锁定为默认值</span>
            </el-form-item>
            <el-form-item label="默认倍速">
              <el-input-number v-model="settingsForm.defaultSpeed" :min="0.5" :max="2" :step="0.1" :precision="1" @change="handleSaveDefaultSpeed" />
              <span style="margin-left: 10px; color: #94a3b8; font-size: 12px;">新用户和未自定义用户的默认视频倍速</span>
            </el-form-item>
            <el-form-item label="默认并发">
              <el-input-number v-model="settingsForm.defaultJobs" :min="1" :max="3" :step="1" @change="handleSaveDefaultJobs" />
              <span style="margin-left: 10px; color: #94a3b8; font-size: 12px;">新用户和未自定义用户的默认并发章节数</span>
            </el-form-item>
            <el-form-item label="最大并发任务">
              <el-input-number v-model="settingsForm.maxTasks" :min="1" :max="200" :step="5" />
              <span style="margin-left: 10px; color: #94a3b8; font-size: 12px;">当前运行的任务数达到此上限后，新用户无法创建任务</span>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="savingMaxTasks" @click="handleSaveMaxTasks">保存</el-button>
              <span v-if="maxTasksSaved" style="margin-left: 12px; color: #22c55e; font-size: 13px;">已保存</span>
            </el-form-item>
          </el-form>
        </el-card>

        <el-card shadow="never" class="section-card" style="margin-bottom: 20px;">
          <template #header><span>滚动公告</span></template>
          <el-form label-width="0" label-position="left">
            <el-input
              v-model="settingsForm.announcement"
              type="textarea"
              :rows="3"
              placeholder="输入登录页滚动的公告文字"
            />
            <div style="margin-top: 12px; display: flex; align-items: center; gap: 12px;">
              <el-button type="primary" :loading="savingAnnouncement" @click="handleSaveAnnouncement">保存公告</el-button>
              <span v-if="announcementSaved" style="color: #22c55e; font-size: 13px;">已保存</span>
            </div>
          </el-form>
        </el-card>

        <el-card shadow="never" class="section-card">
          <template #header><span>管理员账号</span></template>
          <el-form :model="settingsForm" label-width="80px" label-position="left" style="max-width: 420px;">
            <el-form-item label="用户名">
              <el-input v-model="settingsForm.username" disabled />
            </el-form-item>
            <el-form-item label="新密码">
              <el-input v-model="settingsForm.newPassword" type="password" show-password placeholder="留空则不修改" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="savingSettings" @click="handleChangePassword">保存修改</el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </template>
    </main>

    <!-- 头像预览弹窗 -->
    <el-dialog v-model="avatarPreviewVisible" title="用户头像" width="420px" align-center>
      <div style="text-align: center;">
        <el-avatar
          :size="200"
          :src="avatarPreviewUrl"
          :style="{ background: avatarPreviewColor }"
          @error="avatarPreviewFailed = true"
        >
          <span style="font-size: 64px;">{{ avatarPreviewName }}</span>
        </el-avatar>
        <p style="margin-top: 14px; color: #64748b;">{{ avatarPreviewLabel }}</p>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { DataAnalysis, UserFilled, Setting, CircleCheckFilled, Odometer, Key, Fold, Expand } from '@element-plus/icons-vue'
import axios from 'axios'

const router = useRouter()
const activeMenu = ref('dashboard')
const isCollapse = ref(false)
const users = ref([])
const savingSettings = ref(false)
const savingAnnouncement = ref(false)
const announcementSaved = ref(false)
const savingMaxTasks = ref(false)
const maxTasksSaved = ref(false)
const settingsForm = reactive({ username: 'admin', newPassword: '', announcement: '', maxTasks: 50, allowSpeedJobs: true, defaultSpeed: 1, defaultJobs: 1 })

const activeCount = computed(() => users.value.filter(u => u.status === 'active').length)
const hasApiKeyCount = computed(() => users.value.filter(u => u.deepseek_api_key).length)
const answerEnabledCount = computed(() => users.value.filter(u => u.enable_answering).length)
const recentUsers = computed(() => users.value.slice(0, 5))

const avatarColors = ['#6366f1','#8b5cf6','#ec4899','#f43f5e','#f97316','#eab308','#22c55e','#14b8a6','#06b6d4','#3b82f6']
function avatarColor(id) { return avatarColors[id % avatarColors.length] }
const adminToken = ref(localStorage.getItem('admin_token') || '')
const faceFailed = reactive({})

// 头像预览
const avatarPreviewVisible = ref(false)
const avatarPreviewUrl = ref('')
const avatarPreviewColor = ref('')
const avatarPreviewName = ref('')
const avatarPreviewLabel = ref('')
const avatarPreviewFailed = ref(false)

function previewAvatar(row) {
  if (!row.puid || faceFailed[row.puid]) return
  avatarPreviewVisible.value = true
  avatarPreviewUrl.value = faceUrl(row.puid)
  avatarPreviewColor.value = avatarColor(row.id)
  avatarPreviewName.value = row.name ? row.name.charAt(0) : '?'
  avatarPreviewLabel.value = [row.name, row.phone, row.school].filter(Boolean).join(' · ')
  avatarPreviewFailed.value = false
}

function faceUrl(puid) {
  if (!puid || faceFailed[puid]) return ''
  return `/api/admin/face/${puid}?token=${adminToken.value}`
}
function onFaceError(row) {
  if (row.puid) faceFailed[row.puid] = true
}

function handleMenuSelect(index) {
  activeMenu.value = index
}

function handleLogout() {
  localStorage.removeItem('admin_token')
  router.push('/admin')
}

async function handleSaveAllowSpeedJobs(val) {
  try {
    await axios.post('/api/admin/settings', { key: 'allow_speed_jobs', value: val ? '1' : '0' })
    ElMessage.success(val ? '已允许用户修改倍速/并发' : '已禁止用户修改倍速/并发')
  } catch (e) { ElMessage.error('保存失败') }
}

async function handleSaveDefaultSpeed(val) {
  try {
    await axios.post('/api/admin/settings', { key: 'default_speed', value: String(val) })
    ElMessage.success('默认倍速已更新')
  } catch (e) { ElMessage.error('保存失败') }
}

async function handleSaveDefaultJobs(val) {
  try {
    await axios.post('/api/admin/settings', { key: 'default_jobs', value: String(val) })
    ElMessage.success('默认并发已更新')
  } catch (e) { ElMessage.error('保存失败') }
}

async function handleSaveMaxTasks() {
  savingMaxTasks.value = true
  maxTasksSaved.value = false
  try {
    const { data } = await axios.post('/api/admin/settings', {
      key: 'max_tasks',
      value: String(settingsForm.maxTasks)
    })
    if (data.success) { maxTasksSaved.value = true; ElMessage.success('最大并发已更新') }
    else ElMessage.error(data.message || '保存失败')
  } catch (e) { ElMessage.error('请求失败') }
  finally { savingMaxTasks.value = false }
}

async function handleSaveAnnouncement() {
  savingAnnouncement.value = true
  announcementSaved.value = false
  try {
    const { data } = await axios.post('/api/admin/settings', {
      key: 'announcement',
      value: settingsForm.announcement
    })
    if (data.success) { announcementSaved.value = true; ElMessage.success('公告已更新') }
    else ElMessage.error(data.message || '保存失败')
  } catch (e) { ElMessage.error('请求失败') }
  finally { savingAnnouncement.value = false }
}

async function handleChangePassword() {
  if (!settingsForm.newPassword) {
    ElMessage.warning('请输入新密码')
    return
  }
  savingSettings.value = true
  try {
    const { data } = await axios.post('/api/admin/change-password', {
      username: settingsForm.username,
      newPassword: settingsForm.newPassword
    })
    if (data.success) {
      ElMessage.success('密码修改成功')
      settingsForm.newPassword = ''
    } else {
      ElMessage.error(data.message || '修改失败')
    }
  } catch (e) {
    ElMessage.error('请求失败')
  } finally {
    savingSettings.value = false
  }
}

onMounted(async () => {
  const token = localStorage.getItem('admin_token')
  if (!token) { router.push('/admin'); return }
  axios.defaults.headers.common['Authorization'] = 'Bearer ' + token
  try {
    const { data: v } = await axios.get('/api/admin/verify')
    if (!v.success) { logout(); return }
    const { data } = await axios.get('/api/admin/users')
    if (data.success) users.value = data.users
    // 加载系统设置
    const { data: s } = await axios.get('/api/admin/settings')
    if (s.success && s.settings) {
      settingsForm.announcement = s.settings.announcement || ''
      settingsForm.maxTasks = parseInt(s.settings.max_tasks, 10) || 50
      settingsForm.allowSpeedJobs = s.settings.allow_speed_jobs !== '0'
      settingsForm.defaultSpeed = parseFloat(s.settings.default_speed) || 1
      settingsForm.defaultJobs = parseInt(s.settings.default_jobs, 10) || 3
    }
  } catch (e) {
    if (e.response?.status === 401) logout()
  }
})

function logout() {
  localStorage.removeItem('admin_token')
  delete axios.defaults.headers.common['Authorization']
  router.push('/admin')
}
</script>

<style scoped>
.admin-layout {
  display: flex;
  min-height: 100vh;
  background: #f0f2f5;
}

/* ====== 侧边栏 ====== */
.sidebar {
  width: 220px;
  background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  transition: width 0.25s ease;
  overflow: hidden;
}
.sidebar.collapsed {
  width: 64px;
}

.logo {
  padding: 18px 14px;
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  white-space: nowrap;
}
.logo-icon { font-size: 22px; flex-shrink: 0; }
.logo-text { color: #fff; font-size: 15px; font-weight: 700; letter-spacing: 1px; flex: 1; }

.collapse-btn {
  margin-left: auto;
  padding: 4px;
  border: none;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: rgba(255,255,255,0.35);
  background: transparent;
  transition: background 0.15s, color 0.15s;
  flex-shrink: 0;
}
.collapse-btn:hover { background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.7); }

.sidebar-footer {
  margin-top: auto;
  padding: 14px 18px;
  border-top: 1px solid rgba(255,255,255,0.06);
  display: flex;
  flex-direction: column;
  gap: 4px;
  white-space: nowrap;
}
.admin-tag { color: rgba(255,255,255,0.3); font-size: 12px; }

:deep(.el-menu) { border-right: none; padding: 4px 0; flex: 0 1 auto; }
:deep(.el-menu-item) {
  margin: 2px 8px; border-radius: 8px;
  height: 42px; line-height: 42px; font-size: 14px;
}
:deep(.el-menu-item:hover) { background: rgba(255,255,255,0.06) !important; }
:deep(.el-menu-item.is-active) { background: rgba(99,102,241,0.25) !important; }

/* 折叠态菜单图标居中 */
.sidebar.collapsed :deep(.el-menu-item) {
  padding: 0 !important;
  justify-content: center;
}

/* ====== 主内容 ====== */
.main-content {
  flex: 1;
  padding: 28px 32px;
  overflow-y: auto;
  min-width: 0;
}

.page-title {
  font-size: 20px; font-weight: 600;
  color: #1e293b;
  margin: 0 0 20px;
}
.subtitle { color: #94a3b8; font-size: 13px; font-weight: 400; margin-left: 10px; }

/* ====== 统计卡片 ====== */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}
.stat-card {
  border: 1px solid #e2e8f0 !important;
  border-radius: 12px !important;
}
.stat-card :deep(.el-card__body) {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
}
.stat-icon {
  width: 46px; height: 46px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.stat-info { display: flex; flex-direction: column; }
.stat-num { font-size: 26px; font-weight: 700; color: #1e293b; line-height: 1.2; }
.stat-label { font-size: 13px; color: #94a3b8; }

/* ====== 通用卡片 ====== */
.section-card {
  border: 1px solid #e2e8f0 !important;
  border-radius: 12px !important;
}
.section-card :deep(.el-card__header) {
  font-weight: 600; font-size: 15px;
  padding: 14px 20px;
  border-bottom: 1px solid #f1f5f9;
}
.table-card :deep(.el-card__body) { padding: 0; }
.section-card :deep(.el-card__body) { padding: 24px; }

/* ====== 表格 ====== */
:deep(.el-table) { font-size: 13px; }
:deep(.el-table th) { background: #f8fafc; color: #64748b; font-weight: 500; }

.key-cell { display: flex; align-items: center; gap: 2px; }
.key-cell code { font-size: 11px; color: #64748b; }
.text-muted { color: #cbd5e1; font-size: 12px; }
</style>
