# ============================================================
# CloudFlow Pro - 统一后端构建 Dockerfile
# ============================================================
# 此文件用于构建单个后端微服务，通过 MODULE_NAME 参数指定
#
# 使用示例:
#   docker build --build-arg MODULE_NAME=cloudflow-gateway -t cloudflow-gateway .
#   docker build --build-arg MODULE_NAME=cloudflow-auth -t cloudflow-auth .
#   docker build --build-arg MODULE_NAME=cloudflow-service-workflow -t cloudflow-workflow .
#   docker build --build-arg MODULE_NAME=cloudflow-service-oa -t cloudflow-oa .
#
# 注意: 生产部署请使用 docker compose，参见 docker-compose.yml
# ============================================================

# 构建阶段
FROM maven:3.8-openjdk-17 as builder

# 必须指定要构建的模块名称
ARG MODULE_NAME

WORKDIR /app
COPY cloudflow-backend/ .
RUN mvn clean package -DskipTests -pl ${MODULE_NAME} -am

# 运行阶段
FROM eclipse-temurin:17-jre-alpine

ARG MODULE_NAME

WORKDIR /app

# 创建非 root 用户
RUN addgroup -S appuser && adduser -S appuser -G appuser
USER appuser

COPY --from=builder --chown=appuser:appuser /app/${MODULE_NAME}/target/*.jar app.jar

# JVM 优化参数
ENTRYPOINT ["java", \
  "-XX:+UseContainerSupport", \
  "-XX:MaxRAMPercentage=70.0", \
  "-Djava.security.egd=file:/dev/./urandom", \
  "-jar", "app.jar"]
