# ============================================================
# CloudFlow Auth 认证服务 Dockerfile
# ============================================================

# 构建阶段：使用 Maven 编译认证服务
FROM maven:3.8-openjdk-17 as builder
WORKDIR /app
COPY cloudflow-backend/ .
RUN mvn clean package -DskipTests -pl cloudflow-auth -am

# 运行阶段：使用轻量级 JRE 运行
FROM eclipse-temurin:17-jre-alpine
WORKDIR /app

# 创建非 root 用户
RUN addgroup -S appuser && adduser -S appuser -G appuser
USER appuser

COPY --from=builder --chown=appuser:appuser /app/cloudflow-auth/target/*.jar app.jar

# 认证服务端口（与 application.yml 中 server.port=9001 一致）
EXPOSE 9001

# JVM 优化参数
ENTRYPOINT ["java", \
  "-XX:+UseContainerSupport", \
  "-XX:MaxRAMPercentage=70.0", \
  "-Djava.security.egd=file:/dev/./urandom", \
  "-jar", "app.jar"]
