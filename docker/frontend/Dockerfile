# Stage 1: Build React App
FROM node:18-alpine as builder
WORKDIR /app
COPY cloudflow-frontend/package*.json ./
RUN npm install
COPY cloudflow-frontend/ .
RUN npm run build

# Stage 2: Serve with Nginx
FROM nginx:alpine
# Create non-root user setup for Nginx (nginx user exists in alpine)
# Update nginx config to use /tmp for pid and logs if needed, but standard nginx:alpine runs as root.
# To run as non-root, we need to adjust permissions.
RUN chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    chown -R nginx:nginx /etc/nginx/conf.d && \
    touch /var/run/nginx.pid && \
    chown -R nginx:nginx /var/run/nginx.pid

USER nginx

COPY --from=builder /app/dist /usr/share/nginx/html
COPY docker/frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
