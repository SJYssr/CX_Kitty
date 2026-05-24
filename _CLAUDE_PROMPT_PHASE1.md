# CX_Kitty Phase 1 — 核心刷课流程实现

## 任务目标

基于 [Samueli924/chaoxing](https://github.com/Samueli924/chaoxing) 的刷课逻辑，用 Node.js 重写核心刷课流程到 CX_Kitty 项目。

**项目路径**: `/root/.openclaw/workspace/CX_Kitty`
**现有文件**: `config.js`, `src/api.js`, `src/crypto.js`, `src/video.js`, `src/index.js`
**分析文档**: `_ARCH_ANALYSIS.md`

## 你需要做什么

> **注意：** 所有对项目文件的修改请直接使用 Node.js 标准方式实现，无需使用 npx 或包管理器外的额外工具。
> **不需要** 手动测试运行 — 写完整、正确的代码即可。

### 依赖检查
首先看 package.json 缺少什么，用 npm install 补上。

### 需要实现/重写的模块

现有代码有基础骨架但不完整，需要按以下设计重写：

#### 1. `src/core/chaoxing.js` — Chaoxing API 核心类

参照 `api/base.py` (Python)，实现完整的 Chaoxing 类：

```javascript
class Chaoxing {
  constructor(account, tiku, options)
  
  // 登录
  async login(loginWithCookies = false)
  async _validateCookieSession()
  
  // 课程
  async getCourseList()  // POST courselistdata, 同时处理二级文件夹
  async getCoursePoint(courseId, clazzId, cpi)  // GET studentcourse
  
  // 任务
  async getJobList(course, point)  // GET /knowledge/cards, num=0~6
  
  // 工具
  getFid()
  getUid()
  getEnc(clazzId, jobid, objectId, playingTime, duration)
  
  // 视频心跳
  async videoProgressLog(session, course, job, jobInfo, dtoken, duration, playingTime, type='Video')
  
  // 视频状态刷新
  async _refreshVideoStatus(session, job, type)
  async _recoverAfterForbidden(session, job, type)
  
  // 学习
  async studyVideo(course, job, jobInfo, speed = 1.0, type = 'Video')
  async studyDocument(course, job)
  async studyWork(course, job, jobInfo)
  async studyRead(course, job, jobInfo)
  async studyEmptyPage(course, point)
  
  // 签到
  async getActivityList(course)
  async preSign(course, activityId)
  async signInNormal(course, activityId, ...)
}
```

**关键细节**:

- **SessionManager**: 单例模式，复用 axios instance + cookie jar (已有基础，需要完善)
- **getCourseList**: 先用 POST courselistdata 获取主课表，再 GET /interaction 获取二级文件夹，对每个文件夹再 POST courselistdata 获取子课程
- **getJobList**: 循环参数 num=0~6 调用 GET /knowledge/cards，合并结果；从 HTML 的 `mArg={...}` 提取 JSON；检查 `notOpen`
- **getEnc (MD5)**: `[{clazzId}][{userid}][{jobid}][{objectId}][{playingTime*1000}][d_yHJ!$pdA~5][{duration*1000}][0_{duration}]`
- **videoProgressLog**: 封装心跳请求，处理 rt 参数 (从 otherInfo 提取 `-rt_d`→0.9, `-rt_1`→1)，处理 faceCaptureEnc/attDuration/attDurationEnc 附加字段，处理 403 状态
- **refreshVideoStatus**: GET /ananas/status/{objectId}?k={fid}&flag=normal
- **recoverAfterForbidden**: 更新 session cookies 后刷新视频状态

**headers**:
```javascript
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36",
  "sec-ch-ua": '"Chromium";v="118", "Google Chrome";v="118", "Not=A?Brand";v="99"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"'
};
const VIDEO_HEADERS = { Referer: "https://mooc1.chaoxing.com/ananas/modules/video/index.html?v=2025-0725-1842" };
const AUDIO_HEADERS = { Referer: "https://mooc1.chaoxing.com/ananas/modules/audio/index_new.html?v=2025-0725-1842" };
```

#### 2. `src/core/session.js` — 会话管理器 (完善现有)

```javascript
class SessionManager {
  getInstance()
  getSession()  // 返回 axios instance
  updateCookies()  // 从文件重新加载 cookies
}
```

**添加持久化**: 支持从 JSON 文件加载/保存 cookies

#### 3. `src/core/cipher.js` — AES 加密 (已有, 移到新位置)

```javascript
export function aesEncrypt(plaintext)  // AES-128-CBC, key=iv="u2oh6Vu^HWe4_AES", pkcs7 padding
```

#### 4. `src/tasks/video.js` — 视频处理 (重写)

参照 Python 的 `study_video()` 方法：

```
流程:
1. GET /ananas/status/{objectId} → 获取 dtoken, duration, crc, key
2. 先发一次完整进度的日志上报 (isdrag=4)，如果返回 isPassed=true 则直接成功
3. 循环:
   a. 如果 playTime - lastLogTime >= waitTime (随机30-90s) 或 playTime == duration:
      - 调 videoProgressLog 上报当前进度
      - 如果返回 403: 尝试 _recoverAfterForbidden, 最多2次
      - 如果返回 isPassed: 退出循环
   b. dt = (当前时间 - 上次迭代时间) * speed
   c. playTime += dt, playTime = min(duration, playTime)
   d. 更新进度条
   e. sleep(1s)
```

**进度条**: 使用 `cli-progress` 或手动渲染，格式: `任务名 |████████████████████| 60% 01:30/02:30`

**403 重试**: 最多2次, 每次间隔 2-4s, 刷新 session cookies + 调用 refreshVideoStatus

#### 5. `src/tasks/document.js` — 文档处理

```javascript
// GET /ananas/job/document?jobid={jobid}&knowledgeid={提取自otherInfo}&courseid={courseId}&clazzid={clazzId}&jtoken={jtoken}&_dc={timestamp}
// status 200 → SUCCESS, 其他 → ERROR
```

#### 6. `src/decoders/course-list.js` — 课程列表解析

使用 cheerio 解析 HTML:
```javascript
// 提取 div.course.clearfix → { id, clazzId, courseId, cpi, title, desc, teacher }
```

#### 7. `src/decoders/course-point.js` — 章节列表解析

```javascript
// div.chapter_unit → li → div[id^=cur] → { id, title, jobCount, has_finished, need_unlock }
```

#### 8. `src/decoders/course-card.js` — 任务卡片解析

```javascript
// 从 HTML 提取 mArg={...} 中的 JSON
// 解析 attachments: 按 type 分类 (video/document/workid/read/live)
// 提取 job_info: defaults 中的 ktoken, mtEnc, reportTimeInterval, knowledgeid 等
// 每个附件处理: otherInfo 清理 (只保留 & 之前的部分), type 判断
```

#### 9. `src/tasks/processor.js` — 任务处理器（队列）

参照 `main.py` 的 JobProcessor:

```javascript
class JobProcessor {
  constructor(chaoxing, course, tasks, config)
  run()  // 启动 worker 线程 + retry 线程
  
  // 使用 async 队列实现 (p-queue 或简单数组)
  // worker: 从队列取 task → processChapter → 按结果分派
  // 每个 chapter 内部: 用 Promise.all 并行处理所有 jobs
}
```

NOT_OPEN 策略:
- retry: 重试最多5次, 把任务放回 retryQueue
- continue: 直接标记完成跳过
- ask: 询问用户 (可以后面再实现, 先 retry)

#### 10. `src/core/ratelimiter.js` — 速率限制

```javascript
class RateLimiter {
  constructor(interval)  // 毫秒
  async limit(options)  // options: random(min, max) 额外随机等待
}
```

#### 11. `src/core/study-result.js` — 结果枚举

```javascript
const StudyResult = { SUCCESS, FORBIDDEN, ERROR, TIMEOUT };
ChapterResult = { SUCCESS, ERROR, NOT_OPEN, PENDING };
```

#### 12. `src/index.js` — 主入口 (重写)

主流程:
```
1. 解析参数 (简单 CLI, 支持 -u phone -p pwd -c config.json -l courseIds -s speed)
2. 加载配置
3. 创建 Chaoxing 实例
4. login()
5. getCourseList() → filterCourses()
6. 对每个课程: processCourse()
7. processCourse: getCoursePoint → JobProcessor → run
8. 完成通知
```

---

## 依赖包 (package.json)

需要添加的依赖:
- **axios**: ^1.7.0 (已有)
- **axios-cookiejar-support**: ^7.0.0 (已有)
- **tough-cookie**: ^6.0.1 (已有)
- **cheerio**: ^1.0.0 (已有)
- **cli-progress**: ^3.x (进度条)
- **ora**: ^8.x (加载动画, 可选)

不需要的依赖 (和 Python 对应的部分在 Node 里不需要):
- ~~p-limit~~ (用 Promise.all 替代并发)
- ~~p-queue~~ (用简单数组+Promise替代)

---

## 代码风格

- ES Module (import/export)
- async/await
- JSDoc 注释
- 每个文件有明确的职责划分
- 错误处理: try/catch + 重试机制

---

## 重要注意事项

1. **session 管理**: 必须复用 cookies, 不要每次请求都新建 session
2. **速率限制**: 普通请求 0.5s 间隔, 视频心跳 2s 间隔 (参照 Python)
3. **403 处理**: 视频心跳可能返回 403, 需要重试 + 刷新 session
4. **rt 参数**: 从 otherInfo 的 `-rt_d` 提取, 必须正确传递
5. **字体解码**: 本题不涉及, 放到 Phase 2
6. **不修改 config.js**: 这个文件被 .gitignore 了, 有自己的密码

---

### 开始实现

1. 先检查 package.json, 安装缺失依赖
2. 按上述顺序实现每个模块
3. 不需要测试运行

完成后告诉我 Phase 1 完成, 可以进入 Phase 2 (答题系统 + 题库)。
