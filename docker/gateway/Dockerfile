# Build Stage (Unified for all backend services to utilize cache)
FROM maven:3.8-openjdk-17 as builder
WORKDIR /app
COPY cloudflow-backend/pom.xml .
COPY cloudflow-backend/cloudflow-common/pom.xml cloudflow-common/
COPY cloudflow-backend/cloudflow-gateway/pom.xml cloudflow-gateway/
COPY cloudflow-backend/cloudflow-auth/pom.xml cloudflow-auth/
COPY cloudflow-backend/cloudflow-service-workflow/pom.xml cloudflow-service-workflow/

# Download dependencies (Offline mode if possible, but go-offline often flaky with modules)
# Just copy source and build
COPY cloudflow-backend/ .
RUN mvn clean package -DskipTests -pl cloudflow-gateway -am

# Run Stage
FROM openjdk:17-slim
WORKDIR /app
# Create a non-root user
RUN groupadd -r appuser && useradd -r -g appuser appuser
USER appuser

COPY --from=builder --chown=appuser:appuser /app/cloudflow-gateway/target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
