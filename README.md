# CX_Kitty 🐱

超星学习通自动化工具 — 纯 API 驱动，无浏览器依赖。

## ✨ 功能

- ✅ **自动刷课** — 视频、文档、阅读任务自动完成
- ✅ **自动答题** — 集成 DeepSeek AI，支持单选题/多选题/判断题/填空题/简答题
- ✅ **字体解密** — 自动还原超星防爬字符替换，准确答题
- ✅ **自动提交** — 支持仅保存 / 自动提交两种模式
- ✅ **实时日志** — SSE 推送 + 独立日志表，随时查看任务进度
- ✅ **多账号隔离** — 独立 Cookie 会话，互不干扰
- ✅ **限流保护** — 双层限流器，避免被封
- ✅ **Web 管理界面** — Vue 3 + Element Plus 毛玻璃 UI
- ✅ **Docker 部署** — 一键 docker-compose up

## 🚀 快速开始

### 方式一：Docker 部署（推荐）

```bash
git clone https://github.com/SJYssr/CX_Kitty.git
cd CX_Kitty

# 编辑 .env 文件，设置 MySQL 密码
echo "DB_PASSWORD=your_password" > .env

# 启动
docker compose up -d
```

访问 `http://localhost:3001` 即可打开管理界面。

### 方式二：直接运行

依赖：Node.js 22+、MySQL 8.0+

```bash
git clone https://github.com/SJYssr/CX_Kitty.git
cd CX_Kitty

# 安装依赖
npm ci
cd server && npm ci && cd ..
cd client && npm ci && cd ..

# 创建数据库
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS cx_kitty CHARACTER SET utf8mb4;"
mysql -u root -p cx_kitty < server/init.sql

# 配置环境变量
cp .env.example .env  # 或手动创建
# DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, PORT

# 构建前端
cd client && npm run build && cd ..

# 启动服务
node server/src/index.js
```

## 🖥️ 管理界面

启动后在浏览器打开 `http://localhost:3001`：

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

## 🏗️ 项目结构

```
├── src/                    # 核心引擎
│   ├── core/
│   │   ├── chaoxing.js     # 超星 API 主类（登录/课程/视频/答题）
│   │   ├── session.js      # Cookie 会话管理
│   │   ├── cipher.js       # 超星加密算法
│   │   ├── ratelimiter.js  # 限流器
│   │   └── study-result.js # 任务状态常量
│   ├── tasks/
│   │   ├── processor.js    # 任务调度器（章节并发）
│   │   ├── video.js        # 视频任务
│   │   ├── document.js     # 文档任务
│   │   ├── read.js         # 阅读任务
│   │   └── work.js         # 答题任务
│   ├── tiku/
│   │   ├── tiku.js         # 题库基类 + SQLite 缓存
│   │   ├── deepseek.js     # DeepSeek AI 答题引擎
│   │   ├── font-decrypt.js # 超星字体解密（TTF 轮廓哈希）
│   │   └── font_map_table.json  # 30885 条字形映射
│   ├── decoders/
│   │   ├── course-list.js  # 课程列表 HTML 解析
│   │   ├── course-point.js # 章节点 HTML 解析
│   │   ├── course-card.js  # 任务卡片 HTML 解析
│   │   └── questions.js    # 答题页面 HTML 解析
│   └── utils/
│       ├── logger.js       # 日志工具
│       └── progress-bar.js # 进度条渲染
├── server/                 # Web 服务端
│   ├── src/
│   │   ├── index.js        # Express 入口
│   │   ├── db.js           # MySQL 连接池
│   │   ├── study-runner.js # 刷课任务运行器
│   │   ├── log-bus.js      # SSE 实时日志总线
│   │   ├── routes/
│   │   │   ├── account.js  # 账号管理 API
│   │   │   └── study.js    # 刷课任务 API
│   │   └── init.sql        # 数据库建表脚本
│   └── package.json
├── client/                 # Web 前端（Vue 3 + Element Plus）
│   ├── src/
│   │   ├── App.vue
│   │   ├── main.js
│   │   └── views/
│   │       ├── Login.vue     # 登录页
│   │       ├── Dashboard.vue # 控制面板
│   │       └── Config.vue    # 配置弹窗
│   └── package.json
├── Dockerfile
├── docker-compose.yml
└── package.json
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
| 部署 | Docker + docker-compose |

## 📊 数据库表

| 表名 | 说明 |
|------|------|
| `accounts` | 账号及 AI 配置 |
| `study_tasks` | 刷课任务记录 |
| `task_logs` | 任务日志（独立表） |

## ⚠️ 注意事项

- 答题使用 DeepSeek API，需要自行注册获取 API Key
- 视频播放默认 1 倍速，较长视频需耐心等待
- 请合理使用，避免对超星服务器造成压力
- 本项目仅供学习交流，禁止用于盈利

## 🙏 致谢

- [Samueli924/chaoxing](https://github.com/Samueli924/chaoxing) — 字体解密方案参考
- [SocialSisterYi](https://github.com/SocialSisterYi) — 超星字体逆向思路
