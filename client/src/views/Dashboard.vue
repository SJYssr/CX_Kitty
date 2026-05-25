<template>
  <div class="app">
    <header class="topbar">
      <span class="brand">CX_Kitty</span>
      <span class="user">{{ account.name || account.phone }}</span>
      <el-button size="small" @click="$emit('config')">配置</el-button>
      <el-button size="small" @click="$emit('logout')">退出</el-button>
    </header>

    <main class="main">
      <section class="row">
        <div class="col">
          <div class="panel">
            <div class="panel-header">
              <span>课程列表</span>
              <el-button size="small" @click="loadCourses" :loading="loadingCourses">刷新</el-button>
            </div>
            <el-table :data="courses" stripe size="small" max-height="400" style="width:100%" @selection-change="onSelectionChange">
              <el-table-column type="selection" width="40" />
              <el-table-column prop="title" label="课程" min-width="180" show-overflow-tooltip />
              <el-table-column prop="teacher" label="教师" width="100" />
            </el-table>
          </div>
        </div>

        <div class="col">
          <div class="panel" style="text-align:center;padding:32px 20px">
            <div style="font-size:12px;color:rgba(255,255,255,0.6);margin-bottom:8px">
              系统负载: <span :class="systemLoadClass">{{ runningTaskCount }}/{{ maxTaskCount }}</span>
            </div>
            <div style="font-size:13px;color:rgba(255,255,255,0.7);margin-bottom:16px">
              倍速 {{ account.defaultSpeed || 1 }}x · 并发 {{ account.defaultJobs || 1 }}
              <el-button link size="small" @click="configVisible = true" style="margin-left:4px">修改</el-button>
            </div>
            <el-button type="primary" size="large" :loading="starting" :disabled="runningTaskCount >= maxTaskCount" style="width:100%" @click="start">
              {{ starting ? '启动中…' : startBtnText }}
            </el-button>
          </div>

          <div v-if="currentTask" class="panel" style="margin-top:12px">
            <div class="panel-header">
              任务 #{{ getTaskIndex(currentTask.id) }}
              <el-tag :type="taskTag" size="small">{{ taskText }}</el-tag>
            </div>

            <!-- Per-course progress -->
            <div v-if="courseProgress.length" class="course-progress">
              <div v-for="cp in courseProgress" :key="cp.courseId" class="course-item">
                <div class="course-name">{{ cp.title }}</div>
                <div class="course-bar">
                  <el-progress
                    :percentage="cp.percent"
                    :status="cp.finished ? 'success' : ''"
                    :stroke-width="10"
                    :show-text="false"
                  />
                </div>
                <div class="course-detail">{{ cp.completed }}/{{ cp.total }} 章节</div>
              </div>
            </div>

            <!-- Fallback simple progress -->
            <div v-else>
              <el-progress :percentage="taskPct" :status="taskPctStatus" :stroke-width="12" :show-text="false" />
            </div>

            <p class="time">{{ currentTask.started_at?.slice(0,19) }} → {{ currentTask.finished_at?.slice(0,19) || '进行中' }}</p>
          </div>
        </div>
      </section>

      <section class="panel" style="margin-top:16px">
        <div class="panel-header">
          任务记录
          <el-button size="small" @click="loadTasks" :loading="loadingTasks">刷新</el-button>
        </div>
        <el-table :data="tasks" stripe size="small" max-height="240" style="width:100%" class="task-table">
          <el-table-column label="#" width="50">
            <template #default="{row}">{{ tasks.length - tasks.findIndex(t => t.id === row.id) }}</template>
          </el-table-column>
          <el-table-column label="状态" width="80">
            <template #default="{row}">
              <el-tag :type="{completed:'success',failed:'danger',running:'warning',pending:'info',terminated:'info'}[row.status]||'info'" size="small">
                {{ {completed:'完成',failed:'失败',running:'进行中',pending:'等待',terminated:'已终止'}[row.status]||row.status }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="speed" label="倍速" width="60" align="center" />
          <el-table-column prop="jobs" label="并发" width="60" align="center" />
          <el-table-column prop="started_at" label="开始" min-width="140" />
          <el-table-column prop="finished_at" label="结束" min-width="140" />
          <el-table-column label="课程" width="70" align="center">
            <template #default="{row}">
              <el-button size="small" link type="primary" @click="showTaskDetail(row)">查看</el-button>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="70" align="center">
            <template #default="{row}">
              <el-button v-if="row.status==='running'" size="small" type="danger" plain @click="terminateTask(row.id)">终止</el-button>
            </template>
          </el-table-column>
        </el-table>
      </section>
    </main>

    <!-- 任务详情弹窗 -->
    <!-- 配置弹窗 -->
    <el-dialog v-model="configVisible" title="配置" width="420px" :close-on-click-modal="false" destroy-on-close>
      <Config :account="account" dialog-mode @enter="onConfigDone" />
    </el-dialog>

    <el-dialog v-model="detailVisible" title="任务课程详情" width="500px" :close-on-click-modal="true">
      <template v-if="detailTask">
        <div style="margin-bottom:12px">
          任务 #{{ getTaskIndex(detailTask.id) }} ·
          <el-tag :type="{completed:'success',failed:'danger',running:'warning',terminated:'info'}[detailTask.status]||'info'" size="small">
            {{ {completed:'完成',failed:'失败',running:'进行中',pending:'等待',terminated:'已终止'}[detailTask.status]||detailTask.status }}
          </el-tag>
        </div>
        <div v-if="detailCourses.length" style="max-height:400px;overflow-y:auto">
          <div v-for="c in detailCourses" :key="c.id" class="detail-course-item">
            <div class="detail-course-title">{{ c.title }}</div>
            <div class="detail-course-meta">{{ c.teacher }} · {{ c.courseId }}</div>
          </div>
        </div>
        <div v-else style="color:rgba(255,255,255,0.6);font-size:13px">暂无课程数据</div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import axios from 'axios'
import Config from './Config.vue'

const props = defineProps({ account: Object })
const emit = defineEmits(['logout'])
const configVisible = ref(false)

const courses = ref([])
const selectedCourses = ref([])
const starting = ref(false)
const loadingCourses = ref(false)
const loadingTasks = ref(false)
const currentTask = ref(null)
const tasks = ref([])
const runningTaskCount = ref(0)
const maxTaskCount = ref(100)
const detailVisible = ref(false)
const detailTask = ref(null)
let timer = null
let loadTimer = null

const detailCourses = computed(() => {
  if (!detailTask.value) return []
  let ids = detailTask.value.course_ids
  if (typeof ids === 'string') { try { ids = JSON.parse(ids) } catch { ids = [] } }
  if (!Array.isArray(ids)) return []
  return ids.map(id => {
    const c = courses.value.find(c => c.courseId === id)
    return { id, title: c?.title || '未知课程', teacher: c?.teacher || '' }
  })
})

function getTaskIndex(taskId) {
  const idx = tasks.value.findIndex(t => t.id === taskId)
  return idx >= 0 ? tasks.value.length - idx : taskId
}

function onConfigDone(configData) {
  Object.assign(account.value, configData)
  localStorage.setItem('cx_account', JSON.stringify(account.value))
  configVisible.value = false
}

function showTaskDetail(task) {
  detailTask.value = task
  detailVisible.value = true
}

async function fetchSystemLoad() {
  try {
    const { data } = await axios.get('/api/system/task-count')
    if (data.success) {
      runningTaskCount.value = data.count
      maxTaskCount.value = data.max || 100
    }
  } catch {}
}

const systemLoadClass = computed(() =>
  runningTaskCount.value >= maxTaskCount.value ? 'load-full' : 'load-ok'
)

const startBtnText = computed(() => {
  if (starting.value) return '启动中…'
  if (runningTaskCount.value >= maxTaskCount.value) return '🚫 服务器已满'
  return '开始刷课'
})

function onSelectionChange(selection) {
  selectedCourses.value = selection.map(c => c.courseId)
}

const taskTag = computed(() =>
  ({ completed:'success', failed:'danger', running:'warning', terminated:'info' }[currentTask.value?.status] || 'info'))
const taskText = computed(() =>
  ({ completed:'完成', failed:'失败', running:'进行中', terminated:'已终止' }[currentTask.value?.status] || '等待'))
const taskPct = computed(() => {
  if (!currentTask.value) return 0
  if (currentTask.value.status === 'completed') return 100
  if (currentTask.value.status === 'failed') return 0
  if (courseProgress.value.length > 0) {
    const total = courseProgress.value.reduce((s, c) => s + c.total, 0)
    const done = courseProgress.value.reduce((s, c) => s + c.completed, 0)
    return total > 0 ? Math.round(done / total * 100) : 50
  }
  return 50
})
const taskPctStatus = computed(() =>
  currentTask.value?.status === 'completed' ? 'success' : currentTask.value?.status === 'failed' ? 'exception' : '')

const courseProgress = computed(() => {
  if (!currentTask.value) return []
  let progress = currentTask.value.progress
  if (typeof progress === 'string') {
    try { progress = JSON.parse(progress) } catch { progress = null }
  }
  if (progress?.courses) {
    return Object.entries(progress.courses).map(([courseId, c]) => ({
      courseId,
      title: c.title || courseId,
      total: c.total || 0,
      completed: c.completed || 0,
      percent: c.total > 0 ? Math.round(c.completed / c.total * 100) : 0,
      finished: c.total > 0 && c.completed >= c.total
    }))
  }
  // Fallback: show course names from course_ids
  let courseIds = currentTask.value.course_ids
  if (typeof courseIds === 'string') {
    try { courseIds = JSON.parse(courseIds) } catch { courseIds = [] }
  }
  if (Array.isArray(courseIds) && courseIds.length) {
    return courseIds.map(id => {
      const c = courses.value.find(c => c.courseId === id)
      return { courseId: id, title: c?.title || id, percent: 0, completed: 0, total: 0, finished: false }
    })
  }
  return []
})

async function loadCourses() {
  loadingCourses.value = true
  try {
    const { data } = await axios.post('/api/courses', {
      phone: props.account.phone, password: props.account.password
    })
    if (data.success) courses.value = data.courses
  } catch {} finally { loadingCourses.value = false }
}

function startPolling(taskId) {
  if (timer) clearInterval(timer);
  timer = setInterval(async () => {
    try {
      const r = await axios.get('/api/study/status/' + taskId)
      if (r.data.success && r.data.task) {
        currentTask.value = r.data.task
        if (['completed','failed'].includes(r.data.task.status)) {
          clearInterval(timer); timer = null; loadTasks()
        }
      }
    } catch {}
  }, 3000)
}

async function loadTasks() {
  loadingTasks.value = true
  try {
    const { data } = await axios.get('/api/study/tasks', {
      params: { phone: props.account.phone }
    })
    if (data.success) {
      tasks.value = data.tasks
      // If no currentTask or currentTask is finished, check for latest running
      if (!currentTask.value || ['completed','failed'].includes(currentTask.value.status)) {
        const running = data.tasks.find(t => t.status === 'running')
        if (running) {
          currentTask.value = running
          startPolling(running.id)
        }
      }
    }
  } catch {} finally { loadingTasks.value = false }
}

async function start() {
  starting.value = true
  try {
    const { data } = await axios.post('/api/study/start', {
      phone: props.account.phone,
      password: props.account.password,
      courseIds: selectedCourses.value.length > 0 ? selectedCourses.value : null,
      speed: props.account.defaultSpeed || 1,
      jobs: props.account.defaultJobs || 1,
      deepseekApiKey: props.account.deepseekApiKey || '',
      deepseekModel: props.account.deepseekModel || 'deepseek-v4-flash',
      enableAnswering: props.account.enableAnswering !== false,
      autoSubmit: !!props.account.autoSubmit
    })
    if (data.success) {
      ElMessage.success('刷课任务已启动')
      currentTask.value = { id: data.taskId, status: 'running' }
      loadTasks()
      startPolling(data.taskId)
    } else {
      ElMessage.error(data.message || '启动失败')
    }
  } catch (err) {
    ElMessage.error('启动失败: ' + (err.response?.data?.message || err.message))
  } finally { starting.value = false }
}

async function terminateTask(taskId) {
  try {
    const { data } = await axios.post('/api/study/terminate/' + taskId)
    if (data.success) {
      ElMessage.success('任务已终止')
      loadTasks()
      if (currentTask.value?.id === taskId) {
        if (timer) { clearInterval(timer); timer = null }
        currentTask.value = null
      }
    } else {
      ElMessage.error(data.message || '终止失败')
    }
  } catch (err) {
    ElMessage.error('终止失败')
  }
}

onMounted(() => {
  loadCourses()
  loadTasks()
  fetchSystemLoad()
  // 如果没有配置过 DeepSeek Key，自动弹出配置弹窗
  if (!props.account?.deepseekApiKey) {
    configVisible.value = true
  }
  loadTimer = setInterval(fetchSystemLoad, 1000)
  const lastNotice = localStorage.getItem('cx_last_task_notice')
  axios.get('/api/study/tasks', {
    params: { phone: props.account.phone }
  }).then(r => {
    if (!r.data.success || !r.data.tasks?.length) return
    const latest = r.data.tasks[0]
    // 仅在任务进行中时显示进度卡片
    if (latest.status === 'running') {
      currentTask.value = latest
      startPolling(latest.id)
    }
    // Notification for completed tasks (only once per task)
    if (['completed','failed'].includes(latest.status)) {
      if (lastNotice !== String(latest.id)) {
        localStorage.setItem('cx_last_task_notice', String(latest.id))
        if (latest.status === 'completed') ElMessage.success('🎉 上次的刷课任务已完成！')
        else ElMessage.warning('⚠️ 上次的刷课任务执行失败')
      }
    }
  }).catch(() => {})
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
  if (loadTimer) clearInterval(loadTimer)
})
</script>

<style scoped>
.app { min-height: 100vh; display: flex; flex-direction: column; position: relative; }
.app::before {
  content: ""; position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: url('/bg.jpg') center/cover no-repeat fixed;
  filter: blur(6px); z-index: -1;
}
.app::after {
  content: ""; position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.3); z-index: -1;
}
.topbar {
  display: flex; align-items: center; gap: 12px;
  padding: 0 24px; height: 52px;
  background: rgba(255,255,255,0.1);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(255,255,255,0.1);
}
.brand { font-weight: 600; font-size: 16px; margin-right: auto; color: #fff; }
.user { color: rgba(255,255,255,0.8); font-size: 13px; }
.main { max-width: 1000px; width: 100%; margin: 0 auto; padding: 20px; }
.row { display: flex; gap: 16px; flex-wrap: wrap; }
.col { flex: 1; min-width: 300px; }
.panel {
  background: rgba(255,255,255,0.12);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-radius: 16px; padding: 16px 20px;
  border: 1px solid rgba(255,255,255,0.15);
  box-shadow: 0 4px 24px rgba(0,0,0,0.1);
}
.panel-header {
  display: flex; align-items: center; justify-content: space-between;
  font-weight: 600; margin-bottom: 12px; color: #fff;
}
:deep(.el-progress-bar__outer) { background: rgba(255,255,255,0.1); }
.load-ok { color: #67c23a; font-weight: 600; }
.detail-course-item { padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); }
.detail-course-item:last-child { border-bottom: none; }
.detail-course-title { font-size: 14px; font-weight: 500; color: #fff; }
.detail-course-meta { font-size: 12px; color: rgba(255,255,255,0.6); margin-top: 2px; }
.load-full { color: #f56c6c; font-weight: 600; }
.time { color: rgba(255,255,255,0.6); font-size: 12px; margin-top: 8px; text-align: center; }
.course-progress { margin: 8px 0; max-height: 300px; overflow-y: auto; }
.course-item { margin-bottom: 10px; }
.course-name { font-size: 13px; font-weight: 500; margin-bottom: 4px; color: #fff; }
.course-detail { font-size: 11px; color: rgba(255,255,255,0.6); margin-top: 2px; text-align: right; }
.course-bar { margin-bottom: 2px; }

/* 表格毛玻璃 */
:deep(.el-table) { background: transparent; color: #fff; }
:deep(.el-table th) { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.8); }
:deep(.el-table tr) { background: transparent; }
:deep(.el-table td) { background: transparent; border-bottom: 1px solid rgba(255,255,255,0.06); }
:deep(.el-table--striped .el-table__body tr.el-table__row--striped td) { background: rgba(255,255,255,0.04); }
:deep(.el-table__body tr:hover > td) { background: rgba(255,255,255,0.08) !important; }
:deep(.el-checkbox__inner) { background: transparent; border-color: rgba(255,255,255,0.3); }
:deep(.el-pagination) { --el-pagination-text-color: rgba(255,255,255,0.7); }

/* 按钮毛玻璃 */
:deep(.el-button--default) { background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.2); color: #fff; }
:deep(.el-button--default:hover) { background: rgba(255,255,255,0.2); border-color: rgba(255,255,255,0.3); }
:deep(.el-button--primary) { background: rgba(64,158,255,0.6); border-color: transparent; }
:deep(.el-button--primary:hover) { background: rgba(64,158,255,0.8); }

/* Dialog 毛玻璃 */
:deep(.el-dialog) { background: rgba(0,0,0,0.5); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.15); border-radius: 16px; }
:deep(.el-dialog__title) { color: #fff; }
:deep(.el-dialog__headerbtn .el-dialog__close) { color: rgba(255,255,255,0.6); }
:deep(.el-dialog__headerbtn:hover .el-dialog__close) { color: #fff; }
:deep(.el-dialog__body) { color: rgba(255,255,255,0.9); }

/* 标签毛玻璃 */
:deep(.el-tag) { --el-tag-bg-color: rgba(255,255,255,0.1); --el-tag-border-color: rgba(255,255,255,0.2); --el-tag-text-color: #fff; }
:deep(.el-tag--danger) { --el-tag-bg-color: rgba(245,108,108,0.3); }
:deep(.el-tag--warning) { --el-tag-bg-color: rgba(230,162,60,0.3); }
:deep(.el-tag--success) { --el-tag-bg-color: rgba(103,194,58,0.3); }
:deep(.el-tag--info) { --el-tag-bg-color: rgba(144,147,153,0.3); }

/* 分页 */
:deep(.el-pagination button) { background: transparent !important; color: rgba(255,255,255,0.7); }
:deep(.el-pager li) { background: transparent !important; color: rgba(255,255,255,0.7); }
:deep(.el-pager li.active) { color: rgba(64,158,255,0.9) !important; }
</style>
