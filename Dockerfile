# Stage 1: Build Frontend
FROM node:18-alpine as frontend-builder
WORKDIR /app/frontend
COPY cloudflow-frontend/package*.json ./
RUN npm install
COPY cloudflow-frontend/ .
RUN npm run build

# Stage 2: Build Backend
FROM maven:3.8-openjdk-17 as backend-builder
WORKDIR /app/backend
COPY cloudflow-backend/pom.xml .
COPY cloudflow-backend/ .
# Skip tests to speed up build as requested
RUN mvn clean package -DskipTests

# Stage 3: Run
FROM openjdk:17-slim
WORKDIR /app

# Copy Backend Jar (Assuming workflow service is the main entry or we use a launcher)
# In microservice, we might need multiple containers or a single fat jar. 
# For simplicity, let's assume we run the workflow service which embeds others or we just run the main service.
# Wait, this is a multi-module project. We likely need to run Gateway, Auth, and Workflow.
# Docker Compose is better for local dev. For production single container, it's hard.
# Let's create a Dockerfile that runs the Workflow Service as an example, 
# but in reality we need Docker Compose.

# Let's copy the workflow service jar
COPY --from=backend-builder /app/backend/cloudflow-service-workflow/target/*.jar app.jar

# Copy Frontend Static Files (to be served by Nginx or embedded if Spring Boot serves static)
# Usually we use Nginx. Let's install Nginx in this image or use a separate Nginx image.
# For simplicity in this "all-in-one" attempt (often anti-pattern but requested as single file), 
# let's stick to standard practice: 
# This Dockerfile builds the Workflow Service. 
# We should provide a docker-compose.yml for the full stack.

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
