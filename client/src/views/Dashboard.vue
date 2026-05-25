<template>
  <div class="app">
    <header class="topbar">
      <span class="brand">🐱 CX_Kitty</span>
      <span class="user">📱 {{ account.phone }}</span>
      <el-button size="small" @click="$emit('config')">⚙️ 配置</el-button>
      <el-button size="small" @click="$emit('logout')">退出</el-button>
    </header>

    <main class="main">
      <section class="row">
        <div class="col">
          <div class="panel">
            <div class="panel-header">
              <span>📚 课程列表</span>
              <el-button size="small" @click="loadCourses" :loading="loadingCourses">🔄 刷新</el-button>
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
            <div style="font-size:13px;color:#909399;margin-bottom:16px">
              倍速 {{ account.defaultSpeed || 1 }}x · 并发 {{ account.defaultJobs || 1 }}
              <el-button link size="small" @click="$emit('config')" style="margin-left:4px">修改</el-button>
            </div>
            <el-button type="primary" size="large" :loading="starting" style="width:100%" @click="start">
              {{ starting ? '启动中…' : '🚀 开始刷课' }}
            </el-button>
          </div>

          <div v-if="currentTask" class="panel" style="margin-top:12px">
            <div class="panel-header">
              📊 任务 #{{ currentTask.id }}
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
                  />
                </div>
                <div class="course-detail">{{ cp.completed }}/{{ cp.total }} 章节</div>
              </div>
            </div>

            <!-- Fallback simple progress -->
            <div v-else>
              <el-progress :percentage="taskPct" :status="taskPctStatus" :stroke-width="12" />
            </div>

            <p class="time">{{ currentTask.started_at?.slice(0,19) }} → {{ currentTask.finished_at?.slice(0,19) || '进行中' }}</p>
          </div>
        </div>
      </section>

      <section class="panel" style="margin-top:16px">
        <div class="panel-header">
          📋 任务记录
          <el-button size="small" @click="loadTasks" :loading="loadingTasks">刷新</el-button>
        </div>
        <el-table :data="tasks" stripe size="small" max-height="240" style="width:100%">
          <el-table-column prop="id" label="#" width="50" />
          <el-table-column label="状态" width="80">
            <template #default="{row}">
              <el-tag :type="{completed:'success',failed:'danger',running:'warning',pending:'info'}[row.status]||'info'" size="small">
                {{ {completed:'完成',failed:'失败',running:'进行中',pending:'等待'}[row.status]||row.status }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="speed" label="倍速" width="60" align="center" />
          <el-table-column prop="jobs" label="并发" width="60" align="center" />
          <el-table-column prop="started_at" label="开始" min-width="140" />
          <el-table-column prop="finished_at" label="结束" min-width="140" />
        </el-table>
      </section>
    </main>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import axios from 'axios'

const props = defineProps({ account: Object })
const emit = defineEmits(['logout', 'config'])

const courses = ref([])
const selectedCourses = ref([])
const starting = ref(false)
const loadingCourses = ref(false)
const loadingTasks = ref(false)
const currentTask = ref(null)
const tasks = ref([])
let timer = null

function onSelectionChange(selection) {
  selectedCourses.value = selection.map(c => c.courseId)
}

const taskTag = computed(() =>
  ({ completed:'success', failed:'danger', running:'warning', terminated:'info' }[currentTask.value?.status] || 'info'))
const taskText = computed(() =>
  ({ completed:'✅ 完成', failed:'❌ 失败', running:'⏳ 进行中', terminated:'已终止' }[currentTask.value?.status] || '等待'))
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

onMounted(() => {
  loadCourses()
  loadTasks()
  const lastNotice = localStorage.getItem('cx_last_task_notice')
  axios.get('/api/study/tasks', {
    params: { phone: props.account.phone }
  }).then(r => {
    if (!r.data.success || !r.data.tasks?.length) return
    const latest = r.data.tasks[0]
    // Always show the latest task card
    currentTask.value = latest
    if (latest.status === 'running') {
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

onUnmounted(() => { if (timer) clearInterval(timer) })
</script>

<style scoped>
.app { min-height: 100vh; background: #f0f2f5; display: flex; flex-direction: column; }
.topbar {
  display: flex; align-items: center; gap: 12px;
  padding: 0 24px; height: 52px; background: #fff;
  border-bottom: 1px solid #e4e7ed;
}
.brand { font-weight: 600; font-size: 16px; margin-right: auto; }
.user { color: #909399; font-size: 13px; }
.main { max-width: 1000px; width: 100%; margin: 0 auto; padding: 20px; }
.row { display: flex; gap: 16px; flex-wrap: wrap; }
.col { flex: 1; min-width: 300px; }
.panel {
  background: #fff; border-radius: 12px; padding: 16px 20px;
  border: 1px solid #e4e7ed;
}
.panel-header {
  display: flex; align-items: center; justify-content: space-between;
  font-weight: 600; margin-bottom: 12px;
}
.time { color: #909399; font-size: 12px; margin-top: 8px; text-align: center; }
.course-progress { margin: 8px 0; }
.course-item { margin-bottom: 10px; }
.course-name { font-size: 13px; font-weight: 500; margin-bottom: 4px; }
.course-detail { font-size: 11px; color: #909399; margin-top: 2px; text-align: right; }
.course-bar { margin-bottom: 2px; }
</style>
