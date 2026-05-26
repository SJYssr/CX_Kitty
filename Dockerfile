# ===================== CX_Kitty Dockerfile =====================
# 多阶段构建：前端编译 + 生产镜像

# --- Stage 1: Build frontend + install all deps ---
FROM node:22-alpine AS builder

WORKDIR /app

# 先复制依赖文件，利用 Docker 缓存
COPY package*.json ./
COPY client/package*.json client/
COPY server/package*.json server/

# 安装所有依赖（含 devDeps，前端构建需要）
RUN npm ci

# 复制源码
COPY . .

# 构建前端
RUN cd client && npm run build

# --- Stage 2: Production ---
FROM node:22-alpine

RUN apk add --no-cache tini

WORKDIR /app

# 只复制生产需要的依赖
COPY --from=builder /app/node_modules ./node_modules

# 复制核心源码
COPY --from=builder /app/src ./src
COPY --from=builder /app/server ./server
COPY --from=builder /app/package.json ./

# 复制前端构建产物
# server 中 distPath = path.resolve(__dirname, '../../client/dist')
# __dirname = /app/server/src/ → ../../client = /client
COPY --from=builder /app/client/dist /client/dist

# 创建数据目录（SQLite 缓存用）
RUN mkdir -p /app/data

EXPOSE 3001

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server/src/index.js"]
