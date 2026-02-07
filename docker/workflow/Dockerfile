# Build Stage
FROM maven:3.8-openjdk-17 as builder
WORKDIR /app
COPY cloudflow-backend/ .
RUN mvn clean package -DskipTests -pl cloudflow-service-workflow -am

# Run Stage
FROM openjdk:17-slim
WORKDIR /app
# Create a non-root user
RUN groupadd -r appuser && useradd -r -g appuser appuser
USER appuser

COPY --from=builder --chown=appuser:appuser /app/cloudflow-service-workflow/target/*.jar app.jar
EXPOSE 9300
ENTRYPOINT ["java", "-jar", "app.jar"]
