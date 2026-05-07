# CloudFlow Pro Docker 部署配置审查报告

> **审查日期**: 2026-05-07  
> **审查范围**: docker-compose.yml、各服务 Dockerfile、nginx 配置、环境变量配置  
> **审查结论**: 整体配置良好，发现 12 个问题（3个严重、5个中等、4个轻微）

---

## 📋 一、配置文件清单

| 文件路径 | 用途 | 状态 |
|---------|------|------|
| `docker-compose.yml` | 主编排文件 | ✅ 存在 |
| `.env.example` | 环境变量模板 | ✅ 存在 |
| `cloudflow-backend/Dockerfile` | 后端统一构建 | ✅ 存在 |
| `docker/gateway/Dockerfile` | 网关服务 | ✅ 存在 |
| `docker/auth/Dockerfile` | 认证服务 | ✅ 存在 |
| `docker/workflow/Dockerfile` | 工作流服务 | ✅ 存在 |
| `docker/oa/Dockerfile` | OA 服务 | ✅ 存在 |
| `docker/frontend/Dockerfile` | 前端服务 | ✅ 存在 |
| `docker/frontend/nginx.conf` | Nginx 配置 | ✅ 存在 |
| `docker/nacos/Dockerfile` | Nacos 配置中心 | ✅ 存在 |
| `docker/monitoring/prometheus/` | Prometheus 配置 | ✅ 存在 |
| `docker/monitoring/grafana/` | Grafana 配置 | ✅ 存在 |

---

## 🔴 二、严重问题（P0 - 必须修复）

### 问题 1: HR 服务未包含在 docker-compose.yml 中

**位置**: `docker-compose.yml`  
**问题描述**:
- README.md 提到 "HR 容器尚未编排"
- docker-compose.yml 中只有 gateway、auth、workflow、oa 四个业务服务
- 缺少 `cloudflow-service-hr` 服务的编排配置
- 缺少 `docker/hr/Dockerfile`

**影响**:
- HR 模块无法通过 Docker Compose 部署
- 需要手动启动 HR 服务，增加运维复杂度
- 生产环境部署不完整

**修复建议**:
```yaml
# 在 docker-compose.yml 中添加 HR 服务
hr:
  build:
    context: .
    dockerfile: docker/hr/Dockerfile
  container_name: cloudflow-hr
  restart: unless-stopped
  environment:
    SPRING_PROFILES_ACTIVE: ${SPRING_PROFILES_ACTIVE:-prod}
    NACOS_SERVER: nacos:8848
    NACOS_NAMESPACE: ${NACOS_NAMESPACE:-0ccb9313-39d8-4a58-9fa5-ce834b77e60d}
    DB_URL: jdbc:mysql://mysql:3306/cloud_flow_db?useUnicode=true&characterEncoding=utf8&zeroDateTimeBehavior=convertToNull&useSSL=false&serverTimezone=GMT%2B8&allowPublicKeyRetrieval=true
    DB_USERNAME: root
    DB_PASSWORD: ${MYSQL_ROOT_PASSWORD:-cloudflow_2026}
    REDIS_HOST: redis
    REDIS_PORT: 6379
    REDIS_PASSWORD: ${REDIS_PASSWORD:-cloudflow_redis_2026}
    JAVA_OPTS: "-XX:+UseContainerSupport -XX:MaxRAMPercentage=75.0"
  volumes:
    - hr_logs:/app/logs
    - ./config/cloudflow-service-hr.yaml:/app/config/cloudflow-service-hr.yaml:ro
  depends_on:
    mysql:
      condition: service_healthy
    redis:
      condition: service_healthy
    nacos:
      condition: service_healthy
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:9005/actuator/health"]
    interval: 30s
    timeout: 10s
    retries: 5
    start_period: 60s
  logging:
    driver: json-file
    options:
      max-size: "50m"
      max-file: "5"
  networks:
    - cloudflow-network
  deploy:
    resources:
      limits:
        cpus: '0.5'
        memory: 512M
      reservations:
        cpus: '0.25'
        memory: 256M

# 在 volumes 部分添加
volumes:
  hr_logs:
    driver: local
```

同时需要创建 `docker/hr/Dockerfile`:
```dockerfile
FROM maven:3.8-openjdk-17 as builder
WORKDIR /app
COPY cloudflow-backend/ .
RUN mvn clean package -DskipTests -pl cloudflow-service-hr -am

FROM eclipse-temurin:17-jre-alpine
WORKDIR /app
RUN addgroup -S appuser && adduser -S appuser -G appuser
USER appuser
COPY --from=builder --chown=appuser:appuser /app/cloudflow-service-hr/target/*.jar app.jar
EXPOSE 9005
ENTRYPOINT ["java", \
  "-XX:+UseContainerSupport", \
  "-XX:MaxRAMPercentage=75.0", \
  "-Djava.security.egd=file:/dev/./urandom", \
  "-jar", "app.jar"]
```

---

### 问题 2: MySQL 初始化脚本缺少 HR 模块

**位置**: `docker-compose.yml` 第 28-31 行  
**问题描述**:
```yaml
volumes:
  - ./cloudflow-backend/DB/01.cloudflow-common.sql:/docker-entrypoint-initdb.d/01.cloudflow-common.sql:ro
  - ./cloudflow-backend/DB/02.cloudflow-workflow.sql:/docker-entrypoint-initdb.d/02.cloudflow-workflow.sql:ro
  - ./cloudflow-backend/DB/03.cloudflow-workflow-deploy.sql:/docker-entrypoint-initdb.d/03.cloudflow-workflow-deploy.sql:ro
  - ./cloudflow-backend/DB/04.cloudflow-oa.sql:/docker-entrypoint-initdb.d/04.cloudflow-oa.sql:ro
```

**问题**:
- 缺少 `03.cloudflow-hr.sql` 的挂载
- HR 模块的数据库表不会被初始化
- 容器启动后 HR 服务会因为表不存在而报错

**修复建议**:
```yaml
volumes:
  - ./cloudflow-backend/DB/01.cloudflow-common.sql:/docker-entrypoint-initdb.d/01.cloudflow-common.sql:ro
  - ./cloudflow-backend/DB/02.cloudflow-workflow.sql:/docker-entrypoint-initdb.d/02.cloudflow-workflow.sql:ro
  - ./cloudflow-backend/DB/03.cloudflow-hr.sql:/docker-entrypoint-initdb.d/03.cloudflow-hr.sql:ro
  - ./cloudflow-backend/DB/04.cloudflow-oa.sql:/docker-entrypoint-initdb.d/04.cloudflow-oa.sql:ro
```

注意：需要确认 `cloudflow-backend/DB/03.cloudflow-hr.sql` 文件存在。

---

### 问题 3: 默认密码过于简单且硬编码

**位置**: `docker-compose.yml` 和 `.env.example`  
**问题描述**:
- MySQL root 密码默认值: `cloudflow_2026`
- Redis 密码默认值: `cloudflow_redis_2026`
- Grafana admin 密码默认值: `cloudflow_grafana_2026`
- Nacos 认证 token 默认值: 固定的 64 位字符串

**风险**:
- 密码过于简单，容易被暴力破解
- 如果用户忘记修改 `.env`，生产环境将使用默认密码
- 攻击者可以通过查看源码获取默认密码

**修复建议**:

1. **移除 docker-compose.yml 中的默认值**，强制用户配置：
```yaml
environment:
  MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}  # 移除 :-cloudflow_2026
  REDIS_PASSWORD: ${REDIS_PASSWORD}  # 移除默认值
```

2. **在 .env.example 中添加强密码生成提示**:
```bash
# ============================================================
# 数据库配置
# ============================================================
# ⚠️ 生产环境必须修改为强密码！
# 建议使用以下命令生成随机密码：
#   openssl rand -base64 32
#   或 pwgen -s 32 1
MYSQL_ROOT_PASSWORD=CHANGE_ME_TO_STRONG_PASSWORD

# ============================================================
# Redis 配置
# ============================================================
# ⚠️ 生产环境必须修改为强密码！
REDIS_PASSWORD=CHANGE_ME_TO_STRONG_PASSWORD
```

3. **添加启动前检查脚本** `scripts/check-env.sh`:
```bash
#!/bin/bash
# 检查是否使用了默认密码
if grep -q "cloudflow_2026" .env 2>/dev/null; then
  echo "❌ 错误：检测到使用默认密码，生产环境禁止使用！"
  echo "请修改 .env 文件中的密码配置"
  exit 1
fi

if [ ! -f .env ]; then
  echo "❌ 错误：.env 文件不存在"
  echo "请复制 .env.example 为 .env 并修改配置"
  exit 1
fi

echo "✅ 环境变量检查通过"
```

---

## 🟡 三、中等问题（P1 - 建议修复）

### 问题 4: Nacos 命名空间 ID 硬编码

**位置**: `docker-compose.yml` 多处  
**问题描述**:
```yaml
NACOS_NAMESPACE: ${NACOS_NAMESPACE:-0ccb9313-39d8-4a58-9fa5-ce834b77e60d}
```

**问题**:
- 命名空间 ID `0ccb9313-39d8-4a58-9fa5-ce834b77e60d` 是硬编码的
- 不同环境（dev/test/prod）应该使用不同的命名空间
- 如果 Nacos 中不存在该命名空间，服务启动会失败

**修复建议**:
1. 在 `.env.example` 中明确说明：
```bash
NACOS_NAMESPACE=
# 命名空间ID，用于环境隔离
# 留空使用 public 命名空间
# 或在 Nacos 控制台创建命名空间后填入 ID
# 开发环境示例: dev-namespace-id
# 生产环境示例: prod-namespace-id
```

2. 移除 docker-compose.yml 中的默认值：
```yaml
NACOS_NAMESPACE: ${NACOS_NAMESPACE:-}  # 默认使用 public
```

---

### 问题 5: 缺少数据库初始化失败的处理

**位置**: `docker-compose.yml` MySQL 服务  
**问题描述**:
- 如果 SQL 脚本执行失败，MySQL 容器仍会启动
- 没有日志输出，难以排查问题
- 后续服务启动会因为表不存在而失败

**修复建议**:
1. 添加初始化脚本检查：
```yaml
mysql:
  # ... 其他配置
  volumes:
    - mysql_data:/var/lib/mysql
    - ./cloudflow-backend/DB:/docker-entrypoint-initdb.d:ro
    - ./scripts/check-db-init.sh:/docker-entrypoint-initdb.d/99-check-init.sh:ro
```

2. 创建 `scripts/check-db-init.sh`:
```bash
#!/bin/bash
# 检查关键表是否存在
mysql -u root -p"$MYSQL_ROOT_PASSWORD" cloud_flow_db -e "
  SELECT COUNT(*) FROM information_schema.tables 
  WHERE table_schema = 'cloud_flow_db' 
  AND table_name IN ('sys_user', 'wf_process_definition', 'hr_employee', 'oa_contract');
" | grep -q "4" || {
  echo "❌ 数据库初始化失败：关键表不存在"
  exit 1
}
echo "✅ 数据库初始化成功"
```

---

### 问题 6: 前端 Nginx 缺少 HTTPS 配置

**位置**: `docker/frontend/nginx.conf`  
**问题描述**:
- 仅配置了 HTTP (80 端口)
- 生产环境应该强制使用 HTTPS
- 缺少 HTTP 到 HTTPS 的重定向

**修复建议**:
在 `docker/frontend/nginx.conf` 中添加 HTTPS 配置：
```nginx
# HTTP 重定向到 HTTPS
server {
    listen 80;
    server_name localhost;
    return 301 https://$server_name$request_uri;
}

# HTTPS 配置
server {
    listen 443 ssl http2;
    server_name localhost;

    # SSL 证书配置（生产环境需替换为真实证书）
    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;

    # SSL 安全配置
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # HSTS (强制 HTTPS)
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # ... 其他配置保持不变
}
```

同时在 docker-compose.yml 中添加证书挂载说明：
```yaml
frontend:
  volumes:
    # SSL 证书目录（生产环境放入真实证书）
    # 证书文件命名: cert.pem (公钥) 和 key.pem (私钥)
    - ./docker/frontend/ssl:/etc/nginx/ssl:ro
```

---

### 问题 7: 缺少容器健康检查超时处理

**位置**: `docker-compose.yml` 各服务的 depends_on  
**问题描述**:
```yaml
depends_on:
  mysql:
    condition: service_healthy
```

**问题**:
- 如果 MySQL 健康检查一直失败，依赖服务会无限等待
- 没有超时机制，可能导致整个编排卡住
- 缺少健康检查失败的告警

**修复建议**:
Docker Compose 本身不支持 depends_on 超时，建议：

1. 在各服务的启动脚本中添加重试逻辑
2. 使用 `docker-compose up --timeout 300` 设置全局超时
3. 添加启动脚本 `scripts/start.sh`:
```bash
#!/bin/bash
set -e

echo "🚀 启动 CloudFlow Pro..."

# 检查 .env 文件
if [ ! -f .env ]; then
  echo "❌ .env 文件不存在，请先复制 .env.example"
  exit 1
fi

# 启动基础设施
echo "📦 启动基础设施 (MySQL, Redis, Nacos)..."
docker compose up -d mysql redis nacos

# 等待基础设施就绪（最多等待 5 分钟）
echo "⏳ 等待基础设施就绪..."
timeout 300 bash -c 'until docker compose ps mysql | grep -q "healthy"; do sleep 5; done' || {
  echo "❌ MySQL 启动超时"
  docker compose logs mysql
  exit 1
}

# 启动微服务
echo "🔧 启动微服务..."
docker compose up -d gateway auth workflow oa hr

# 启动前端和监控
echo "🎨 启动前端和监控..."
docker compose up -d frontend prometheus grafana

echo "✅ CloudFlow Pro 启动完成！"
echo "📊 访问地址："
echo "  - 前端: http://localhost"
echo "  - API 网关: http://localhost:9000"
echo "  - Nacos: http://localhost:8848/nacos (用户名/密码: nacos/nacos)"
echo "  - Grafana: http://localhost:3000 (用户名/密码: admin/cloudflow_grafana_2026)"
```

---

### 问题 8: 日志文件可能占满磁盘

**位置**: `docker-compose.yml` 各服务的 logging 配置  
**问题描述**:
```yaml
logging:
  driver: json-file
  options:
    max-size: "50m"
    max-file: "5"
```

**问题**:
- 每个服务最多保留 5 个日志文件，每个 50MB
- 10 个服务 = 2.5GB 日志
- 长期运行可能占满磁盘
- 缺少日志轮转和归档策略

**修复建议**:
1. 减少日志保留量：
```yaml
logging:
  driver: json-file
  options:
    max-size: "20m"  # 减少到 20MB
    max-file: "3"    # 只保留 3 个文件
```

2. 添加日志清理脚本 `scripts/clean-logs.sh`:
```bash
#!/bin/bash
# 清理超过 7 天的日志
find /var/lib/docker/volumes/cloudflow*logs/_data -name "*.log" -mtime +7 -delete
echo "✅ 日志清理完成"
```

3. 添加 cron 任务自动清理：
```bash
# 每天凌晨 2 点清理日志
0 2 * * * /path/to/scripts/clean-logs.sh
```

---

## 🟢 四、轻微问题（P2 - 可选修复）

### 问题 9: 缺少开发环境的 docker-compose.dev.yml

**问题描述**:
- 当前只有一个 `docker-compose.yml`，适用于生产环境
- 开发环境需要不同的配置（如端口映射、热重载、调试端口）

**修复建议**:
创建 `docker-compose.dev.yml`:
```yaml
# 开发环境覆盖配置
# 使用方式: docker compose -f docker-compose.yml -f docker-compose.dev.yml up

services:
  # 开发环境映射所有服务端口，便于调试
  gateway:
    ports:
      - "9000:9000"
      - "5005:5005"  # 调试端口
    environment:
      JAVA_OPTS: "-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=*:5005"
      SPRING_PROFILES_ACTIVE: dev
      LOG_LEVEL: DEBUG

  auth:
    ports:
      - "9001:9001"
      - "5006:5006"
    environment:
      JAVA_OPTS: "-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=*:5006"
      SPRING_PROFILES_ACTIVE: dev

  # 前端开发模式（热重载）
  frontend:
    build:
      context: .
      dockerfile: docker/frontend/Dockerfile.dev
    volumes:
      - ./cloudflow-frontend/src:/app/src:ro
    command: npm run dev
```

---

### 问题 10: 缺少备份和恢复脚本

**问题描述**:
- 没有数据库备份脚本
- 没有数据恢复脚本
- 生产环境数据丢失风险高

**修复建议**:
创建 `scripts/backup.sh`:
```bash
#!/bin/bash
BACKUP_DIR="./backups"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

# 备份 MySQL
docker compose exec -T mysql mysqldump \
  -u root -p"${MYSQL_ROOT_PASSWORD}" \
  --all-databases --single-transaction \
  > "$BACKUP_DIR/mysql_$DATE.sql"

# 备份 Redis
docker compose exec -T redis redis-cli \
  -a "${REDIS_PASSWORD}" \
  --rdb "$BACKUP_DIR/redis_$DATE.rdb"

# 备份上传文件
tar -czf "$BACKUP_DIR/uploads_$DATE.tar.gz" \
  -C /var/lib/docker/volumes/cloudflow_upload_data/_data .

echo "✅ 备份完成: $BACKUP_DIR"
```

---

### 问题 11: 缺少监控告警配置

**位置**: `docker/monitoring/prometheus/`  
**问题描述**:
- Prometheus 只采集指标，没有配置告警规则
- Grafana 只展示数据，没有配置告警通知

**修复建议**:
创建 `docker/monitoring/prometheus/alerts.yml`:
```yaml
groups:
  - name: cloudflow_alerts
    interval: 30s
    rules:
      # 服务存活告警
      - alert: ServiceDown
        expr: up == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "服务 {{ $labels.job }} 已停止"

      # 内存使用告警
      - alert: HighMemoryUsage
        expr: (container_memory_usage_bytes / container_spec_memory_limit_bytes) > 0.9
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "容器 {{ $labels.name }} 内存使用超过 90%"

      # CPU 使用告警
      - alert: HighCPUUsage
        expr: rate(container_cpu_usage_seconds_total[5m]) > 0.8
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "容器 {{ $labels.name }} CPU 使用超过 80%"
```

---

### 问题 12: 缺少容器资源监控

**问题描述**:
- docker-compose.yml 中配置了资源限制，但没有监控
- 无法知道容器是否触达资源上限

**修复建议**:
1. 添加 cAdvisor 容器监控：
```yaml
# 在 docker-compose.yml 中添加
cadvisor:
  image: gcr.io/cadvisor/cadvisor:v0.47.0
  container_name: cloudflow-cadvisor
  restart: unless-stopped
  ports:
    - "8080:8080"
  volumes:
    - /:/rootfs:ro
    - /var/run:/var/run:ro
    - /sys:/sys:ro
    - /var/lib/docker/:/var/lib/docker:ro
  networks:
    - cloudflow-network
```

2. 在 Prometheus 中添加 cAdvisor 数据源

---

## 📊 五、配置优化建议

### 5.1 构建优化

**当前问题**:
- 每个服务的 Dockerfile 都重新编译整个项目
- 构建时间长，浪费 CI/CD 资源

**优化建议**:
使用多阶段构建 + Maven 缓存：
```dockerfile
# 优化后的 Dockerfile
FROM maven:3.8-openjdk-17 as builder
WORKDIR /app

# 1. 先复制 pom.xml，利用 Docker 缓存层
COPY cloudflow-backend/pom.xml .
COPY cloudflow-backend/cloudflow-common/pom.xml cloudflow-common/
# ... 复制所有 pom.xml

# 2. 下载依赖（这一层会被缓存）
RUN mvn dependency:go-offline -B

# 3. 复制源码并编译
COPY cloudflow-backend/ .
RUN mvn clean package -DskipTests -pl cloudflow-auth -am

# 运行阶段保持不变
```

---

### 5.2 网络优化

**当前问题**:
- 所有服务在同一个网络中，没有隔离
- 前端可以直接访问数据库

**优化建议**:
```yaml
networks:
  # 前端网络（只能访问网关）
  frontend-network:
    driver: bridge
  
  # 后端网络（微服务之间通信）
  backend-network:
    driver: bridge
  
  # 数据库网络（只有后端服务可以访问）
  database-network:
    driver: bridge
    internal: true  # 不允许外部访问

services:
  frontend:
    networks:
      - frontend-network
  
  gateway:
    networks:
      - frontend-network
      - backend-network
  
  auth:
    networks:
      - backend-network
      - database-network
  
  mysql:
    networks:
      - database-network
```

---

### 5.3 安全加固

**建议清单**:
1. ✅ 所有服务已使用非 root 用户运行
2. ✅ 已配置安全响应头（nginx.conf）
3. ⚠️ 建议添加 AppArmor/SELinux 配置
4. ⚠️ 建议使用 Docker secrets 管理敏感信息
5. ⚠️ 建议启用 Docker Content Trust

---

## 📝 六、修复优先级总结

| 优先级 | 问题编号 | 问题描述 | 修复工作量 |
|--------|---------|---------|-----------|
| **P0** | #1 | HR 服务未编排 | 中（1-2小时） |
| **P0** | #2 | MySQL 缺少 HR 初始化脚本 | 小（10分钟） |
| **P0** | #3 | 默认密码过于简单 | 小（30分钟） |
| **P1** | #4 | Nacos 命名空间硬编码 | 小（10分钟） |
| **P1** | #5 | 缺少数据库初始化检查 | 中（1小时） |
| **P1** | #6 | 缺少 HTTPS 配置 | 中（1小时） |
| **P1** | #7 | 缺少健康检查超时处理 | 中（1小时） |
| **P1** | #8 | 日志可能占满磁盘 | 小（30分钟） |
| **P2** | #9 | 缺少开发环境配置 | 中（1-2小时） |
| **P2** | #10 | 缺少备份恢复脚本 | 中（1-2小时） |
| **P2** | #11 | 缺少监控告警 | 大（2-3小时） |
| **P2** | #12 | 缺少容器资源监控 | 中（1小时） |

---

## ✅ 七、总体评价

### 优点：
1. ✅ **架构清晰**：基础设施、微服务、监控、前端分层明确
2. ✅ **健康检查完善**：所有服务都配置了健康检查
3. ✅ **资源限制合理**：配置了 CPU 和内存限制
4. ✅ **日志管理规范**：统一使用 json-file driver，配置了轮转
5. ✅ **监控体系完整**：集成了 Prometheus + Grafana
6. ✅ **安全意识良好**：使用非 root 用户，配置了安全响应头

### 需要改进：
1. ⚠️ **HR 服务缺失**：需要补充 HR 服务的 Docker 编排
2. ⚠️ **默认密码风险**：需要强制用户修改默认密码
3. ⚠️ **缺少 HTTPS**：生产环境应该强制 HTTPS
4. ⚠️ **缺少备份策略**：需要添加自动备份脚本

### 建议行动：
1. **立即修复** P0 问题（#1, #2, #3）
2. **本周内修复** P1 问题（#4-#8）
3. **下个迭代修复** P2 问题（#9-#12）

---

**文档结束**
