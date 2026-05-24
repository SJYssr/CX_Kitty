# CX_Kitty 架构分析 & 刷课流程设计

> 基于 Samueli924/chaoxing (Python) Node.js 移植分析
> 2026-05-25

---

## 一、原项目 (Python) 完整流程

```
main.py (入口)
  ├── 解析 CLI 参数 / 加载 config.ini
  ├── 初始化 Chaoxing 实例（含 AES 密码 + 题库）
  ├── ├── login() → POST passport2 /fanyalogin
  │   └── save_cookies() + SessionManager 单例
  ├── get_course_list() → POST courselistdata HTML 解析
  ├── filter_courses() → 筛选目标课程
  ├── process_course() → 逐个课程
  │   ├── get_course_point() → GET studentcourse HTML 解析
  │   ├── JobProcessor (Queue + 多线程)
  │   │   ├── worker_thread × N (默认4)
  │   │   └── retry_thread (NOT_OPEN/ERROR 任务重试)
  │   └── process_chapter() → 每个章节
  │       ├── get_job_list() → GET /knowledge/cards JSON 解析
  │       └── process_job() → 按 type 分发
  │           ├── video  → study_video()
  │           ├── doc    → study_document()
  │           ├── workid → study_work()  (含答题)
  │           ├── read   → study_read()
  │           └── live   → Live + LiveProcessor
  └── notification.send() → 完成通知
```

### 任务类型 & 处理方式

| 类型 | API | 核心逻辑 |
|------|-----|---------|
| **video** | GET /ananas/status/{objId} → 获取duration/dtoken → 循环上报 /multimedia/log/a/{cpi}/{dtoken} | 模拟观看: 每30-90s上报一次进度, 用MD5(enc)校验, 直到duration完成 |
| **audio** | 同上, dtype=Audio | 完全复用video逻辑 |
| **document** | GET /ananas/job/document?jobid=... | 简单GET请求即标记完成 |
| **workid** | GET /mooc-ans/api/work → HTML解析题目 → 题库查询 → POST提交 | 最复杂: 含字体解码、选项匹配、覆盖率判断、自动提交 |
| **read** | 特殊处理 | 极少见, 基本简单标记 |
| **live** | GET /zhibo.chaoxing.com/saveTimePc | 轮询提交直播时长, 59s间隔 |

### 关键加密/参数

- **AES Key**: `u2oh6Vu^HWe4_AES` (CBC, key=iv)
- **enc (视频进度MD5)**: `[{clazzId}][{userid}][{jobid}][{objectId}][{playingTime*1000}][d_yHJ!$pdA~5][{duration*1000}][0_{duration}]`
- **rt 参数**: 从 otherInfo 中 `-rt_d` → 0.9, `-rt_1` → 1
- **ssec-ch-ua**: `"Chromium";v="118", "Google Chrome";v="118"`

### 核心数据结构

**course**: `{ courseId, clazzId, cpi, title, teacher }`
**point/chapter**: `{ id, title, jobCount, has_finished, need_unlock }`
**job/task**: `{ type, jobid, otherinfo, objectid, playTime, rt, ... }`
**job_info**: `{ ktoken, mtEnc, reportTimeInterval, cardid, knowledgeid, ... }`

---

## 二、现有 CX_Kitty 差距分析

### ✅ 已实现
- `src/api.js`: 登录、课程列表、AES加密、Cookie持久化
- `src/crypto.js`: getEnc (MD5)、getTimestamp
- `src/video.js`: 会话管理、章节列表、任务卡片获取、视频心跳上报
- `src/index.js`: 简陋CLI入口

### ❌ 未实现 (需要本次开发)
1. **完整的刷课流程** — 现有代码只拿到了任务卡片，没有完整的"遍历章节→处理任务→上报进度"循环
2. **video 处理循环** — 模拟观看的完整 while 循环、wait_time 间隔、403 重试
3. **document 任务处理** — 函数未实现
4. **workid/测验任务** — 整个答题模块缺失（题目解析、题库查询、答案匹配、提交）
5. **read 任务** — 未实现
6. **live 直播** — 未实现
7. **题库系统 (Tiku)** — 整个模块缺失（Yanxi、GO题、LIKE、AI大模型等）
8. **并行任务队列 (JobProcessor)** — PriorityQueue + 多线程 Worker
9. **NOT_OPEN 章节处理** — retry/ask/continue 三种策略
10. **配置文件加载** — 现有硬编码 config.js，需要 .ini 解析或 JSON 配置
11. **进度条** — 视频进度条显示
12. **通知系统** — ServerChan/Qmsg/Bark/Telegram
13. **验证码处理** — captcha 模块（DdddOcr 降级方案）
14. **字体解码** — 超星加密字体解密
15. **速率限制** — RateLimiter（0.5s 普通, 2s 视频心跳）
16. **音频任务处理** — dtype=Audio 分支
17. **空章节处理** — study_emptypage

---

## 三、目标架构 (Node.js)

```
CX_Kitty/
├── package.json
├── config.json                # 用户配置 (替代 .gitignore 里的 config.js)
├── config.schema.json         # 配置校验 schema
├── cookies.json               # Cookie 持久化
├── cache.json                 # 题库答案缓存
│
├── src/
│   ├── index.js               # CLI 入口 + 主流程编排
│   ├── cli.js                 # 命令行参数解析
│   │
│   ├── core/
│   │   ├── session.js         # SessionManager (axios + cookiejar 单例)
│   │   ├── cipher.js          # AES 加密
│   │   ├── ratelimiter.js     # 请求速率限制
│   │   ├── chaoxing.js        # Chaoxing API 总类
│   │   │   ├── login()
│   │   │   ├── getCourseList()
│   │   │   ├── getCoursePoint()
│   │   │   ├── getJobList()
│   │   │   ├── getEnc()
│   │   │   ├── videoProgressLog()
│   │   │   ├── getFid() / getUid()
│   │   │   └── refreshVideoStatus()
│   │   └── study-result.js    # StudyResult enum
│   │
│   ├── tasks/
│   │   ├── video.js           # study_video() — 完整模拟观看循环
│   │   ├── document.js        # study_document()
│   │   ├── work.js            # study_work() — 答题完整流程
│   │   ├── read.js            # study_read()
│   │   ├── live.js            # Live + LiveProcessor
│   │   └── processor.js       # JobProcessor (队列 + 并行 Worker + 重试)
│   │
│   ├── decoders/
│   │   ├── course-list.js     # 课程列表 HTML → JSON
│   │   ├── course-point.js    # 章节列表 HTML → JSON
│   │   ├── course-card.js     # 任务卡片 mArg JSON 提取
│   │   └── questions.js       # 题目 HTML → 结构化数据 (含字体解码)
│   │
│   ├── tiku/
│   │   ├── tiku.js            # Tiku 基类 + Registry
│   │   ├── cache-dao.js       # 本地答案缓存 (JSON)
│   │   ├── yanxi.js           # TikuYanxi
│   │   ├── tiku-go.js         # TikuGo
│   │   ├── tiku-like.js       # TikuLike (LIKE知识库)
│   │   ├── tiku-adapter.js    # TikuAdapter
│   │   ├── ai.js              # AI 大模型
│   │   └── siliconflow.js     # 硅基流动大模型
│   │
│   ├── utils/
│   │   ├── logger.js          # 日志 (pino 或 console wrapper)
│   │   ├── progress-bar.js    # 进度条 (视频进度)
│   │   ├── config-loader.js   # 配置文件加载 / 合并
│   │   ├── font-decoder.js    # 超星字体解码
│   │   └── cv.js              # 验证码识别 (DdddOcr Node.js 替代方案)
│   │
│   └── notification/
│       └── index.js           # 通知服务 (ServerChan/Qmsg/Bark/Telegram)
```

---

## 四、实现优先级 (分阶段)

### Phase 1 — 核心刷课流程 ✅
1. 完善 session.js (单例 + cookie 持久化)
2. 完善 chaoxing.js (login/getCourseList/getCoursePoint/getJobList)
3. 实现 video.js 完整循环 (含进度条、403重试、rt切换)
4. 实现 document.js
5. 实现 processor.js (队列 + 并行 + 重试)
6. 完善 index.js 主流程

### Phase 2 — 答题系统
7. 实现题库基类 + cache-dao
8. 实现 1-2 个题库 provider (Yanxi/GO题)
9. 实现 work.js 完整答题流程 (获取题目 → 查库 → 匹配 → 提交)
10. 实现题目解析 (questions decoder + 字体解码)

### Phase 3 — 扩展功能
11. 直播任务处理 (live.js)
12. 阅读任务处理 (read.js)
13. 通知系统
14. 配置文件加载 & 命令行参数
15. 验证码识别
16. AI题库 (大模型)

---

## 五、关键 API 端点总结

| 用途 | 方法 | URL |
|------|------|-----|
| 登录 | POST | https://passport2.chaoxing.com/fanyalogin |
| 课程列表 | POST | https://mooc2-ans.chaoxing.com/mooc2-ans/visit/courselistdata |
| 交互页 | GET | https://mooc2-ans.chaoxing.com/mooc2-ans/visit/interaction |
| 章节列表 | GET | https://mooc2-ans.chaoxing.com/mooc2-ans/mycourse/studentcourse |
| 任务卡片 | GET | https://mooc1.chaoxing.com/mooc-ans/knowledge/cards |
| 视频状态 | GET | https://mooc1.chaoxing.com/ananas/status/{objid} |
| 视频心跳 | GET | https://mooc1.chaoxing.com/mooc-ans/multimedia/log/a/{cpi}/{dtoken} |
| 文档完成 | GET | https://mooc1.chaoxing.com/ananas/job/document |
| 答题页面 | GET | https://mooc1.chaoxing.com/mooc-ans/api/work |
| 签到列表 | GET | https://mobilelearn.chaoxing.com/v2/apis/active/student/activelist |
| 签到执行 | GET | https://mobilelearn.chaoxing.com/pptSign/stuSignajax |
| 直播时长 | GET | https://zhibo.chaoxing.com/saveTimePc |
| 直播状态 | GET | https://mooc1.chaoxing.com/ananas/live/liveinfo |
