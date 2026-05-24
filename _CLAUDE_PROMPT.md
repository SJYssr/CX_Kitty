# CX_Kitty — 完整刷课流程实现

## 任务目标

基于 [Samueli924/chaoxing](https://github.com/Samueli924/chaoxing) (Python) 的刷课逻辑，用 **Node.js** 重写完整功能到 CX_Kitty 项目。

**项目路径**: `/root/.openclaw/workspace/CX_Kitty`
**分析文档**: `/root/.openclaw/workspace/CX_Kitty/_ARCH_ANALYSIS.md`

**现有文件**:
- `package.json` — 已有 axios, cheerio, axios-cookiejar-support, tough-cookie, jsdom
- `src/api.js` — 登录 / AES / 课程列表
- `src/crypto.js` — getEnc(MD5) / getTimestamp
- `src/video.js` — session/课程卡片/视频心跳
- `src/index.js` — 简陋CLI入口
- `src/config.js` — headers 常量
- `config.js` — 用户配置 (已 .gitignore)

## 核心要求

**⚠️ 全部用 ES Module (import/export)**
**⚠️ 全部用 async/await**
**⚠️ 现有 src/api.js / src/crypto.js / src/video.js 中的代码可以作为参考，但需要按新架构拆分重构**
**⚠️ 每实现一个模块都要写 JSDoc 注释**
**⚠️ 不需要测试运行，写完整正确的代码即可**

---

## 目录结构

```
CX_Kitty/
├── package.json             (已有，补依赖)
├── config.js                (已有，不改)
├── cookies.json             (cookie持久化，新建)
├── cache.json               (题库答案缓存，新建)
│
└── src/
    ├── index.js             (重写: 主入口)
    │
    ├── core/
    │   ├── session.js       (SessionManager 单例)
    │   ├── cipher.js        (AES加密)
    │   ├── ratelimiter.js   (速率限制)
    │   ├── study-result.js  (枚举常量)
    │   └── chaoxing.js      (Chaoxing API 总类)
    │
    ├── tasks/
    │   ├── video.js         (完整视频模拟观看)
    │   ├── document.js      (文档任务)
    │   ├── read.js          (阅读任务)
    │   ├── work.js          (答题任务,含题目解析+题库+提交)
    │   └── processor.js     (JobProcessor 队列+并行+重试)
    │
    ├── decoders/
    │   ├── course-list.js   (课程列表 HTML → JSON)
    │   ├── course-point.js  (章节列表 HTML → JSON)
    │   ├── course-card.js   (任务卡片 mArg JSON 提取)
    │   └── questions.js     (题目 HTML → 结构化数据)
    │
    ├── tiku/
    │   ├── tiku.js           (基类 + Registry + CacheDAO)
    │   ├── yanxi.js          (TikuYanxi 言溪题库)
    │   └── tiku-go.js        (TikuGo GO题库)
    │
    └── utils/
        ├── logger.js         (日志)
        └── progress-bar.js   (进度条)
```

---

## 模块详细实现

### 1. `src/core/session.js` — SessionManager

```javascript
// 单例设计
class SessionManager {
  static getInstance()
  static getSession()    // 返回 axios instance (带 cookie jar)
  static updateCookies() // 从文件重载 cookies
  static setToken(token) // 设置 Authorization token (未来用)
}
```

**Cookie 持久化**: `cookies.json` 格式 `[{"key":"","value":"","domain":"chaoxing.com",...}]`
使用 `tough-cookie` 的 CookieJar，持久化到文件。

**headers 引**: 从已有 `src/config.js` 引用

### 2. `src/core/cipher.js` — AES 加密

```javascript
// AES-128-CBC PKCS7
// Key = IV = "u2oh6Vu^HWe4_AES" (utf8)
export function aesEncrypt(plaintext)  // 返回 base64
export function aesDecrypt(ciphertext) // 可选
```

使用 Node.js 内置 `crypto` 模块:
```javascript
const key = Buffer.from("u2oh6Vu^HWe4_AES", "utf8");
const cipher = crypto.createCipheriv("aes-128-cbc", key, key); // iv=key
```

### 3. `src/core/ratelimiter.js` — 速率限制

```javascript
class RateLimiter {
  constructor(minInterval)  // 毫秒单位
  async acquire(options)    // options.random: {min, max} 额外随机等待
  // lastCall 时间追踪
  // 不足间隔则 await sleep
}
```

### 4. `src/core/study-result.js` — 常量

```javascript
export const StudyResult = Object.freeze({
  SUCCESS: 0,
  FORBIDDEN: 1,
  ERROR: 2,
  TIMEOUT: 3
});

export const ChapterResult = Object.freeze({
  SUCCESS: 0,
  ERROR: 1,
  NOT_OPEN: 2,
  PENDING: 3
});
```

### 5. `src/core/chaoxing.js` — Chaoxing API 总类（核心）

参照 `api/base.py` 的 Chaoxing 类。这是最核心的模块。

```javascript
export class Chaoxing {
  constructor(account, tiku, options)
  
  // ===== 登录 =====
  async login(loginWithCookies = false)
  // loginWithCookies=true: 直接用cookies验证，失败则fallback到账号密码
  // loginWithCookies=false: POST passport2.chaoxing.com/fanyalogin
  //   参数: { fid: -1, uname: aesEncrypt(phone), password: aesEncrypt(pwd), ... }
  //   成功后: save_cookies, update cookies in session
  //   返回: { status: true/false, msg: "..." }

  async _validateCookieSession()
  // 检查 _uid cookie 是否存在
  // POST mooc2-ans.chaoxing.com/mooc2-ans/visit/courselistdata 验证
  // 返回 body 中不包含 "login"/"passport2" 则有效
  
  // ===== 工具 =====
  getFid()    // 从 cookie "fid" 获取, 默认 "4311" (就是原来的1024, 后来发现fid可能是别的值)
  getUid()    // 从 cookie "_uid" 或 "UID" 获取
  
  getEnc(clazzId, userid, jobid, objectId, playingTime, duration)
  // MD5: [{clazzId}][{userid}][{jobid}][{objectId}][{playingTime*1000}][d_yHJ!$pdA~5][{duration*1000}][0_{duration}]
  
  getTimestamp()
  // String(Date.now())
  
  // ===== 课程 =====
  async getCourseList()
  // 1. POST courselistdata (courseType=1, courseFolderId=0) → 解析HTML
  // 2. GET /visit/interaction → 解析二级文件夹
  // 3. 遍历文件夹，POST courselistdata（courseFolderId=文件夹id）
  // 返回: [{ clazzId, courseId, cpi, title, desc, teacher }]
  
  async getCoursePoint(courseId, clazzId, cpi)
  // GET /mooc2-ans/mycourse/studentcourse?courseid=&clazzid=&cpi=&ut=s
  // 解析HTML → { hasLocked, points: [{id, title, jobCount, has_finished, need_unlock}] }
  
  async getJobList(course, point)
  // 循环 num=0~6, GET /knowledge/cards?clazzid=&courseid=&knowledgeid=&num=X&ut=s&cpi=&v=2025-0424-1038-3&mooc2=1
  // 从HTML提取 mArg={...} 中的 JSON
  // 检查 "章节未开放"
  // 返回: { jobs: [...], jobInfo: {...}, notOpen: bool }
  
  // jobInfo 结构: { ktoken, mtEnc, reportTimeInterval, defenc, cardid, cpi, qnenc, knowledgeid }
  
  // 每个 job:
  // { type, jobid, otherinfo, objectid, name, playTime, rt, jtoken, mid, aid,
  //   attDuration, attDurationEnc, videoFaceCaptureEnc }
  
  // ===== 视频心跳 =====
  async videoProgressLog(course, job, jobInfo, dtoken, duration, playingTime, type='Video', isdrag=3)
  // 打包参数:
  // { clazzId, playingTime, duration, clipTime: `0_${duration}`, objectId, otherInfo, courseId, jobid, userid, isdrag, view:'pc', enc, dtype:type, _t:timestamp }
  // 附加字段: videoFaceCaptureEnc, attDuration, attDurationEnc (如果有)
  // 
  // rt参数处理:
  // - 从 job.rt 获取 (已在getJobList时解析)
  //   或从 otherInfo 中 `-rt_d`→0.9, `-rt_1`→1
  // - 有rt: 带rt发一次
  // - 无rt: 先试0.9再试1
  //
  // GET /mooc-ans/multimedia/log/a/{cpi}/{dtoken}?params...
  // 返回: { passed: isPassed, status: statusCode }
  
  async _refreshVideoStatus(job, type='Video')
  // GET /ananas/status/{objectId}?k={fid}&flag=normal
  // 返回: { dtoken, duration } 或 null
  
  async _recoverAfterForbidden(job, type='Video')
  // 1. update session cookies
  // 2. refreshVideoStatus
  // 3. 如果失败且密码存在: re-login → updateCookies → refreshVideoStatus
  
  // ===== 学习任务 =====
  async studyVideo(course, job, jobInfo, speed=1, type='Video')
  // 核心刷课循环:
  // 1. GET /ananas/status/{objectId} → dtoken, duration, crc, key
  // 2. 先发一次完整进度 (playingTime=duration, isdrag=4)
  //    如果 isPassed → 返回 SUCCESS
  // 3. 循环:
  //    playTime = job.playTime / 1000 (已有播放进度)
  //    waitTime = randomInt(30, 90) (随机上报间隔)
  //    lastLogTime = 0
  //    while !passed:
  //      if (playTime - lastLogTime >= waitTime || playTime == duration):
  //        → videoProgressLog
  //          如果 403: _recoverAfterForbidden, 最多2次
  //          如果 passed: break
  //      dt = (now - lastIter) * speed
  //      playTime = min(duration, playTime + dt)
  //      更新进度条
  //      sleep 1s
  // 4. 成功 → StudyResult.SUCCESS
  //
  // 进度条: 使用 cli-progress 或手动渲染
  // 格式: "任务名 |████████████| 60% 01:30/02:30"
  
  async studyDocument(course, job)
  // GET /ananas/job/document?jobid=&knowledgeid=&courseid=&clazzid=&jtoken=&_dc=
  // 200 → SUCCESS, else → ERROR
  
  async studyRead(course, job, jobInfo)
  // 阅读任务: 和文档类似，GET 完成标记
  // 具体看 card.type="read" 时的处理
  
  async studyWork(course, job, jobInfo)
  // 看下面 tasks/work.js 的详细说明
  
  async studyEmptyPage(course, point)
  // 处理空章节 (没有任务但标记了进度的)
  
  // ===== 签到 (可选) =====
  async getActivityList(course)
  async signIn(course, activityId)
}
```

### 6. `src/tasks/video.js` — 视频任务

见上面 Chaoxing.studyVideo 的逻辑。
**需要**:
- 完整的 while 循环上报
- 随机间隔 30-90s
- 403 恢复 (最多2次)
- rt 参数 (0.9 / 1) 循环测试
- 进度条显示
- 音频类型支持 (dtype=Audio)

### 7. `src/tasks/document.js` — 文档任务

简单 GET 请求完成标记。见上面 studyDocument。

### 8. `src/tasks/read.js` — 阅读任务

阅读任务处理。从 card 类型识别，GET 请求标记完成。
具体看 `api/decode.py` 中 `_process_read_task` 的逻辑：
```javascript
// type=read 且 property.read 不存在的任务
// GET 相应 URL 标记完成
```

### 9. `src/tasks/work.js` — 答题任务 (最复杂)

参照 `api/base.py` 的 `study_work` 方法。

**流程**:
```
1. 如果题库未启用 → 返回 SUCCESS (跳过)
2. GET /mooc-ans/api/work?courseid=&clazzid=&knowledgeid=&... → 获取题目页面HTML
3. 解析HTML → 提取题目列表 + 表单数据
4. 对每个题目:
   a. 提取 title, options, type (single/multiple/judgement/completion)
   b. 调用 tiku.query({title, options, type}) → 获取答案
   c. 如果获取到答案:
      - 匹配选项 (单选: 选项首字母, 多选: sorted字母组合)
      - 判断题: true/false 映射
      - 填空题: 直接填
   d. 如果获取不到 → 随机选择答案
5. 计算覆盖率 (foundQuestions / totalQuestions * 100%)
6. 提交模式:
   - submit=true 且覆盖率>=cover_rate: 直接提交 (pyFlag="")
   - 否则: 保存不提交 (pyFlag="1")
7. POST /mooc-ans/api/work 提交答案
8. 检查响应状态 → SUCCESS/ERROR
9. 如果没提交但章节需要解锁 → 回滚重试 (rollback)
```

**题目解析** (`decoders/questions.js`):
```javascript
// 使用 cheerio 解析 HTML
// form → input 提取表单字段
// div.singleQuesId → 每个题目:
//   data属性 → questionId
//   div.TiMu → data → 题型代码 (0/1/2/3/4)
//   div.Zy_TItle → 题目文本
//   ul > li → 选项列表 (先尝试 aria-label, 再 getText)
//   排序选项
// 返回: { formData, questions: [{id, title, options, type, answerField}] }
```

**题型映射**:
```
0 → single (单选题)
1 → multiple (多选题)
2 → completion (填空题)
3 → judgement (判断题)
4 → shortanswer (简答题)
```

### 10. `src/tasks/processor.js` — JobProcessor (任务调度器)

参照 `main.py` 的 JobProcessor + `process_chapter` + `process_job`。

```javascript
class JobProcessor {
  constructor(chaoxing, course, chapterPoints, config)
  // config: { speed, jobs (parallel count), notopenAction }
  
  async run()
  // 主流程:
  // 1. 创建所有 chapterTask
  // 2. 并发执行 (Promise.all 限制 jobs 数量)
  //    同一个 chapter 内的所有 jobs 可以同时处理
  // 3. 每个 chapter:
  //    a. getJobList(course, point)
  //    b. 如果 notOpen:
  //       - notopenAction = retry: 加入重试队列 (最多5次)
  //       - notopenAction = continue: 跳过
  //    c. 对每个 job: processJob
  //       - video → studyVideo
  //       - document → studyDocument
  //       - workid → studyWork
  //       - read → studyRead
  // 4. 重试队列: 延迟后重新尝试
  // 5. 所有完成 → 返回
}
```

### 11. `src/decoders/course-list.js` — 课程列表解析

```javascript
import * as cheerio from 'cheerio';
// 使用 cheerio 解析 HTML
// 选择器: div.course.clearfix
// 提取: 
//   id: attrs.id
//   clazzId: input.clazzId → val
//   courseId: input.courseId → val
//   cpi: a[href] → regex /cpi=(.*?)&/
//   title: span.course-name → attr title
//   desc: p.margint10 → attr title
//   teacher: p.color3 → attr title
// 跳过: a.not-open-tip 或 div.not-open-tip
```

### 12. `src/decoders/course-point.js` — 章节列表解析

```javascript
// div.chapter_unit → 每个章节单元
// li → 每个章节节点
// div[id^=cur] → 
//   id: regex /^cur(\d+)$/
//   title: a.clicktitle → text
//   jobCount: input.knowledgeJobCount → val (默认为1)
//   need_unlock: span.bntHoverTips 包含 "解锁"
//   has_finished: span.bntHoverTips 包含 "已完成"
// 返回: { hasLocked, points: [...] }
```

### 13. `src/decoders/course-card.js` — 任务卡片解析

```javascript
// 从 HTML 中正则提取 mArg={...}
// JSON parse
// data.attachments → 遍历每个附件
// data.defaults → jobInfo

// 每个附件处理:
// 1. 跳过 isPassed=true 的
// 2. job 为 null → 尝试 read 任务
// 3. 清理 otherInfo: .split('&')[0] (移除 courseId 等)
// 4. type 判断:
//    - video → 提取 { type, jobid, name, otherinfo, mid, objectid, aid, playTime, rt, attDuration, attDurationEnc, videoFaceCaptureEnc }
//    - document → { type, jobid, otherinfo, jtoken, mid, enc, aid, objectid }
//    - workid → { type, jobid, otherinfo, mid, enc, aid }
//    - read → { type, title, id, jobid, jtoken, mid, otherinfo, enc, aid }
//    - live → { type, jobid, name, otherinfo, property, mid, objectid, aid, liveId, streamName }
// 5. 返回: { jobs: [...], jobInfo: {...} }
```

### 14. `src/tiku/tiku.js` — 题库基类

参照 `api/answer.py`。

```javascript
// CacheDAO — JSON 文件缓存，线程安全
class CacheDAO {
  constructor(file = 'cache.json')
  async get(question)  // 返回答案或 null
  async set(question, answer)  // 写入缓存
}

// Tiku 基类
class Tiku {
  DISABLE = false
  SUBMIT = false     // 提交模式
  COVER_RATE = 0.8   // 最低覆盖率
  trueList = ['正确','对','√','是']    // 判断题正确选项
  falseList = ['错误','错','×','否','不对','不正确']  // 判断题错误选项
  
  constructor(name, api, token)
  
  initTiku(config)      // 初始化: 设置SUBMIT/COVER_RATE/trueList/falseList
  async query(qInfo)    // 查询题库: 先去缓存, 再去provider
    // qInfo: { title, options, type }
    // 预处理: 去除题目编号, 分数后缀
    // 缓存命中 → 返回
    // 调用 _query → 校验答案类型 → 缓存 → 返回
  
  async _query(qInfo)   // 子类实现
  judgementSelect(answer)  // 判断题: 匹配 trueList/falseList
  
  getSubmitParams()     // SUBMIT=true → "" (直接提交), false → "1" (保存不提交)
}

// Provider Registry
const PROVIDER_REGISTRY = {
  TikuYanxi: TikuYanxi,
  TikuGo: TikuGo,
};

// 多题库回退
class TikuFallback extends Tiku {
  constructor(providers)  // 按顺序依次查询
}
```

### 15. `src/tiku/yanxi.js` — 言溪题库

```javascript
// API: https://tk.enncy.cn/api/v3/query
// 请求: POST { question, tokens: [...token] }
// 响应: { code, data: { answer } }
// 支持多 token 轮询
```

### 16. `src/tiku/tiku-go.js` — GO题库

```javascript
// API: https://q.icodef.com/api/query
// 请求: GET?question=xxx
// 响应: { code, data: { answer } }
// 可选: Authorization header
```

### 17. `src/utils/logger.js` — 日志

```javascript
// console.log / console.error 包装
// 日志级别: trace/debug/info/warn/error
// 支持 prefix 标签
```

### 18. `src/utils/progress-bar.js` — 进度条

使用 `cli-progress` 库:
```javascript
// 视频进度: "任务名 |████████████| 60% 01:30/02:30"
// 总进度: "章节进度: 5/12"
```

### 19. `src/index.js` — 主入口 (重写)

主流程 (参照 `main.py` 的 main 函数):

```javascript
async function main() {
  // 1. 解析命令行参数
  // 支持: -u 手机号 -p 密码 -l 课程ID(逗号分隔) -s 倍速 -j 并行数 -a (retry/continue)
  //       -c config.json 配置文件加载
  
  // 2. 加载配置 (命令行 > config.json > 默认值)
  
  // 3. 初始化 Chaoxing + Tiku
  
  // 4. login()
  
  // 5. getCourseList() + filterCourses()
  
  // 6. 对每个课程 processCourse
  //    getCoursePoint → JobProcessor.run
  
  // 7. 完成输出
}
```

---

## 要安装的依赖

```bash
npm install cli-progress ora
```

---

## Packge.json 的 "type" 字段

确保 package.json 有 `"type": "module"` 来支持 ES Module。

---

## 关键对接点

1. `studyVideo` 方法在 Chaoxing 类内实现
2. `studyWork` 方法在 Chaoxing 类内实现 (调用 tiku.query)
3. `JobProcessor.processChapter` 调用 Chaoxing 实例的 studyVideo/studyDocument/studyWork
4. Tiku 实例通过 Chaoxing 构造函数传入
5. 所有 session 操作通过 SessionManager 单例

---

## 注意事项

1. **不要修改 config.js**（用户密码配置，已被 .gitignore）
2. **session 单例必须正确** — 复用 cookies
3. **速率限制**: 普通请求 0.5s，视频心跳 2s（随机额外 0-2s）
4. **403 处理**: 视频心跳可能 403 → refresh session → 最多2次
5. **rt 参数**: otherInfo 中的 `-rt_d` → 0.9, `-rt_1` → 1，不正确的 rt 会直接 403
6. **空章节处理**: 有些章节没有任务但标记了进度，需要特殊处理
7. **字体解码**: 本项目先不实现，题目标题和选项直接取文本即可

---

## 开始实现

按以下顺序逐步实现：

1. ✅ `package.json` 补依赖，加 `"type": "module"`
2. ✅ `src/core/study-result.js`
3. ✅ `src/core/session.js`
4. ✅ `src/core/cipher.js`
5. ✅ `src/core/ratelimiter.js`
6. ✅ `src/decoders/course-list.js`
7. ✅ `src/decoders/course-point.js`
8. ✅ `src/decoders/course-card.js`
9. ✅ `src/decoders/questions.js`
10. ✅ `src/utils/logger.js`
11. ✅ `src/utils/progress-bar.js`
12. ✅ `src/tiku/tiku.js` (含 CacheDAO)
13. ✅ `src/tiku/yanxi.js`
14. ✅ `src/tiku/tiku-go.js`
15. ✅ `src/core/chaoxing.js` (这个大模块, 需要引用前面所有)
16. ✅ `src/tasks/video.js`
17. ✅ `src/tasks/document.js`
18. ✅ `src/tasks/read.js`
19. ✅ `src/tasks/work.js`
20. ✅ `src/tasks/processor.js`
21. ✅ `src/index.js`

---

注意：需要将 `src/` 下原来的 `api.js`, `crypto.js`, `video.js`, `index.js` 保留不动，不要删除，新增模块在新目录。

完成后告诉我所有模块已完成即可。
