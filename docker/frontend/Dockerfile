# ============================================================
# CloudFlow Frontend 前端 Dockerfile
# ============================================================

# 构建阶段：使用 Node.js 编译前端
FROM node:18-alpine as builder
WORKDIR /app
COPY cloudflow-frontend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY cloudflow-frontend/ .
RUN npm run build

# 运行阶段：使用 Nginx 提供静态文件服务
FROM nginx:alpine

RUN apk add --no-cache openssl

# 复制自定义 nginx 配置（替换默认配置）
COPY docker/frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/frontend/entrypoint.sh /entrypoint.sh

# 复制前端构建产物
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
EXPOSE 443

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider --no-check-certificate https://localhost/ || exit 1

RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
