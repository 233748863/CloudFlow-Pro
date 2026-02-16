# ============================================================
# CloudFlow Backend - 统一后端构建 Dockerfile
# ============================================================
# 通过 MODULE_NAME 参数指定要构建的模块
#
# 使用示例（在 cloudflow-backend 目录下）:
#   docker build --build-arg MODULE_NAME=cloudflow-gateway -t cloudflow-gateway .
#   docker build --build-arg MODULE_NAME=cloudflow-auth -t cloudflow-auth .
#   docker build --build-arg MODULE_NAME=cloudflow-service-workflow -t cloudflow-workflow .
#   docker build --build-arg MODULE_NAME=cloudflow-service-oa -t cloudflow-oa .
# ============================================================

# 构建阶段：使用 Maven 编译
FROM maven:3.8-openjdk-17 AS builder

ARG MODULE_NAME

WORKDIR /app

# 先复制所有 pom.xml 以利用 Docker 缓存层
COPY pom.xml .
COPY cloudflow-common/pom.xml cloudflow-common/
COPY cloudflow-gateway/pom.xml cloudflow-gateway/
COPY cloudflow-auth/pom.xml cloudflow-auth/
COPY cloudflow-service-workflow/pom.xml cloudflow-service-workflow/
COPY cloudflow-service-oa/pom.xml cloudflow-service-oa/

# 复制源代码
COPY cloudflow-common/ cloudflow-common/
COPY cloudflow-gateway/ cloudflow-gateway/
COPY cloudflow-auth/ cloudflow-auth/
COPY cloudflow-service-workflow/ cloudflow-service-workflow/
COPY cloudflow-service-oa/ cloudflow-service-oa/

# 编译指定模块及其依赖
RUN mvn clean package -DskipTests -pl ${MODULE_NAME} -am

# 运行阶段：使用轻量级 JRE
FROM eclipse-temurin:17-jre-alpine

ARG MODULE_NAME

WORKDIR /app

# 创建非 root 用户
RUN addgroup -S appuser && adduser -S appuser -G appuser
USER appuser

COPY --from=builder --chown=appuser:appuser /app/${MODULE_NAME}/target/*.jar app.jar

ENV TZ=Asia/Shanghai

# JVM 优化参数
ENTRYPOINT ["java", \
  "-XX:+UseContainerSupport", \
  "-XX:MaxRAMPercentage=75.0", \
  "-Djava.security.egd=file:/dev/./urandom", \
  "-jar", "app.jar"]
