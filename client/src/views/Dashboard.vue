<template>
  <div class="app">
    <header class="topbar">
      <span class="brand">CX_Kitty</span>
      <div class="system-load">系统负载: <el-tag :type="systemLoadClass" size="small">{{ runningTaskCount }}/{{ maxTaskCount }}</el-tag></div>
      <div class="user-info">
        <div v-if="account.name" class="user-name">{{ account.name }}</div>
        <div class="user-phone">{{ account.phone }}</div>
      </div>
      <el-button size="small" @click="$emit('logout')">退出</el-button>
    </header>

    <main class="main">
      <section class="row">
        <div class="col">
          <div class="panel">
            <div class="panel-header">
              <span>课程列表</span>
              <el-button size="small" @click="loadCourses(true)" :loading="loadingCourses">刷新</el-button>
            </div>
            <el-table ref="courseTableRef" :data="courses" stripe size="small" style="width:100%" @selection-change="onSelectionChange" @select-all="onSelectAll">
              <el-table-column type="selection" width="40" />
              <el-table-column prop="title" label="课程" min-width="180" show-overflow-tooltip />
              <el-table-column prop="teacher" label="教师" width="100" />
            </el-table>
          </div>
        </div>

        <div class="col">
          <div class="panel task-log-panel">
            <div class="panel-header">
              任务日志
              <span v-if="currentTask" style="font-weight:normal;font-size:12px">
                #{{ getTaskIndex(currentTask.id) }} ·
                <el-tag :type="taskTag" size="small">{{ taskText }}</el-tag>
                <el-button v-if="currentTask.status==='running'" size="small" type="danger" plain style="margin-left:6px" @click="terminateTask(currentTask.id)">终止</el-button>
              </span>
            </div>

            <div style="display:flex;gap:8px;margin-bottom:12px">
              <el-button style="flex:1" @click="configVisible = true">配置</el-button>
              <el-button type="primary" style="flex:1" :loading="starting" :disabled="runningTaskCount >= maxTaskCount" @click="start">
                {{ starting ? '启动中…' : startBtnText }}
              </el-button>
            </div>

            <!-- 课程进度（任务存在就显示） -->
            <div v-if="currentTask" class="course-progress">
              <div class="course-item">
                <div class="course-name">{{ currentCourse?.title || taskCourseName }}</div>
                <div class="course-bar">
                  <el-progress
                    v-if="currentCourse"
                    :percentage="currentCourse.percent"
                    :status="currentCourse.finished ? 'success' : ''"
                    :stroke-width="10"
                    :show-text="false"
                  />
                  <div v-else class="waiting-bar"></div>
                </div>
                <div class="course-detail">{{ currentCourse && currentCourse.total > 0 ? (currentCourse.completed + '/' + currentCourse.total + ' 章节') : '等待中...' }}</div>
              </div>
              <div class="course-summary">课程进度: {{ courseSummary.completed }}/{{ courseSummary.total }}</div>
            </div>

            <!-- 实时日志 -->
            <div ref="logContainer" class="log-container">
              <div v-if="taskLogs.length">
                <div v-for="(log, i) in taskLogs" :key="i" class="log-line">
                  <span class="log-time">{{ log.t }}</span>
                  <span class="log-text">{{ log.text }}</span>
                </div>
              </div>
              <div v-else-if="currentTask" style="text-align:center;padding:40px 0;color:rgba(255,255,255,0.3);font-size:12px">等待任务日志...</div>
              <div v-else style="text-align:center;padding:40px 0;color:rgba(255,255,255,0.3);font-size:12px">暂无正在运行的任务</div>
            </div>
          </div>
        </div>
      </section>

      <section class="panel" style="margin-top:16px">
        <div class="panel-header">
          任务记录
          <el-button size="small" @click="loadTasks" :loading="loadingTasks">刷新</el-button>
        </div>
        <el-table :data="tasks" stripe size="small" max-height="152" style="width:100%" class="task-table">
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
              <el-button size="small" plain @click="showTaskDetail(row)">查看</el-button>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="100" align="center">
            <template #default="{row}">
              <el-button v-if="row.status==='running'" size="small" type="danger" plain @click="terminateTask(row.id)">终止</el-button>
              <el-button v-if="row.status==='terminated'" size="small" type="success" plain @click="rerunTask(row)">运行</el-button>
            </template>
          </el-table-column>
        </el-table>
      </section>
    </main>

    <footer class="footer">
      <div class="footer-line">SJYssr 2025-2026 豫ICP备2024069806号-4</div>
      <div class="footer-line">该项目如果对您造成不良后果，需要您个人承担</div>
      <div class="footer-line">一切解释权归SJYssr所有</div>
    </footer>

    <!-- 任务详情弹窗 -->
    <!-- 配置弹窗 -->
    <el-dialog v-model="configVisible" title="配置" width="90%" modal-class="config-dialog" style="max-width:420px">
      <Config :account="account" dialog-mode @enter="onConfigDone" @close="configVisible = false" />
    </el-dialog>

    <el-dialog v-model="detailVisible" title="任务课程详情" width="90%" :close-on-click-modal="true" style="max-width:500px">
      <template v-if="detailTask">
        <div style="margin-bottom:12px">
          任务 #{{ getTaskIndex(detailTask.id) }} ·
          <el-tag :type="{completed:'success',failed:'danger',running:'warning',terminated:'info'}[detailTask.status]||'info'" size="small">
            {{ {completed:'完成',failed:'失败',running:'进行中',pending:'等待',terminated:'已终止'}[detailTask.status]||detailTask.status }}
          </el-tag>
        </div>
        <div v-if="detailCourses.length" class="detail-course-list" style="max-height:400px;overflow-y:auto">
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
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
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
const maxTaskCount = ref(50)
const detailVisible = ref(false)
const detailTask = ref(null)
const courseTableRef = ref(null)
const logContainer = ref(null)
const liveLogs = ref([])
let timer = null
let loadTimer = null
let sseSource = null

const historyLogs = ref([])

async function loadHistoryLogs(taskId) {
  try {
    const { data } = await axios.get('/api/study/logs-db/' + taskId)
    if (data.success) {
      historyLogs.value = data.logs || []
    }
  } catch (e) {
    console.warn('loadHistoryLogs 失败:', e?.message || e)
  }
}

const taskLogs = computed(() => {
  // 先用独立 task_logs 表的数据
  const seen = new Set(historyLogs.value.map(l => l.time + '|' + l.text))
  const merged = historyLogs.value.map(l => ({ t: l.time, text: l.text }))
  // 合并实时日志（SSE）
  for (const l of liveLogs.value) {
    if (!seen.has(l.t + '|' + l.text)) merged.push(l)
  }
  // 按时间排序（旧的在前）— 24 小时制字符串排序即可
  merged.sort((a, b) => (a.t || '').localeCompare(b.t || ''))
  // 取最后 20 条（最新的），再反转成新在上旧在下
  return merged.slice(-20).reverse()
})

let sseReconnectTimer = null

function connectSSE(taskId) {
  loadHistoryLogs(taskId)
  if (sseSource) { sseSource.close(); sseSource = null }
  if (sseReconnectTimer) { clearTimeout(sseReconnectTimer); sseReconnectTimer = null }
  // 不清空 liveLogs，重连时保留已有日志

  const saved = JSON.parse(localStorage.getItem('cx_account') || '{}')
  const source = new EventSource('/api/study/logs/' + taskId + '?token=' + (saved.token || ''))
  source.onmessage = (e) => {
    try {
      const entry = JSON.parse(e.data)
      liveLogs.value.push(entry)
      // 限制 liveLogs 上限，防止内存泄漏
      if (liveLogs.value.length > 300) liveLogs.value = liveLogs.value.slice(-200)
    } catch {}
  }
  source.onerror = () => {
    source.close()
    // 强制重连，不管任务状态（状态由外层 sync 保证）
    sseReconnectTimer = setTimeout(() => connectSSE(taskId), 5000)
  }
  sseSource = source
}

function disconnectSSE() {
  if (sseSource) { sseSource.close(); sseSource = null }
  if (sseReconnectTimer) { clearTimeout(sseReconnectTimer); sseReconnectTimer = null }
}

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
  const idx = tasks.value.findIndex(t => String(t.id) === String(taskId))
  return idx >= 0 ? tasks.value.length - idx : '?'
}

function onConfigDone(configData) {
  Object.assign(props.account, configData)
  localStorage.setItem('cx_account', JSON.stringify({
    ...props.account,
    _expiresAt: Date.now() + 30 * 60 * 1000
  }))
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
  } catch (e) { console.warn("fetchSystemLoad:", e?.message) }
}

const systemLoadClass = computed(() =>
  runningTaskCount.value >= maxTaskCount.value ? 'danger' : 'success'
)

const startBtnText = computed(() => {
  if (starting.value) return '启动中…'
  if (runningTaskCount.value >= maxTaskCount.value) return '🚫 服务器已满'
  return '开始刷课'
})

const wasEmpty = ref(true)

function onSelectionChange(selection) {
  wasEmpty.value = selectedCourses.value.length === 0
  selectedCourses.value = selection.map(c => c.courseId)
}

function onSelectAll() {
  if (!wasEmpty.value) {
    nextTick(() => courseTableRef.value.clearSelection())
  }
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

// 当前正在进行的课程（只取第一个有进度数据的课程）
// 课程汇总：已完成课程数 / 用户选择课程数
const courseSummary = computed(() => {
  const pc = courseProgress.value
  const done = pc.filter(c => c.finished).length
  let total = 0
  if (currentTask.value) {
    let ids = currentTask.value.course_ids
    if (typeof ids === 'string') { try { ids = JSON.parse(ids) } catch { ids = [] } }
    if (Array.isArray(ids)) total = ids.length
  }
  return { completed: done, total: total || pc.length }
})

const currentCourse = computed(() => {
  const pc = courseProgress.value
  if (pc.length > 0) {
    return [...pc].sort((a, b) => {
      // 未完成的排前面
      if (a.finished !== b.finished) return a.finished ? 1 : -1
      // 余量多的排前面（进度慢的优先展示）
      return (b.total - b.completed) - (a.total - a.completed)
    })[0]
  }
  return null
})

const taskCourseName = computed(() => {
  if (!currentTask.value) return ''
  let ids = currentTask.value.course_ids
  if (typeof ids === 'string') { try { ids = JSON.parse(ids) } catch { ids = [] } }
  if (Array.isArray(ids) && ids.length && courses.value.length) {
    const c = courses.value.find(c => c.courseId === ids[0])
    if (c) return c.title
  }
  return '课程'
})

function loadCoursesFromCache() {
  if (!props.account) return false
  const key = 'cx_courses_' + props.account.phone
  const cached = localStorage.getItem(key)
  if (cached) {
    try { courses.value = JSON.parse(cached); return true } catch {}
  }
  return false
}

function saveCoursesToCache() {
  const key = 'cx_courses_' + props.account.phone
  localStorage.setItem(key, JSON.stringify(courses.value))
}

async function loadCourses(force = false) {
  if (!force && loadCoursesFromCache()) return
  loadingCourses.value = true
  try {
    const { data } = await axios.post('/api/courses', {
      password: props.account.password
    })
    if (data.success) {
      courses.value = data.courses
      selectedCourses.value = []
      saveCoursesToCache()
    }
  } catch (e) { console.warn("loadCourses:", e?.message) } finally { loadingCourses.value = false }
}

function startPolling(taskId) {
  connectSSE(taskId)
  if (timer) clearInterval(timer);
  timer = setInterval(async () => {
    try {
      const r = await axios.get('/api/study/status/' + taskId)
      if (r.data.success && r.data.task) {
        currentTask.value = r.data.task
        if (['completed','failed'].includes(r.data.task.status)) {
          clearInterval(timer); timer = null; disconnectSSE(); loadTasks()
        }
      }
    } catch (e) { console.warn("loadCourses cb:", e?.message) }
  }, 3000)
}

async function loadTasks() {
  loadingTasks.value = true
  try {
    const { data } = await axios.get('/api/study/tasks')
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
  } catch (e) { console.warn("loadTasks:", e?.message) } finally { loadingTasks.value = false }
}

async function start() {
  starting.value = true
  try {
    const { data } = await axios.post('/api/study/start', {
      password: props.account.password,
      courseIds: selectedCourses.value.length > 0 ? selectedCourses.value : null,
      speed: 1,
      jobs: 1,
      enableAnswering: props.account.enableAnswering !== false,
      autoSubmit: !!props.account.autoSubmit
    })
    if (data.success) {
      ElMessage.success('刷课任务已启动')
      currentTask.value = {
        id: data.taskId,
        status: 'running',
        course_ids: selectedCourses.value.length > 0 ? selectedCourses.value : null
      }
      loadTasks()
      startPolling(data.taskId)
    } else {
      ElMessage.error(data.message || '启动失败')
    }
  } catch (err) {
    ElMessage.error('启动失败: ' + (err.response?.data?.message || err.message))
  } finally { starting.value = false }
}

async function rerunTask(task) {
  let courseIds = task.course_ids
  if (typeof courseIds === 'string') { try { courseIds = JSON.parse(courseIds) } catch { courseIds = [] } }
  if (!Array.isArray(courseIds) || !courseIds.length) {
    ElMessage.warning('该任务没有课程数据，请重新选择课程')
    return
  }
  starting.value = true
  try {
    const { data } = await axios.post('/api/study/start', {
      password: props.account.password,
      courseIds,
      speed: 1,
      jobs: 1,
      enableAnswering: props.account.enableAnswering !== false,
      autoSubmit: !!props.account.autoSubmit
    })
    if (data.success) {
      ElMessage.success('任务已重新启动')
      currentTask.value = { id: data.taskId, status: 'running', course_ids: courseIds }
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
        disconnectSSE()
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
  loadTimer = setInterval(fetchSystemLoad, 1000)
  const lastNotice = localStorage.getItem('cx_last_task_notice')
  axios.get('/api/study/tasks').then(r => {
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

watch(() => props.account, (acct) => {
  if (acct) loadCourses()
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
  if (loadTimer) clearInterval(loadTimer)
  disconnectSSE()
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
.brand { font-weight: 700; font-size: 16px; color: #fff; }
.user-info { display: flex; flex-direction: column; align-items: flex-start; margin-left: auto; }
.user-name { color: rgba(255,255,255,0.9); font-size: 13px; line-height: 1.3; }
.user-phone { color: rgba(255,255,255,0.5); font-size: 13px; line-height: 1.3; }
.system-load { color: rgba(255,255,255,0.6); font-size: 13px; display: flex; align-items: center; gap: 6px; white-space: nowrap; }
.main { max-width: 1000px; width: 100%; margin: 0 auto; padding: 20px; flex: 1; }
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
.task-log-panel { height: 470px; display: flex; flex-direction: column; overflow: hidden; }
.course-progress { flex-shrink: 0; }
.log-container { flex: 1; min-height: 0; overflow-y: auto; font-size: 12px; line-height: 1.6; }
.log-line { padding: 1px 0; }
.log-time { color: rgba(255,255,255,0.4); margin-right: 8px; }
.log-text { color: rgba(255,255,255,0.85); }

.detail-course-item { padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); }
.detail-course-item:last-child { border-bottom: none; }
.detail-course-title { font-size: 14px; font-weight: 500; color: #fff; }
.detail-course-meta { font-size: 12px; color: rgba(255,255,255,0.6); margin-top: 2px; }

.time { color: rgba(255,255,255,0.6); font-size: 12px; margin-top: 8px; text-align: center; }
.course-progress { flex-shrink: 0; margin: 8px 0; }
.course-item { margin-bottom: 10px; }
.course-name { font-size: 13px; font-weight: 500; margin-bottom: 4px; color: #fff; }
.course-detail { font-size: 11px; color: rgba(255,255,255,0.6); margin-top: 2px; text-align: right; }
.course-bar { margin-bottom: 2px; }
.waiting-bar { height: 10px; border-radius: 5px; background: rgba(255,255,255,0.06); }
.course-summary { font-size: 11px; color: rgba(255,255,255,0.5); text-align: right; margin-top: 2px; }

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
:deep(.el-overlay) { background: transparent; }
:deep(.el-dialog) {
  background: rgba(255,255,255,0.12);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.15);
}
:deep(.el-dialog__title) { color: #fff; }
:deep(.el-dialog__header) { border-bottom: 1px solid rgba(255,255,255,0.08); padding: 16px 24px; }
:deep(.el-dialog__headerbtn .el-dialog__close) { color: rgba(255,255,255,0.6); }
:deep(.el-dialog__headerbtn:hover .el-dialog__close) { color: #fff; }
:deep(.el-dialog__body) { padding: 20px 24px; color: rgba(255,255,255,0.9); }

/* 标签毛玻璃 */
:deep(.el-tag) { --el-tag-bg-color: rgba(255,255,255,0.1); --el-tag-border-color: rgba(255,255,255,0.2); --el-tag-text-color: #fff; }
:deep(.el-tag--danger) { --el-tag-bg-color: rgba(245,108,108,0.3); }
:deep(.el-tag--warning) { --el-tag-bg-color: rgba(230,162,60,0.3); }
:deep(.el-tag--success) { --el-tag-bg-color: rgba(103,194,58,0.3); }
:deep(.el-tag--info) { --el-tag-bg-color: rgba(144,147,153,0.3); }

/* 滚动条统一风格 */
.detail-course-list::-webkit-scrollbar,
.el-table__body-wrapper::-webkit-scrollbar,
.log-container::-webkit-scrollbar { width: 6px; height: 6px; }
.detail-course-list::-webkit-scrollbar-thumb,
.el-table__body-wrapper::-webkit-scrollbar-thumb,
.log-container::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.25); border-radius: 3px; }
.detail-course-list::-webkit-scrollbar-track,
.el-table__body-wrapper::-webkit-scrollbar-track,
.log-container::-webkit-scrollbar-track { background: transparent; }

/* 底部声明 */
.footer { padding: 12px 0; text-align: center; }
.footer-line { color: rgba(255,255,255,0.45); font-size: 12px; line-height: 1.8; }
/* 分页 */
:deep(.el-pagination button) { background: transparent !important; color: rgba(255,255,255,0.7); }
:deep(.el-pager li) { background: transparent !important; color: rgba(255,255,255,0.7); }
:deep(.el-pager li.active) { color: rgba(64,158,255,0.9) !important; }
</style>
