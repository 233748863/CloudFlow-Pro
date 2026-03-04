# CloudFlow Pro - Nacos 微服务部署指南

**文档版本**: 1.0  
**更新日期**: 2026-02-09  
**适用范围**: Nacos 作为独立微服务的完整部署方案

---

## 概述

本文档详细说明如何将 Nacos 作为独立微服务部署在 CloudFlow Pro 系统中，实现配置中心和服务注册中心的微服务化架构。

### 架构优势

✅ **服务解耦**: Nacos 作为独立服务，与业务服务解耦  
✅ **高可用**: 支持集群部署，提供服务高可用保障  
✅ **动态配置**: 配置热更新，无需重启服务  
✅ **服务发现**: 自动服务注册与发现  
✅ **环境隔离**: 通过命名空间实现多环境隔离  

---

## 系统架构

```
┌─────────────────────────────────────────────────────────┐
│                    CloudFlow Pro 微服务架构                │
└─────────────────────────────────────────────────────────┘

┌──────────────┐
│   Frontend   │ ← Nginx (80/443)
└──────┬───────┘
       │
┌──────┴───────┐
│   Gateway    │ ← API 网关 (9000)
└──────┬───────┘
       │
       ├─────────────┬─────────────┬─────────────┐
       │             │             │             │
┌──────┴──────┐ ┌───┴────┐ ┌─────┴──────┐ ┌────┴────┐
│    Auth     │ │Workflow│ │     OA     │ │  Nacos  │
│  (9001)     │ │ (9002) │ │   (9003)   │ │ (8848)  │
└──────┬──────┘ └───┬────┘ └─────┬──────┘ └────┬────┘
       │            │            │              │
       └────────────┴────────────┴──────────────┘
                         │
              ┌──────────┴──────────┐
              │                     │
        ┌─────┴─────┐         ┌────┴────┐
        │   MySQL   │         │  Redis  │
        │  (3306)   │         │ (6379)  │
        └───────────┘         └─────────┘
```

---

## 快速开始

### 前置要求

- Docker 20.10+
- Docker Compose 2.0+
- 至少 4GB 可用内存
- 至少 10GB 可用磁盘空间

### 一键部署

```bash
# 1. 克隆项目
git clone https://github.com/your-org/cloudflow-pro.git
cd cloudflow-pro

# 2. 复制环境变量模板
cp .env.example .env

# 3. 编辑 .env 文件，修改敏感信息
nano .env  # 或使用你喜欢的编辑器

# 4. 启动所有服务（包括 Nacos）
docker-compose up -d

# 5. 查看服务状态
docker-compose ps

# 6. 查看 Nacos 日志
docker-compose logs -f nacos
```

### 验证部署

```bash
# 检查 Nacos 健康状态
curl http://localhost:8848/nacos/actuator/health

# 预期输出：
# {"status":"UP"}

# 访问 Nacos 控制台
# 浏览器打开: http://localhost:8848/nacos
# 默认用户名/密码: nacos/nacos
```

---

## 详细配置

### 1. 环境变量配置

编辑 `.env` 文件：

```bash
# ============================================================
# 数据库配置
# ============================================================
MYSQL_ROOT_PASSWORD=your_secure_password_here
# 生产环境务必使用强密码

# ============================================================
# Redis 配置
# ============================================================
REDIS_PASSWORD=your_redis_password_here

# ============================================================
# Nacos 配置
# ============================================================
NACOS_SERVER=nacos:8848
# Docker 内部使用服务名，本地开发使用 localhost:8848

NACOS_NAMESPACE=
# 命名空间ID，用于环境隔离
# 留空使用 public 命名空间

NACOS_AUTH_TOKEN=SecretKey012345678901234567890123456789012345678901234567890123456789
# Nacos 认证密钥，必须至少32位
# 生产环境务必修改为随机生成的强密钥

# ============================================================
# Spring 配置
# ============================================================
SPRING_PROFILES_ACTIVE=prod
```

### 2. Nacos 服务配置

Nacos 服务在 `docker-compose.yml` 中的配置：

```yaml
nacos:
  build:
    context: ./docker/nacos
    dockerfile: Dockerfile
  container_name: cloudflow-nacos
  environment:
    MODE: standalone                          # 单机模式
    PREFER_HOST_MODE: hostname
    SPRING_DATASOURCE_PLATFORM: mysql         # 使用 MySQL 存储
    MYSQL_SERVICE_HOST: mysql
    MYSQL_SERVICE_PORT: 3306
    MYSQL_SERVICE_DB_NAME: cloud_flow_db
    MYSQL_SERVICE_USER: root
    MYSQL_SERVICE_PASSWORD: ${MYSQL_ROOT_PASSWORD}
    NACOS_AUTH_ENABLE: true                   # 启用认证
    NACOS_AUTH_TOKEN: ${NACOS_AUTH_TOKEN}
    JVM_XMS: 512m                             # JVM 最小堆内存
    JVM_XMX: 512m                             # JVM 最大堆内存
    JVM_XMN: 256m                             # JVM 新生代内存
  ports:
    - "8848:8848"   # HTTP API 端口
    - "9848:9848"   # gRPC 客户端端口
    - "9849:9849"   # gRPC 服务端端口
  volumes:
    - nacos_logs:/home/nacos/logs
    - nacos_data:/home/nacos/data
  depends_on:
    mysql:
      condition: service_healthy
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:8848/nacos/actuator/health"]
    interval: 30s
    timeout: 10s
    retries: 5
    start_period: 60s
  networks:
    - cloudflow-network
  deploy:
    resources:
      limits:
        cpus: '1.0'
        memory: 1G
      reservations:
        cpus: '0.5'
        memory: 512M
```

### 3. 微服务连接 Nacos

所有微服务通过 `bootstrap.yaml` 连接 Nacos：

```yaml
spring:
  application:
    name: cloudflow-service-workflow
  profiles:
    active: ${SPRING_PROFILES_ACTIVE:dev}
  cloud:
    nacos:
      discovery:
        server-addr: ${NACOS_SERVER:localhost:8848}
        namespace: ${NACOS_NAMESPACE:}
      config:
        server-addr: ${NACOS_SERVER:localhost:8848}
        namespace: ${NACOS_NAMESPACE:}
        file-extension: yaml
        shared-configs:
          - data-id: cloudflow-common.yaml
            refresh: true
```

---

## Nacos 配置管理

### 1. 登录 Nacos 控制台

```
URL: http://localhost:8848/nacos
用户名: nacos
密码: nacos
```

### 2. 创建命名空间（可选）

1. 进入"命名空间"菜单
2. 点击"新建命名空间"
3. 填写信息：
   - 命名空间ID: `prod`
   - 命名空间名: `生产环境`
4. 点击"确定"

### 3. 配置共享配置

1. 进入"配置管理" → "配置列表"
2. 点击"+"创建配置
3. 填写配置信息：
   - **Data ID**: `cloudflow-common.yaml`
   - **Group**: `DEFAULT_GROUP`
   - **配置格式**: `YAML`
   - **配置内容**: 复制 `config/cloudflow-common.yaml` 的内容
4. 修改敏感信息（数据库密码、Redis 密码等）
5. 点击"发布"

### 4. 配置示例

```yaml
# cloudflow-common.yaml
spring:
  datasource:
    driver-class-name: com.mysql.cj.jdbc.Driver
    url: jdbc:mysql://mysql:3306/cloud_flow_db?useUnicode=true&characterEncoding=utf8&zeroDateTimeBehavior=convertToNull&useSSL=true&serverTimezone=GMT%2B8
    username: cloudflow_prod_user
    password: YOUR_SECURE_PASSWORD_HERE  # ⚠️ 修改为实际密码
    hikari:
      pool-name: CloudFlowHikariCP
      minimum-idle: 10
      maximum-pool-size: 50
      connection-timeout: 30000
      idle-timeout: 600000
      max-lifetime: 1800000
      connection-test-query: SELECT 1

  data:
    redis:
      host: redis
      port: 6379
      password: YOUR_REDIS_PASSWORD_HERE  # ⚠️ 修改为实际密码
      database: 0
      timeout: 5000
      lettuce:
        pool:
          max-active: 50
          max-idle: 20
          min-idle: 10
          max-wait: 3000

mybatis-plus:
  configuration:
    log-impl: org.apache.ibatis.logging.nologging.NoLoggingImpl

logging:
  level:
    root: INFO
    com.cloudflow: INFO
```

---

## 服务管理

### 启动服务

```bash
# 启动所有服务
docker-compose up -d

# 仅启动 Nacos
docker-compose up -d nacos

# 启动 Nacos 及其依赖（MySQL）
docker-compose up -d mysql nacos
```

### 停止服务

```bash
# 停止所有服务
docker-compose down

# 仅停止 Nacos
docker-compose stop nacos

# 停止并删除数据卷（⚠️ 谨慎使用）
docker-compose down -v
```

### 查看日志

```bash
# 查看 Nacos 日志
docker-compose logs -f nacos

# 查看最近 100 行日志
docker-compose logs --tail=100 nacos

# 查看所有服务日志
docker-compose logs -f
```

### 重启服务

```bash
# 重启 Nacos
docker-compose restart nacos

# 重启所有服务
docker-compose restart
```

---

## 监控与运维

### 1. 健康检查

```bash
# Nacos 健康检查
curl http://localhost:8848/nacos/actuator/health

# 查看 Nacos 指标
curl http://localhost:8848/nacos/actuator/metrics

# 查看已注册服务
curl -X GET 'http://localhost:8848/nacos/v1/ns/instance/list?serviceName=cloudflow-workflow'
```

### 2. 服务注册验证

访问 Nacos 控制台 → "服务管理" → "服务列表"，应该看到：

- `cloudflow-gateway`
- `cloudflow-auth`
- `cloudflow-workflow`
- `cloudflow-oa`

### 3. 配置热更新测试

```bash
# 1. 在 Nacos 控制台修改配置
# 2. 观察服务日志，应该看到配置刷新日志
docker-compose logs -f workflow | grep "Refresh"

# 预期输出类似：
# Refresh keys changed: [spring.datasource.hikari.maximum-pool-size]
```

### 4. 性能监控

```bash
# 查看 Nacos 容器资源使用
docker stats cloudflow-nacos

# 查看 Nacos 进程
docker-compose exec nacos ps aux | grep nacos
```

---

## 故障排查

### 问题 1: Nacos 启动失败

**症状**: `docker-compose ps` 显示 Nacos 状态为 `Exit 1`

**排查步骤**:
```bash
# 1. 查看日志
docker-compose logs nacos

# 2. 检查 MySQL 是否就绪
docker-compose logs mysql | grep "ready for connections"

# 3. 检查环境变量
docker-compose config | grep -A 20 nacos
```

**常见原因**:
- MySQL 未就绪（等待 MySQL 健康检查通过）
- 数据库密码错误（检查 `.env` 文件）
- 内存不足（增加 Docker 内存限制）

### 问题 2: 服务无法注册到 Nacos

**症状**: Nacos 控制台看不到服务

**排查步骤**:
```bash
# 1. 检查服务日志
docker-compose logs workflow | grep "nacos"

# 2. 检查网络连通性
docker-compose exec workflow ping nacos

# 3. 检查 Nacos 地址配置
docker-compose exec workflow env | grep NACOS
```

**解决方案**:
- 确保 `NACOS_SERVER` 环境变量正确
- 检查服务的 `bootstrap.yaml` 配置
- 验证 Nacos 认证配置

### 问题 3: 配置无法加载

**症状**: 服务启动时报错找不到配置

**排查步骤**:
```bash
# 1. 检查 Nacos 配置列表
curl -X GET 'http://localhost:8848/nacos/v1/cs/configs?dataId=cloudflow-common.yaml&group=DEFAULT_GROUP'

# 2. 检查命名空间
# 确保服务和配置在同一命名空间
```

**解决方案**:
- 在 Nacos 控制台创建 `cloudflow-common.yaml` 配置
- 确保 Data ID 和 Group 匹配
- 检查命名空间配置

---

## 生产环境部署

### 1. 安全加固

```yaml
# .env 文件
MYSQL_ROOT_PASSWORD=<使用强密码生成器生成>
REDIS_PASSWORD=<使用强密码生成器生成>
NACOS_AUTH_TOKEN=<至少64位随机字符串>

# 生成强密码示例
openssl rand -base64 32
```

### 2. 集群部署（高可用）

修改 `docker-compose.yml`，部署 3 节点 Nacos 集群：

```yaml
nacos1:
  # ... 配置同上
  environment:
    MODE: cluster
    NACOS_SERVERS: nacos1:8848 nacos2:8848 nacos3:8848

nacos2:
  # ... 配置同上
  environment:
    MODE: cluster
    NACOS_SERVERS: nacos1:8848 nacos2:8848 nacos3:8848

nacos3:
  # ... 配置同上
  environment:
    MODE: cluster
    NACOS_SERVERS: nacos1:8848 nacos2:8848 nacos3:8848
```

### 3. 数据备份

```bash
# 备份 Nacos 配置
docker-compose exec mysql mysqldump -u root -p cloud_flow_db > nacos_backup_$(date +%Y%m%d).sql

# 备份 Nacos 数据卷
docker run --rm -v cloudflow_nacos_data:/data -v $(pwd):/backup alpine tar czf /backup/nacos_data_$(date +%Y%m%d).tar.gz /data
```

### 4. 监控告警

推荐使用 Prometheus + Grafana 监控 Nacos：

```yaml
# docker-compose.yml 添加
prometheus:
  image: prom/prometheus
  volumes:
    - ./prometheus.yml:/etc/prometheus/prometheus.yml
  ports:
    - "9090:9090"

grafana:
  image: grafana/grafana
  ports:
    - "3000:3000"
```

---

## 常用命令速查

```bash
# 启动
docker-compose up -d nacos

# 停止
docker-compose stop nacos

# 重启
docker-compose restart nacos

# 查看日志
docker-compose logs -f nacos

# 进入容器
docker-compose exec nacos bash

# 查看配置
docker-compose config

# 查看服务状态
docker-compose ps

# 清理（⚠️ 删除数据）
docker-compose down -v
```

---

## 参考资料

- [Nacos 官方文档](https://nacos.io/zh-cn/docs/what-is-nacos.html)
- [Spring Cloud Alibaba 文档](https://spring-cloud-alibaba-group.github.io/github-pages/2021/zh-cn/index.html)
- [Docker Compose 文档](https://docs.docker.com/compose/)
- [CloudFlow Pro 项目文档](../README.md)

---

## 附录

### A. Nacos 端口说明

| 端口 | 协议 | 说明 |
|------|------|------|
| 8848 | HTTP | Nacos 控制台和 HTTP API |
| 9848 | gRPC | 客户端 gRPC 请求服务端端口 |
| 9849 | gRPC | 服务端 gRPC 请求服务端端口 |

### B. 环境变量完整列表

| 变量名 | 说明 | 默认值 | 必填 |
|--------|------|--------|------|
| MYSQL_ROOT_PASSWORD | MySQL root 密码 | - | ✅ |
| REDIS_PASSWORD | Redis 密码 | - | ✅ |
| NACOS_SERVER | Nacos 服务地址 | localhost:8848 | ✅ |
| NACOS_NAMESPACE | Nacos 命名空间 | public | ❌ |
| NACOS_AUTH_TOKEN | Nacos 认证密钥 | - | ✅ |
| SPRING_PROFILES_ACTIVE | Spring 环境 | dev | ✅ |

### C. 故障码对照表

| 错误码 | 说明 | 解决方案 |
|--------|------|----------|
| 503 | Nacos 服务不可用 | 检查 Nacos 是否启动 |
| 401 | 认证失败 | 检查 NACOS_AUTH_TOKEN |
| 404 | 配置不存在 | 在 Nacos 控制台创建配置 |
| 500 | 内部错误 | 查看 Nacos 日志 |

---

**文档维护**: CloudFlow Pro 团队  
**最后更新**: 2026-02-09  
**版本**: 1.0.0
