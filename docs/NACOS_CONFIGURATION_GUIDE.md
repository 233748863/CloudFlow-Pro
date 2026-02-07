# CloudFlow Pro - Nacos配置指南

## 概述
CloudFlow Pro使用Nacos作为配置中心。本文档列出了生产环境部署所需的关键配置项。

## 配置位置
- **Nacos地址**: 根据实际部署环境配置
- **命名空间**: 建议为每个环境（dev/test/prod）创建独立命名空间
- **配置格式**: YAML

---

## 1. 数据库连接池配置

### 配置文件: `application-datasource.yml`

```yaml
spring:
  datasource:
    type: com.zaxxer.hikari.HikariDataSource
    driver-class-name: com.mysql.cj.jdbc.Driver
    url: jdbc:mysql://${DB_HOST:localhost}:${DB_PORT:3306}/${DB_NAME:cloudflow_pro}?useUnicode=true&characterEncoding=utf8&zeroDateTimeBehavior=convertToNull&useSSL=true&serverTimezone=GMT%2B8
    username: ${DB_USERNAME:root}
    password: ${DB_PASSWORD:your_password}
    
    # HikariCP连接池配置
    hikari:
      # 最小空闲连接数
      minimum-idle: 10
      # 最大连接池大小
      maximum-pool-size: 50
      # 连接超时时间（毫秒）
      connection-timeout: 30000
      # 空闲连接超时时间（毫秒）
      idle-timeout: 600000
      # 连接最大生命周期（毫秒）
      max-lifetime: 1800000
      # 连接测试查询
      connection-test-query: SELECT 1
      # 连接池名称
      pool-name: CloudFlowHikariCP
      # 自动提交
      auto-commit: true
```

**说明**:
- `minimum-idle`: 10个空闲连接，保证基本并发需求
- `maximum-pool-size`: 50个最大连接，适合中等规模应用
- `connection-timeout`: 30秒连接超时，防止长时间等待
- `idle-timeout`: 10分钟空闲超时，释放不活跃连接
- `max-lifetime`: 30分钟最大生命周期，防止连接泄漏

---

## 2. 日志级别配置

### 配置文件: `application-logging.yml`

```yaml
logging:
  level:
    # 根日志级别
    root: INFO
    
    # CloudFlow应用日志
    com.cloudflow: INFO
    
    # 工作流模块保持DEBUG（用于问题排查）
    com.cloudflow.workflow: DEBUG
    
    # Spring框架日志
    org.springframework: WARN
    org.springframework.web: INFO
    org.springframework.security: WARN
    
    # MyBatis日志
    com.baomidou.mybatisplus: WARN
    
    # Nacos日志
    com.alibaba.nacos: WARN
    
    # Redisson日志
    org.redisson: WARN
    
  # 日志文件配置
  file:
    name: logs/cloudflow-pro.log
    max-size: 100MB
    max-history: 30
    
  pattern:
    console: "%d{yyyy-MM-dd HH:mm:ss.SSS} [%thread] %-5level %logger{50} - %msg%n"
    file: "%d{yyyy-MM-dd HH:mm:ss.SSS} [%thread] %-5level %logger{50} - %msg%n"
```

**说明**:
- 生产环境使用INFO级别，减少日志量
- 工作流模块保持DEBUG，便于排查流程问题
- 第三方框架使用WARN级别，只记录警告和错误
- 日志文件最大100MB，保留30天

---

## 3. Redis配置（可选 - 如需配置密码）

### 配置文件: `application-redis.yml`

```yaml
spring:
  redis:
    host: ${REDIS_HOST:localhost}
    port: ${REDIS_PORT:6379}
    database: ${REDIS_DATABASE:0}
    # 密码配置（如果Redis设置了密码）
    password: ${REDIS_PASSWORD:}
    timeout: 10000
    
    lettuce:
      pool:
        # 最大连接数
        max-active: 20
        # 最大空闲连接
        max-idle: 10
        # 最小空闲连接
        min-idle: 5
        # 连接超时时间
        max-wait: 3000
```

**说明**:
- 使用环境变量`REDIS_PASSWORD`配置密码
- 如果Redis未设置密码，保持为空字符串
- 连接池配置适合中等规模应用

---

## 4. 事务超时配置

### 配置文件: `application-transaction.yml`

```yaml
spring:
  transaction:
    # 默认事务超时时间（秒）
    default-timeout: 30
    
    # 事务管理器配置
    rollback-on-commit-failure: true
```

**说明**:
- 默认30秒事务超时，防止长事务阻塞
- 提交失败时自动回滚

---

## 5. 健康检查配置

### 配置文件: `application-actuator.yml`

```yaml
management:
  endpoints:
    web:
      exposure:
        # 暴露的端点
        include: health,info,metrics
      base-path: /actuator
      
  endpoint:
    health:
      # 健康检查详情显示策略
      show-details: when-authorized
      # 启用的健康检查
      enabled: true
      
  health:
    # 数据库健康检查
    db:
      enabled: true
    # Redis健康检查
    redis:
      enabled: true
    # 磁盘空间检查
    diskspace:
      enabled: true
      threshold: 10GB
      
  metrics:
    export
