# Multi-stage build for Spring Boot services
FROM maven:3.8.5-openjdk-17 AS builder
WORKDIR /app
# Copy parent pom and modules
COPY pom.xml .
COPY cloudflow-common/pom.xml cloudflow-common/
COPY cloudflow-gateway/pom.xml cloudflow-gateway/
COPY cloudflow-auth/pom.xml cloudflow-auth/
COPY cloudflow-service-workflow/pom.xml cloudflow-service-workflow/
# Download dependencies (cache layer)
RUN mvn dependency:go-offline

# Copy source code
COPY cloudflow-common/src cloudflow-common/src
COPY cloudflow-gateway/src cloudflow-gateway/src
COPY cloudflow-auth/src cloudflow-auth/src
COPY cloudflow-service-workflow/src cloudflow-service-workflow/src

# Build
RUN mvn clean package -DskipTests

# Runtime stage
FROM openjdk:17-jdk-slim
ARG MODULE_NAME
WORKDIR /app
COPY --from=builder /app/${MODULE_NAME}/target/*.jar app.jar

ENV TZ=Asia/Shanghai
EXPOSE 8080

ENTRYPOINT ["java","-jar","app.jar"]
