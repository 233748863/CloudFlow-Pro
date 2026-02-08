# Nacos Server Dockerfile
# 基于官方 Nacos 镜像

FROM nacos/nacos-server:v2.3.0-slim

# 设置环境变量
ENV MODE=standalone \
    PREFER_HOST_MODE=hostname \
    SPRING_DATASOURCE_PLATFORM=mysql \
    NACOS_AUTH_ENABLE=true

# 暴露端口
# 8848: HTTP API 端口
# 9848: gRPC 端口（客户端请求）
# 9849: gRPC 端口（服务端请求）
EXPOSE 8848 9848 9849

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:8848/nacos/actuator/health || exit 1

# 使用官方镜像的启动脚本
CMD ["bin/docker-startup.sh"]
