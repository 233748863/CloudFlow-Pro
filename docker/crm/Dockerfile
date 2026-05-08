# ============================================================
# CloudFlow CRM 服务 Dockerfile
# ============================================================

FROM maven:3.8-openjdk-17 as builder
WORKDIR /app
COPY cloudflow-backend/ .
RUN mvn clean package -DskipTests -pl cloudflow-service-crm -am

FROM eclipse-temurin:17-jre-alpine
WORKDIR /app

RUN addgroup -S appuser && adduser -S appuser -G appuser
USER appuser

COPY --from=builder --chown=appuser:appuser /app/cloudflow-service-crm/target/*.jar app.jar

EXPOSE 9004

ENTRYPOINT ["java", \
  "-XX:+UseContainerSupport", \
  "-XX:MaxRAMPercentage=75.0", \
  "-Djava.security.egd=file:/dev/./urandom", \
  "-jar", "app.jar"]
