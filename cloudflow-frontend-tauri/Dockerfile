# ============================================================
# CloudFlow Frontend - 独立前端 Dockerfile
# ============================================================
# 在 cloudflow-frontend 目录下独立构建时使用
# 使用示例: docker build -t cloudflow-frontend .
#
# 注意: 生产部署请使用根目录的 docker compose，
#       它使用 docker/frontend/Dockerfile
# ============================================================

# 构建阶段
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# 运行阶段
FROM nginx:alpine

# 复制构建产物
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
