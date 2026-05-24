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
            <el-table :data="courses" stripe size="small" max-height="360" style="width:100%" @selection-change="onSelectionChange">
              <el-table-column type="selection" width="40" />
              <el-table-column prop="title" label="课程" min-width="160" show-overflow-tooltip />
              <el-table-column prop="teacher" label="教师" width="100" />
            </el-table>
          </div>
        </div>

        <div class="col">
          <div class="panel">
            <div class="panel-header">⚙️ 刷课</div>
            <div class="config"><label>倍速</label>
              <el-radio-group v-model="speed" size="small">
                <el-radio-button :value="1">1x</el-radio-button>
                <el-radio-button :value="1.5">1.5x</el-radio-button>
                <el-radio-button :value="2">2x</el-radio-button>
              </el-radio-group>
            </div>
            <div class="config"><label>并发</label>
              <el-select v-model="jobs" size="small" style="width:100px">
                <el-option :value="1" label="1" /><el-option :value="2" label="2" />
                <el-option :value="3" label="3" /><el-option :value="5" label="5" />
              </el-select>
            </div>
            <el-button type="primary" size="large" :loading="starting" style="width:100%;margin-top:8px" @click="start">
              {{ starting ? '启动中…' : '🚀 开始刷课' }}
            </el-button>
          </div>

          <div v-if="currentTask" class="panel" style="margin-top:12px">
            <div class="panel-header">
              📊 任务 #{{ currentTask.id }}
              <el-tag :type="taskTag" size="small">{{ taskText }}</el-tag>
            </div>
            <el-progress :percentage="taskPct" :status="taskPctStatus" :stroke-width="10" />
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
const speed = ref(props.account?.defaultSpeed || 1)
const jobs = ref(props.account?.defaultJobs || 3)
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
  ({ completed:'success', failed:'danger', running:'warning' }[currentTask.value?.status] || 'info'))
const taskText = computed(() =>
  ({ completed:'✅ 完成', failed:'❌ 失败', running:'⏳ 进行中' }[currentTask.value?.status] || '等待'))
const taskPct = computed(() =>
  currentTask.value?.status === 'completed' ? 100 : currentTask.value?.status === 'failed' ? 0 : currentTask.value?.status === 'running' ? 50 : 0)
const taskPctStatus = computed(() =>
  currentTask.value?.status === 'completed' ? 'success' : currentTask.value?.status === 'failed' ? 'exception' : '')

async function loadCourses() {
  loadingCourses.value = true
  try {
    const { data } = await axios.post('/api/courses', {
      phone: props.account.phone, password: props.account.password
    })
    if (data.success) courses.value = data.courses
  } catch {} finally { loadingCourses.value = false }
}

async function loadTasks() {
  loadingTasks.value = true
  try {
    const { data } = await axios.get('/api/study/tasks')
    if (data.success) tasks.value = data.tasks
  } catch {} finally { loadingTasks.value = false }
}

async function start() {
  starting.value = true
  try {
    const { data } = await axios.post('/api/study/start', {
      phone: props.account.phone,
      password: props.account.password,
      courseIds: selectedCourses.value.length > 0 ? selectedCourses.value : null,
      speed: speed.value,
      jobs: jobs.value,
      deepseekApiKey: props.account.deepseekApiKey || '',
      deepseekModel: props.account.deepseekModel || 'deepseek-v4-flash',
      enableAnswering: props.account.enableAnswering !== false,
      autoSubmit: !!props.account.autoSubmit
    })
    if (data.success) {
      ElMessage.success('刷课任务已启动')
      currentTask.value = { id: data.taskId, status: 'running' }
      loadTasks()
      timer = setInterval(async () => {
        try {
          const r = await axios.get('/api/study/status/' + data.taskId)
          if (r.data.success && r.data.task) {
            currentTask.value = r.data.task
            if (['completed','failed'].includes(r.data.task.status)) {
              clearInterval(timer); timer = null; loadTasks()
            }
          }
        } catch {}
      }, 3000)
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

  // 检查上次是否有完成/失败的任务
  const lastNotice = localStorage.getItem('cx_last_task_notice')
  axios.get('/api/study/tasks').then(r => {
    if (!r.data.success || !r.data.tasks?.length) return
    const latest = r.data.tasks[0]
    if (!latest || !['completed','failed'].includes(latest.status)) return
    if (lastNotice === String(latest.id)) return
    localStorage.setItem('cx_last_task_notice', String(latest.id))

    if (latest.status === 'completed') {
      ElMessage.success('🎉 上次的刷课任务已完成！')
    } else {
      ElMessage.warning('⚠️ 上次的刷课任务执行失败')
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
.config { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.config label { width: 48px; color: #606266; font-size: 13px; }
.time { color: #909399; font-size: 12px; margin-top: 8px; text-align: center; }
</style>
