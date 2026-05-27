# CX_Kitty — 超星学习通全自动刷课系统 架构与教程

> **作者：师靖宇**  
> **版本：1.3+**  
> **GitHub：** [https://github.com/SJYssr/CX_Kitty](https://github.com/SJYssr/CX_Kitty)  
> **许可证：GPL-3.0**

---

## 一、项目概述

CX_Kitty 是一个基于 Node.js 的超星学习通全自动刷课工具，纯 API 驱动，无浏览器依赖。支持：
- ✅ 多账号并发刷课
- ✅ 自动观看视频（支持倍速）
- ✅ AI 自动答题（DeepSeek，支持题型：单选/多选/判断/填空/简答）
- ✅ 自动提交答案
- ✅ 人脸识别自动处理
- ✅ 字体加密自动解密
- ✅ 实时进度推送（SSE）
- ✅ 邮箱通知
- ✅ Web 管理界面（Vue 3 + Element Plus）

### 技术栈

| 层级 | 技术 |
|------|------|
| 语言 | Node.js (ESM) |
| 核心 HTTP | axios + axios-cookiejar-support + tough-cookie |
| 字体解析 | opentype.js + fontkit |
| HTML 解析 | cheerio |
| AI 答题 | DeepSeek API (兼容 OpenAI 格式) |
| 答案缓存 | better-sqlite3 (WAL 模式) |
| Web 框架 | Express |
| 数据库 | MySQL 8.0 |
| 前端 | Vue 3 + Vite + Element Plus |
| 实时通信 | Server-Sent Events (SSE) |

### 项目规模统计

| 目录 | 文件数 | 代码行数 |
|------|--------|----------|
| `src/` (核心库) | ~15 | ~2300 |
| `server/` (后端服务) | ~8 | ~1200 |
| `client/` (前端) | ~3 | ~1100 |
| 总计 | ~26 | ~4300 |

---

## 二、项目架构总览

```
CX_Kitty/
├── src/                          # 🧠 核心库（CLI + Server 共用）
│   ├── index.js                  #     CLI 入口
│   ├── config.js                 #     全局配置
│   ├── core/                     #     ── 核心模块
│   │   ├── chaoxing.js           #         Chaoxing 总类（门面模式）
│   │   ├── auth.js               #         登录与会话
│   │   ├── course.js             #         课程/章节/任务获取
│   │   ├── session.js            #         Session 管理器
│   │   ├── cipher.js             #         AES/MD5 加密
│   │   ├── ratelimiter.js        #         请求频率控制器
│   │   ├── factory.js            #         工厂方法（CLI vs Server）
│   │   ├── study-result.js       #         返回值枚举
│   │   ├── face-detection.js     #         人脸识别自动化
│   │   ├── video-handler.js      #         视频处理
│   │   └── work-handler.js       #         答题处理（核心算法）
│   ├── tasks/                    #     ── 任务调度
│   │   ├── processor.js          #         JobProcessor（章节并发调度器）
│   │   ├── work.js               #         答题任务包装
│   │   ├── video.js              #         视频任务包装
│   │   ├── document.js           #         文档任务包装
│   │   └── read.js               #         阅读任务包装
│   ├── decoders/                 #     ── HTML 解析器
│   │   ├── course-list.js        #         课程列表解析
│   │   ├── course-point.js       #         章节列表解析
│   │   ├── course-card.js        #         知识卡片（任务列表）解析
│   │   └── questions.js          #         答题页面解析（含字体解密）
│   ├── tiku/                     #     ── 题库系统
│   │   ├── tiku.js               #         题库基类 + CacheDAO
│   │   ├── deepseek.js           #         DeepSeek AI 答题实现
│   │   └── font-decrypt.js       #         TTF 字形哈希匹配解密
│   ├── notify/                   #     ── 通知
│   │   └── email.js              #         邮件发送
│   └── utils/                    #     ── 工具
│       ├── logger.js             #         日志
│       ├── progress-bar.js       #         CLI 进度条
│       └── font-decoder.js       #         opentype.js 字体解码器
│
├── server/                       # 🌐 Web 服务端
│   ├── src/
│   │   ├── index.js              #     Express 入口
│   │   ├── db.js                 #     MySQL 连接池
│   │   ├── study-runner.js       #     进程内刷课运行器
│   │   ├── log-bus.js            #     SSE 日志事件总线
│   │   ├── verify-code.js        #     邮箱验证码
│   │   ├── captcha.js            #     图形验证码
│   │   ├── error.js              #     错误安全化
│   │   ├── routes/
│   │   │   ├── auth.js           #     登录/注册/验证码
│   │   │   ├── account.js        #     账号配置 CRUD
│   │   │   ├── study.js          #     刷课任务 API + SSE
│   │   │   ├── courses.js        #     课程查询
│   │   │   └── system.js         #     系统状态
│   │   ├── models/
│   │   │   ├── account.js        #     accounts 表 DAO
│   │   │   └── study-task.js     #     study_tasks DAO
│   │   └── middleware/
│   │       └── auth.js           #     session_token 认证
│   ├── schema.sql                #     数据库 DDL
│   └── init.sql                  #     Docker 初始化脚本
│
├── client/                       # 🎨 Vue 3 前端
│   ├── src/
│   │   ├── App.vue               #     根组件
│   │   ├── main.js               #     入口
│   │   ├── router.js             #     路由
│   │   └── views/
│   │       ├── Login.vue         #     登录页
│   │       ├── Dashboard.vue     #     刷课面板（主界面）
│   │       └── Config.vue        #     配置页
│   └── vite.config.js            #     Vite 配置
│
├── package.json                  #     依赖（含 server 端所需）
├── docker-compose.yml            #     Docker 部署
├── Dockerfile
└── faces/                        #     人脸图片存储
    └── {puid}.jpg                #     格式：{超星用户UID}.jpg
```

---

## 三、核心模块详解

### 3.1 模块依赖关系图

```
┌──────────────────────────────────────────────────────────┐
│                      CLI (src/index.js)                   │
│  ┌─────────────────────────────────────────────────────┐  │
│  │  parseArgs() → initTiku() → createShared()         │  │
│  │    → login() → getCourseList() → JobProcessor.run() │  │
│  └─────────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────┤
│                   Server (server/src/index.js)            │
│  ┌─────────────────────────────────────────────────────┐  │
│  │  Express() → routes → study-runner.runStudy()      │  │
│  │      → createStandalone() → (同CLI流程)              │  │
│  └─────────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────┤
│                    Chaoxing 门面类                         │
│  ┌─────────────────────────────────────────────────────┐  │
│  │  login → auth.js                                    │  │
│  │  getCourseList → course.js → course-list.js         │  │
│  │  getCoursePoint → course.js → course-point.js       │  │
│  │  getJobList → course.js → course-card.js            │  │
│  │  studyVideo → video-handler.js                      │  │
│  │  studyWork → work-handler.js → questions.js         │  │
│  │  fetchFace → face-detection.js                      │  │
│  └─────────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────┤
│                    Tiku 题库层                             │
│  ┌─────────────────────────────────────────────────────┐  │
│  │  TikuCache (SQLite) → TikuDeepSeek → DeepSeek API  │  │
│  │                              ↑                      │  │
│  │                   font-decrypt.js (字体解密)         │  │
│  └─────────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────┤
│                    JobProcessor 调度层                      │
│  ┌─────────────────────────────────────────────────────┐  │
│  │  chapterPoints → batch(并发) → _processChapter()   │  │
│  │    → getJobList() → _processJob()                   │  │
│  │      → processVideo / processWork / processDocument │  │
│  └─────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### 3.2 数据流

```
用户请求 (Web/CLI)
    │
    ▼
注册/登录 ──→ 超星API认证 ──→ 获取会话Cookie
    │
    ▼
获取课程列表 ──→ 解析HTML → 结构化课程数据
    │
    ▼
获取章节列表 ──→ 解析HTML → [章节1, 章节2, ...]
    │
    ▼
JobProcessor — 并发调度
    │
    ├── 视频章节 → video-handler → 模拟播放 → 心跳上报
    ├── 答题章节 → work-handler → DeepSeek答题 → 提交答案
    ├── 文档章节 → 标记完成
    └── 阅读章节 → 标记完成
    │
    ▼
进度上报 → 数据库 → SSE推送到前端
    │
    ▼
全部完成 → 邮箱通知
```

---

## 四、核心算法详解

### 4.1 答题流程（work-handler.js）

```
studyWork(cx, course, job, jobInfo)
  │
  ├─ 1. 请求答题页面
  │   GET /mooc-ans/api/work?workId=xxx
  │   ↓
  │   HTML 含表单数据 + 题目列表 + 加密字体(TTF base64)
  │
  ├─ 2. 解析题目 (parseQuestions → questions.js)
  │   ├── 提取表单字段 (input name/value)
  │   ├── 提取题目列表 (div.singleQuesId)
  │   │   ├── questionId, title, options[], type
  │   │   └── 题型: 0=单选, 1=多选, 2=填空, 3=判断, 4=简答
  │   └── 字体解密 (如有 TTF)
  │       └── decodeFontText() → opentype.js 解析 → MD5 hash → font_map_table.json 匹配
  │
  ├─ 3. 第一遍：查询答案
  │   for each question:
  │     result = await cx.tiku.query({ title, options, type })
  │     └── TikuDeepSeek.query()
  │         ├── 先查 SQLite 缓存 (CacheDAO.get)
  │         ├── 未命中 → DeepSeek API
  │         │   ├── 构建 Prompt（含乱码还原 _ungarble）
  │         │   ├── 调用 POST /v1/chat/completions
  │         │   ├── 解析 JSON 响应
  │         │   └── 写入缓存 (CacheDAO.set)
  │         └── 返回 { answer }
  │
  ├─ 4. 第二遍：匹配答案
  │   for each (q, answer):
  │     ├── 判断题 → judgementSelect() (正向/负向词表)
  │     ├── 填空/简答 → 直接填入
  │     ├── 多选题 → matchAnswerToMultipleOptions()
  │     │   ├── 裸字母提取 "AB" → ["A","B"]
  │     │   ├── 拆分匹配 (按分隔符)
  │     │   └── 子序列/相似度兜底
  │     └── 单选题 → matchAnswerToOption()
  │         ├── 裸字母 "A" → A
  │         ├── 精确/包含匹配（原文 + 去前缀后）
  │         ├── 子序列匹配 (isSubsequence)
  │         └── SequenceMatcher 相似度兜底 (>0.8)
  │
  ├─ 5. 提交决策
  │   coverage = matchedCount / totalQuestions
  │   shouldSubmit = SUBMIT && coverage >= COVER_RATE
  │   pyFlag = shouldSubmit ? '' : '1' (1=仅保存)
  │   未匹配题 → 随机答案填充 (仅提交模式)
  │
  └─ 6. 提交答案
      POST /mooc-ans/work/addStudentWorkNew
      formData: { answerwqbid, answer{id}, answertype{id}, pyFlag }
      ↓
      返回 { status: true/false, msg: "success!" }
```

#### 4.1.1 答案匹配策略（matchAnswerToOption）

```
输入: answer="从公共关系的角度", options=["从公共关系的角度来理解", "A.xxx", ...]

1️⃣ 裸字母匹配
   "A" → A  ✅ (最简路径)

2️⃣ 精确/包含匹配（原文）
   "从公共关系的角度" → options[0] 包含 → A ✅

3️⃣ 精确/包含匹配（去选项字母前缀后）
   "从公共关系的角度" → strip("A.从公共关系的角度来理解") = "从公共关系的角度来理解"
   "从公共关系的角度" 是子串 → A ✅

4️⃣ 子序列匹配 (isSubsequence)
   "公关系" → "从公共关系的角度来理解" 中按序出现 → A ✅

5️⃣ SequenceMatcher 相似度
   normalize("从公共关系的角度") vs normalize("从公共关系的角度来理解")
   → ratio ≈ 0.91 > 0.8 → A ✅
```

#### 4.1.2 DeepSeek Prompt 模板

```
【单选题】
题目：公共关系的本质是什么？
选项：
A. 一种管理职能
B. 一种传播活动
C. 一种人际关系
D. 以上都是

请以JSON格式输出正确答案，格式如下：
{"Answer": ["A"]}
只输出一个选项字母（A/B/C/D），不要输出选项内容。
```

---

### 4.2 字体解密体系

CX_Kitty 使用**双字体解密引擎**：

```
超星学习通使用自定义字体替换文字 → 浏览器正常显示，爬虫看到乱码

解法流程：

HTML 中包含 @font-face { src: url(data:font/ttf;base64,...) }

1️⃣ 提取 TTF → Buffer
2️⃣ 双引擎并联解密：

   ┌─────────────────────────────────────────────┐
   │ 引擎 A: opentype.js (src/utils/font-decoder) │
   │   → font2map(): 解析 TTF glyph → MD5 hash   │
   │   → font_map_table.json (30k+ 预置映射)     │
   │   → decrypt(): hash 查表 → 还原 unicode     │
   │   → 康熙部首替换表                           │
   └─────────────────────────────────────────────┘

   ┌─────────────────────────────────────────────┐
   │ 引擎 B: fontkit (src/tiku/font-decrypt.js)   │
   │   → font2map(): fontkit 解析 → MD5 hash      │
   │   → 同一 font_map_table.json                 │
   │   → decrypt() → 康熙部首替换                  │
   └─────────────────────────────────────────────┘

3️⃣ tiku._ungarble() 兜底还原
   └── 形近字映射表 + 异体字映射表（200+ 映射对）

4️⃣ 双引擎结果取优
```

**参考来源：**
- 本方案借鉴了 [Samueli924/chaoxing](https://github.com/Samueli924/chaoxing) 项目（Python）的字体解密思路
- Python 版使用 `fontTools` 解析 TTF，JS 版用 `opentype.js` / `fontkit`，但核心算法一致
- 均使用 `font_map_table.json` 预置映射表（字形轮廓 MD5 hash → unicode）

---

### 4.3 视频播放模拟

```
studyVideo(cx, course, job, jobInfo, speed, type)
  │
  ├─ 1. 解析 otherInfo 获取 rt (报告时间间隔)
  │
  ├─ 2. 获取视频 token
  │   POST /ananas/upload/uploadInitInfo → { token }
  │
  ├─ 3. 循环心跳上报
  │   while (playingTime < duration):
  │     GET /ananas/job/completevideo
  │     enc = MD5([clazzId][userid][jobid][objectId][playingTime*1000][salt][duration*1000][0_duration])
  │     playingTime += rt (报告间隔)
  │     delay = rt * 1000 / speed (倍速控制)
  │     └── 人脸识别拦截器透明处理
  │
  └─ 4. 完成
```

---

### 4.4 人脸识别自动化

```
请求拦截 → isFaceCheckPage() 检测
  │ 特征：body.grayBg + script 包含 /knowledge/startface
  │
  ▼
parseFaceCheckParams() → { classId, courseId, knowledgeId, cpi }
  │
  ▼
resolveFaceDetection()
  ├─ 1. ensureFaceImage()
  │   ├── 本地查找 faces/{uid}.jpg
  │   ├── 未找到 → fetchPreUploadedFace() 从超星拉取
  │   └── 下载保存
  ├─ 2. getUploadToken() → 云盘 token
  ├─ 3. uploadFaceImage()
  │   ├── 读取本地图片
  │   ├── 添加随机 LSB 噪声（破坏文件 hash 防风控）
  │   └── 上传到超星云盘 → objectId
  └─ 4. 提交人脸识别
      ├── 新接口 POST /facephoto/clientfacecheckstatus
      └── 失败 → 旧接口 POST /uploadInfo（降级）
```

---

### 4.5 乱码还原策略 (`_ungarble`)

超星使用形近字替换来防爬，`_ungarble` 通过三层还原：

```
输入乱码文本
  │
  ├─ 第一层：字体解密 (TTF hash 匹配)
  │   └── 需要当前页面 TTF 字体数据
  │
  ├─ 第二层：异体字统一 (variantMap)
  │   ⻛→风, ⻔→门, ⻋→车, ⻢→马, ㄬ→广
  │
  └─ 第三层：形近字映射表 (g2o, 200+ 对)
      啽→业, 啾→文, 啻→的, 喀→一, 喁→说...
      臣→自, 赤→身, 皿→目, 血→行...
      冇→有, 叧→另, 宐→宜, 寙→宿...
```

---

## 五、数据库设计

### 5.1 accounts 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT PK AUTO | 主键 |
| phone | VARCHAR(20) UNIQUE | 手机号 |
| password | VARCHAR(255) | 密码 |
| name | VARCHAR(100) | 超星真实姓名 |
| puid | INT | 超星用户 PUID |
| sex | TINYINT | 性别（-1=未知, 0=女, 1=男） |
| school | VARCHAR(255) | 学校名称 |
| stu_id | VARCHAR(50) | 学号 |
| cookie_data | TEXT | Cookie（未启用） |
| status | VARCHAR(20) | active/disabled |
| deepseek_api_key | VARCHAR(255) | 用户自定义 API Key |
| deepseek_model | VARCHAR(50) | 模型名 |
| enable_answering | TINYINT(1) | 答题开关 |
| auto_submit | TINYINT(1) | 自动提交开关 |
| cover_rate | FLOAT | 最低答题覆盖率 |
| notify_email | VARCHAR(128) UNIQUE | 通知邮箱 |
| default_speed | DECIMAL(3,1) | 默认视频倍速 |
| default_jobs | INT | 默认并发数 |
| session_token | VARCHAR(64) | 登录令牌（顶号策略） |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

### 5.2 study_tasks 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT PK AUTO | 主键 |
| account_id | INT FK | 关联 accounts.id |
| course_ids | JSON | 课程ID数组 |
| speed | DECIMAL(3,1) | 倍速 |
| jobs | INT | 并发数 |
| status | VARCHAR(20) | pending/running/completed/failed/terminated |
| progress | JSON | 进度数据（含 logs 数组 + courses 进度） |
| error | TEXT | 错误信息 |
| started_at | DATETIME | 开始时间 |
| finished_at | DATETIME | 结束时间 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

### 5.3 task_logs 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT PK AUTO | 主键 |
| task_id | INT FK | 关联 study_tasks.id |
| time | VARCHAR(20) | 日志时间（HH:mm:ss） |
| text | TEXT | 日志内容 |
| created_at | DATETIME | 创建时间 |

### 5.4 答案缓存（SQLite）

文件位置：`data/cache.db`

表结构：
```sql
CREATE TABLE answer_cache (
  key TEXT PRIMARY KEY,       -- {title}::{options.join('|')}
  answer TEXT NOT NULL,       -- JSON 序列化的答案
  type TEXT,                  -- 题型
  created_at TEXT             -- 创建时间
);
```

---

## 六、API 接口文档

### 6.1 公开接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| GET | `/api/captcha` | 获取图形验证码 |
| POST | `/api/login` | 登录 |
| POST | `/api/register` | 注册 |
| POST | `/api/send-verify-code` | 发送邮箱验证码 |
| GET | `/api/auth/verify` | 验证 token 有效性 |

### 6.2 需要认证的接口

认证方式：`Authorization: Bearer {session_token}`

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/account/save` | 保存账号配置 |
| GET | `/api/account/config` | 获取账号配置 |
| POST | `/api/account/info` | 获取/刷新超星个人信息 |
| POST | `/api/courses` | 获取课程列表 |
| POST | `/api/study/start` | 启动刷课任务 |
| GET | `/api/study/status/:taskId` | 查询任务状态 |
| POST | `/api/study/terminate/:taskId` | 终止任务 |
| GET | `/api/study/tasks` | 获取历史任务列表 |
| GET | `/api/study/logs/:taskId` | SSE 实时日志流 |
| GET | `/api/study/logs-db/:taskId` | 获取历史日志 |
| GET | `/api/system/task-count` | 系统负载 |
| GET | `/api/balance` | DeepSeek 余额查询 |

---

## 七、部署教程

### 7.1 前置要求

- Node.js >= 18（推荐 20+）
- MySQL 8.0+
- npm / pnpm

### 7.2 快速部署（Docker）

```bash
# 1. 克隆
git clone https://github.com/SJYssr/CX_Kitty.git
cd CX_Kitty

# 2. 配置环境变量
cp .env.example .env  # 编辑 .env 填入配置

# 3. Docker 部署
docker compose up -d
```

### 7.3 手动部署

```bash
# 1. 安装依赖
npm install

# 2. 创建数据库
mysql -u root -p
source server/schema.sql

# 3. 配置环境
cat > .env << EOF
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=cx_kitty
PORT=3001
EOF

# 4. 构建前端
cd client && npm install && npm run build && cd ..

# 5. 启动服务
npm run server
# 或使用 PM2 / systemd 后台运行
```

### 7.4 systemd 服务配置

```ini
[Unit]
Description=CX_Kitty Server
After=network.target mysql.service

[Service]
Type=simple
User=root
WorkingDirectory=/root/CX_Kitty
ExecStart=/usr/bin/node server/src/index.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

### 7.5 Nginx 反向代理

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_buffering off;  # SSE 必需
    }
}
```

### 7.6 CLI 使用

```bash
# 基础用法
DEEPSEEK_API_KEY=sk-xxx node src/index.js -u 13800138000 -p mypassword

# 指定课程 + 倍速 + 并发
DEEPSEEK_API_KEY=sk-xxx node src/index.js \
  -u 13800138000 -p mypassword \
  -l 12345678,87654321 \
  -s 2 -j 5 --tk-submit

# 配置文件模式
DEEPSEEK_API_KEY=sk-xxx node src/index.js -c config.json
```

---

## 八、配置说明

### 8.1 核心配置 (src/config.js)

```javascript
export default {
  AESKey: "u2oh6Vu^HWe4_AES",     // AES 加密密钥
  encSalt: "d_yHJ!$pdA~5",        // 视频心跳 MD5 盐值
  rateLimit: 1200,                 // 单任务请求间隔 (ms)
  globalThrottle: 200,             // 全局请求间隔 (ms)
  maxRetries: 3,                   // 网络错误最大重试次数
  retryBaseDelay: 1500,           // 重试基础延迟 (ms)
  cacheMaxRecords: 10000,         // 答案缓存最大记录数
  cachePruneCount: 2000,          // 每次清理数量
  sessionTimeoutMs: 30 * 60 * 1000, // Cookie 会话超时
  defaultJobs: 3,                 // 默认并发
  defaultSpeed: 1,                // 默认倍速
  faceImagePath: './faces',       // 人脸图片目录
  fetchUploadedFace: true,        // 是否自动拉取预上传人脸
};
```

### 8.2 环境变量 (.env)

```ini
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=cx_kitty
PORT=3001
SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_USER=cx_kitty@foxmail.com
SMTP_PASS=your_smtp_password
SMTP_FROM=CX_Kitty <cx_kitty@foxmail.com>
```

---

## 九、代码质量保障

### 9.1 单元测试 (Vitetest)

项目使用 `vitest` 进行单元测试，测试覆盖主要核心模块：

```bash
# 运行所有测试
npm test

# 监听模式
npm run test:watch
```

测试文件位于 `src/__tests__/`，覆盖：
- `chaoxing-core.test.js` — Chaoxing 核心模块
- `cipher.test.js` — 加密工具
- `deepseek.test.js` — DeepSeek API 交互
- `ratelimiter.test.js` — 频率限制器
- `study-result.test.js` — 返回码枚举
- `tiku.test.js` — 题库缓存与查询

### 9.2 架构演进

项目经历了多次重大重构，演进路线清晰可见于 git 提交历史：

```
早期: 单体架构 → 所有代码在一个文件中
 ↓
中期: 模块拆分 → auth/course/video 独立模块 + DAO 层
 ↓
现在: 委托模式 + 工厂模式 + 事件驱动
      - Chaoxing 类 → 门面模式，方法委托给独立模块
      - createStandalone/createShared → 工厂方法
      - EventEmitter → SSE 实时日志
      - 串行化锁 → 进度写入原子性
```

---

## 十、常见问题

### Q1: 登录显示"学习通账号或密码错误"

**原因：** 注册时先验证超星账号密码再写入数据库，如果超星账号密码不对会直接返回错误。

**解决：** 确认超星学习通 APP 能正常登录。

### Q2: 答题显示"覆盖率不足，仅保存" 

**原因：** `auto_submit` 关闭，或者 `cover_rate` 设置过高导致 AI 匹配题数未达标。

**解决：** 在配置页开启「自动提交」或降低「最低覆盖率」。

### Q3: 服务报 `ERR_MODULE_NOT_FOUND`

**原因：** `server/package.json` 中缺少依赖声明（常见于旧版本）。

**解决：** 在 `server/package.json` 的 dependencies 中添加：
```json
{
  "axios": "^1.7.0",
  "axios-cookiejar-support": "^7.0.0",
  "tough-cookie": "^6.0.1",
  "svg-captcha": "^1.4.0",
  "nodemailer": "^8.0.9"
}
```
然后运行 `npm install`。

### Q4: 人脸识别失败

**原因：** 未在 faces/ 目录放置人脸图片，或超星未预上传人脸。

**解决：**
1. 在超星学习通 APP 中上传人脸照片
2. 或手动将人脸照片命名为 `{puid}.jpg` 放入 `faces/` 目录

### Q5: 字体解密失败，题目显示乱码

**原因：** 超星更新了字体映射表，预置的 `font_map_table.json` 不匹配。

**解决：** 更新 `font_map_table.json` 或查看最新代码。

---

## 十一、致谢

本项目的答题算法、乱码还原、人脸识别等核心逻辑参考了以下开源项目：

- [Samueli924/chaoxing](https://github.com/Samueli924/chaoxing) — Python 版超星刷课工具（核心参考）
- [SocialSisterYi/xuexiaoyi-to-xuexitong-tampermonkey-proxy](https://github.com/SocialSisterYi/xuexiaoyi-to-xuexitong-tampermonkey-proxy) — 加密字体解密参考
- [SocialSisterYi/CxKitty](https://github.com/SocialSisterYi/CxKitty) — 人脸识别等 Python 实现参考

---

> **作者：师靖宇**  
> **GitHub：** [https://github.com/SJYssr/CX_Kitty](https://github.com/SJYssr/CX_Kitty)  
> **许可证：** GPL-3.0 — 允许开源使用和修改，禁止闭源商业发布
