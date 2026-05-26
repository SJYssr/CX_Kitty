# CX_Kitty 🐱

超星学习通自动化工具 — 纯 API 驱动，无浏览器依赖。

```
语言: JavaScript (ESM) · Vue 3        测试: Vitest (67 tests)
运行时: Node.js 24+                   数据库: MySQL 8.0 + SQLite
部署: Docker / systemd                AI: DeepSeek API
```

## ✨ 功能

- ✅ **自动刷课** — 视频、文档、阅读任务自动完成
- ✅ **自动答题** — 集成 DeepSeek AI，支持单选/多选/判断/填空/简答
- ✅ **字体解密** — 自动还原超星防爬字符替换，准确答题
- ✅ **自动提交** — 支持仅保存 / 自动提交两种模式
- ✅ **实时日志** — SSE 推送 + 独立日志表，随时查看任务进度
- ✅ **多账号隔离** — 独立 Cookie 会话，互不干扰
- ✅ **限流保护** — 双层限流器，避免被封
- ✅ **Web 管理界面** — Vue 3 + Element Plus 毛玻璃 UI
- ✅ **Docker 部署** — 一键 docker-compose up

## 🚀 快速开始

### Docker 部署（推荐）

```bash
git clone https://github.com/SJYssr/CX_Kitty.git
cd CX_Kitty
echo "DB_PASSWORD=your_password" > .env
docker compose up -d
```

访问 `http://localhost:3001` 打开管理界面。

### 直接运行

```bash
git clone https://github.com/SJYssr/CX_Kitty.git
cd CX_Kitty
npm ci && cd server && npm ci && cd .. && cd client && npm ci && cd ..
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS cx_kitty CHARACTER SET utf8mb4;"
mysql -u root -p cx_kitty < server/init.sql
cp .env.example .env  # 配置 DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, PORT
cd client && npm run build && cd ..
node server/src/index.js
```

## 🖥️ 管理界面

启动后浏览器打开 `http://localhost:3001`：

1. 输入学习通手机号和密码登录
2. 勾选要刷的课程
3. 点击右上角 **配置**，设置 DeepSeek API Key
4. 开启 **答题开关** 和 **自动提交**
5. 点击 **开始刷课**

### 配置说明

| 配置项 | 说明 |
|--------|------|
| DeepSeek API Key | 必填，用于 AI 答题 |
| 模型 | `deepseek-v4-flash`（快）/ `deepseek-v4-pro`（准） |
| 答题开关 | 是否启用 AI 答题 |
| 自动提交 | 保存模式 / 提交模式（建议开启） |

## 🧪 测试

```bash
npm test
```

```
7 测试文件 · 67 测试 · 全部通过

tiku.test.js           21 tests  CacheDAO/Tiku基类/judgementSelect
deepseek.test.js       18 tests  Prompt构建/答案解析
chaoxing-core.test.js   7 tests  login/video/work (mock HTTP)
chaoxing.test.js        8 tests  构造参数/工具方法
cipher.test.js          7 tests  AES/MD5签名/时间戳
ratelimiter.test.js     4 tests  限流器
study-result.test.js    2 tests  状态常量
```

---

## 🏗️ 架构总览

### 完整项目结构

```
CX_Kitty/
├── src/                           # 核心引擎 (~2300 行)
│   ├── core/                      # 超星 API 交互层
│   │   ├── chaoxing.js           # [691行] 门面类: 登录/课程/任务调度
│   │   ├── video-handler.js      # [193行] 视频处理: 心跳/状态/下载处理
│   │   ├── work-handler.js       # [162行] 答题: 页面获取/解析/答案提交
│   │   ├── cipher.js             # 加密: AES加解密/MD5签名/时间戳
│   │   ├── session.js            # [单例] Cookie会话管理 + 持久化
│   │   ├── ratelimiter.js        # 请求限流器: 间隔控制 + 随机抖动
│   │   └── study-result.js       # 任务/章节状态常量
│   ├── tasks/                    # 任务调度分发 (薄委托层)
│   │   ├── processor.js          # JobProcessor: 章节并发 + 任务分发
│   │   ├── video.js              # → 委托 chaoxing.studyVideo
│   │   ├── work.js               # → 委托 chaoxing.studyWork
│   │   ├── document.js           # → 委托 chaoxing.studyDocument
│   │   └── read.js               # → 委托 chaoxing.studyRead
│   ├── tiku/                     # AI 答题引擎
│   │   ├── tiku.js               # 题库基类 + CacheDAO (SQLite缓存)
│   │   ├── deepseek.js           # DeepSeek AI: Prompt构建/API调用/答案解析
│   │   ├── font-decrypt.js       # 字体解密: TTF解析+字形哈希+映射还原
│   │   └── font_map_table.json   # [30885条] 预计算字形hash→Unicode映射
│   ├── decoders/                 # HTML 解析器
│   │   ├── questions.js          # 答题页面HTML → 结构化题目数据
│   │   ├── course-list.js        # 课程列表HTML → 课程数组
│   │   ├── course-point.js       # 章节列表HTML → 章节点数组
│   │   └── course-card.js        # 任务卡片HTML → 任务列表
│   └── utils/
│       ├── logger.js             # 日志工具 (等级控制)
│       └── progress-bar.js       # 视频进度条渲染
│
├── server/                       # Web 服务端 (~550 行)
│   ├── src/
│   │   ├── index.js              # Express 入口: 静态托管 + 全局路由
│   │   ├── db.js                 # MySQL 连接池 (mysql2/promise)
│   │   ├── study-runner.js       # 刷课任务运行器: runStudy()
│   │   ├── log-bus.js            # SSE EventEmitter 日志总线
│   │   └── routes/
│   │       ├── study.js          # 13 条 API: 登录/课程/任务/日志
│   │       └── account.js        # 3 条 API: 账号保存/配置/信息
│   └── init.sql                  # 数据库建表 DDL
│
├── client/                       # Web 前端 (~800 行 Vue 3)
│   ├── src/
│   │   ├── App.vue               # 根组件: 路由切换(Login/Dashboard)
│   │   ├── main.js               # 入口: 挂载 Element Plus
│   │   └── views/
│   │       ├── Login.vue         # 登录页: 系统负载 + 登录表单
│   │       ├── Dashboard.vue     # 控制面板: 课程列表/任务日志/SSE
│   │       └── Config.vue        # 配置弹窗: API Key/模型/答题开关
│   └── vite.config.js            # Vite 构建配置 (proxy /api)
│
├── Dockerfile                    # 多阶段构建: 前端编译 + Node 生产
├── docker-compose.yml            # MySQL 8.0 + Node 服务编排
├── package.json                  # 依赖: axios/cheerio/opentype.js 等
└── README.md
```

### 核心类图

```
┌─────────────────────────────────────────────────────────┐
│                    Chaoxing (门面)                       │
│  src/core/chaoxing.js · 691 行                          │
├─────────────────────────────────────────────────────────┤
│  login(loginWithCookies)     → {status, uid}            │
│  getCourseList()             → Course[]                 │
│  getCoursePoint(cid,clazzId) → {points}                 │
│  getJobList(course,point)    → {jobs, jobInfo}          │
│  studyVideo(...)             → videoHandler(this, ...)  │
│  studyWork(...)              → workHandler(this, ...)   │
│  studyDocument/studyRead/studyEmptyPage                 │
├─────────────────────────────────────────────────────────┤
│  Uses: SessionManager · RateLimiter · Tiku · cfg        │
└─────────────────────────────────────────────────────────┘
          │                          │
          ▼                          ▼
┌─────────────────────┐   ┌─────────────────────┐
│ video-handler.js    │   │ work-handler.js      │
│ 193 行              │   │ 162 行               │
├─────────────────────┤   ├─────────────────────┤
│ studyVideo()        │   │ studyWork()          │
│ _getVideoStatus()   │   │ _fetchWorkPage()     │
│ videoProgressLog()  │   │ _randomAnswer()      │
│ _completeDownload() │   │ _mapAnswerToIndex()  │
└─────────────────────┘   └─────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  Tiku (抽象基类)  ←──  TikuDeepSeek                      │
│  src/tiku/tiku.js          src/tiku/deepseek.js          │
├─────────────────────────────────────────────────────────┤
│  query() / judgementSelect() / _validateAnswer()         │
│  _buildPrompt() / _query() / _ungarble() / setFont()    │
│                                                         │
│  CacheDAO: SQLite 缓存 (WAL 模式, 超10000条自动清理)     │
└─────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────┐
│  font-decrypt.js (141 行)                                │
├─────────────────────────────────────────────────────────┤
│  font2map(fontData) → {uniXXXX: md5hash}                │
│    └ opentype.js 解析 TTF → 轮廓坐标 MD5                │
│  decrypt(glyfMap, garbled) → 解密文本                    │
│    └ font_map_table.json (30885条) + 康熙部首替换       │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  JobProcessor (任务调度器)                                │
│  src/tasks/processor.js                                  │
├─────────────────────────────────────────────────────────┤
│  run() → 章节级并发                                      │
│  _processChapter() → _processJob() → processVideo/Work   │
│  并发模型: 按 jobs 分批 Promise.all + 章节间 3-8s 延迟   │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  SessionManager (单例)   RateLimiter (限流器)            │
├─────────────────────────────────────────────────────────┤
│  getInstance() → axios + CookieJar  | 实例级: 1200ms    │
│  saveCookies() 文件持久化        | 全局级: 200ms       │
│                                 | 随机抖动: 0-2000ms    │
└─────────────────────────────────────────────────────────┘
```

### 数据库设计

```sql
accounts        账号及 AI 配置
├─ id PK, phone UNIQUE, password(bcrypt)
├─ deepseek_api_key, deepseek_model
├─ enable_answering, auto_submit

study_tasks     刷课任务记录
├─ id PK, account_id FK
├─ course_ids JSON, progress JSON
├─ status (running/terminated/completed/failed)

task_logs       任务日志 (独立表)
├─ id PK, task_id FK
├─ time (24h: "HH:mm:ss"), text
```

## 📡 API 路由 (16 条)

### 超星代理

| 方法 | 路由 | 说明 |
|------|------|------|
| POST | `/api/login` | 超星密码登录 |
| POST | `/api/courses` | 获取课程列表 |
| POST | `/api/account/info` | 刷新用户信息 |

### 任务管理

| 方法 | 路由 | 说明 |
|------|------|------|
| POST | `/api/study/start` | 创建刷课任务 |
| GET | `/api/study/status/:taskId` | 任务状态/进度 |
| POST | `/api/study/terminate/:taskId` | 终止任务 (AbortController) |
| GET | `/api/study/tasks` | 历史任务列表 |

### 日志

| 方法 | 路由 | 说明 |
|------|------|------|
| GET | `/api/study/logs/:taskId` | SSE 实时日志流 |
| GET | `/api/study/logs-db/:taskId` | task_logs 表历史日志 |

### 账号配置

| 方法 | 路由 | 说明 |
|------|------|------|
| POST | `/api/account/save` | 保存配置 |
| GET | `/api/account/config` | 读取配置 (Key掩码返回) |

### 系统

| 方法 | 路由 | 说明 |
|------|------|------|
| GET | `/api/system/task-count` | 运行中任务数 |
| GET | `/api/health` | 健康检查 |
| GET | `/api/balance` | DeepSeek 余额 |

## 🔄 数据流：刷课任务完整链路

```
用户点击"开始刷课"
  ↓ POST /api/study/start
  ↓ 从 DB 读取 accounts 配置 (答题开关/自动提交/模型/Key)
  ↓ INSERT study_tasks (status=running)
  ↓ runStudy()
     ├→ 创建独立 CookieJar + axios (多账号隔离)
     ├→ 创建 AbortController (任务取消)
     ├→ login() → 超星登录
     ├→ getCourseList() → 获取课程
     └→ for each course:
          ├→ getCoursePoint() → 章节列表
          └→ JobProcessor.run()
               └→ for each chapter (并发 batch):
                    ├→ getJobList() → parseCourseCard(html)
                    ├→ processVideo() → video-handler.js
                    │    └─ while(true) 心跳上报
                    ├→ processWork() → work-handler.js
                    │    ├─ 提取 @font-face → 字体解密
                    │    ├─ parseQuestions() → DeepSeek 答题
                    │    └─ 提交答案
                    ├→ processDocument/Read
                    └→ _sendLog() → writeProgress()
                         ├→ bus.emit('log:'+taskId) → SSE → 前端
                         ├→ INSERT INTO task_logs
                         └→ UPDATE progress
```

## 🔤 字体解密管道

```
超星 HTML @font-face { src: url(data:font/woff;base64,...) }
  ↓ setFont(fontBase64)
  ↓ font2map(fontData) — opentype.js 解析 TTF
  ↓ 遍历每个字形 → 轮廓坐标拼接 → MD5 hash
  ↓ 查 font_map_table.json (30885条)
  ↓ 还原真实 Unicode → 康熙部首替换 → 干净文本
```

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| 运行时 | Node.js 24+ |
| 数据库 | MySQL 8.0 + SQLite（缓存） |
| 前端 | Vue 3 + Vite + Element Plus |
| 后端 | Express |
| AI | DeepSeek API |
| 字体解析 | opentype.js |
| 部署 | Docker + docker-compose / systemd |

## 🧩 关键技术决策

| 决策 | 方案 | 理由 |
|------|------|------|
| API 驱动 | 原生 HTTP + Cookie | 无浏览器依赖, 轻量快速 |
| 字体反爬 | TTF 轮廓哈希 + opentype.js | 通用方案, 不依赖手动映射 |
| 缓存 | SQLite WAL | 比 JSON 文件安全, 支持并发 |
| 限流 | 双层 RateLimiter | 实例级 + 全局级, 避免被封 |
| 日志 | SSE + 独立 task_logs 表 | 实时推送 + 持久化查询 |
| 配置 | 服务端 DB 存储 | 安全(Key不暴露) + 一致 |
| 多账号 | 独立 CookieJar | 不串号 |
| 架构 | 门面 + 策略 + 观察者 | 可扩展, 可测试 |

## ⚠️ 注意事项

- 答题使用 DeepSeek API，需要自行注册获取 API Key
- 视频播放默认 1 倍速，较长视频需耐心等待
- 请合理使用，避免对超星服务器造成压力
- 本项目仅供学习交流，禁止用于盈利
