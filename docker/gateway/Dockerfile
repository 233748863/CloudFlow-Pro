# ============================================================
# CloudFlow Gateway 网关服务 Dockerfile
# ============================================================

FROM maven:3.8-openjdk-17 as builder
WORKDIR /app
COPY cloudflow-backend/ .
RUN mvn clean package -DskipTests -pl cloudflow-gateway -am

FROM eclipse-temurin:17-jre-alpine as layer
WORKDIR /tmp
COPY --from=builder /app/cloudflow-gateway/target/*.jar app.jar
RUN java -Djarmode=layertools -jar app.jar extract

FROM eclipse-temurin:17-jre-alpine
WORKDIR /app
RUN addgroup -S appuser && adduser -S appuser -G appuser
USER appuser
COPY --from=layer --chown=appuser:appuser /tmp/dependencies/ ./
COPY --from=layer --chown=appuser:appuser /tmp/spring-boot-loader/ ./
COPY --from=layer --chown=appuser:appuser /tmp/snapshot-dependencies/ ./
COPY --from=layer --chown=appuser:appuser /tmp/application/ ./
EXPOSE 9000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 CMD wget -q --spider http://localhost:9100/actuator/health || exit 1
ENTRYPOINT ["java", "-XX:+UseContainerSupport", "-XX:MaxRAMPercentage=70.0", "-Djava.security.egd=file:/dev/./urandom", "org.springframework.boot.loader.launch.JarLauncher"]
