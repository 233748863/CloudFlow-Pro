# Nacos 配置迁移指南

本指南详细记录了将 CloudFlow Pro 项目的硬编码配置迁移到 Nacos 配置中心的步骤、配置模型及验证方法。

## 1. 迁移概览

本次迁移旨在解决配置分散、硬编码、无法热更新等问题。通过引入 Nacos 配置中心，实现配置与代码的完全解耦。

### 1.1 涉及模块
*   `cloudflow-common`: 公共组件 (Redis, JWT, Security)
*   `cloudflow-gateway`: 网关 (路由)
*   `cloudflow-auth`: 认证服务 (数据库, 验证码)
*   `cloudflow-service-workflow`: 工作流服务 (Redis Stream)

## 2. Nacos 配置模型

我们采用了 **"共享配置 (Shared Config) + 扩展配置 (Extension Config)"** 的分层模型。

### 2.1 配置文件清单

| Data ID | Group | 作用域 | 包含内容 |
| :--- | :--- | :--- | :--- |
| `cloudflow-common.yaml` | `DEFAULT_GROUP` | 全局共享 | Redis 连接, Datasource (MySQL), JWT 密钥, Token 策略, 全局 Profile 路径 |
| `cloudflow-gateway-dev.yaml` | `DEFAULT_GROUP` | 网关专用 | 动态路由 (Routes), CORS 策略 |
| `cloudflow-auth-dev.yaml` | `DEFAULT_GROUP` | 认证专用 | 验证码参数 (Tolerance, TTL, Limits) |
| `cloudflow-service-workflow-dev.yaml` | `DEFAULT_GROUP` | 工作流专用 | Redis Stream Key, Group Name |

### 2.2 详细配置说明

#### cloudflow-common.yaml
```yaml
spring:
  data:
    redis: ... # Redis 连接信息
  datasource: ... # MySQL 连接信息 (所有服务共享一个主库)

cloudflow:
  profile: ... # 文件上传根路径
  security:
    jwt:
      secret: ... # JWT 签名密钥
    token:
      expiration: 30 # Token 有效期 (分钟)
      refresh-time: 20 # 刷新阈值 (分钟)
```

#### cloudflow-auth-dev.yaml
```yaml
cloudflow:
  captcha:
    tolerance: 5 # 滑块允许误差像素
    ttl: 300 # 验证码 Redis 过期时间 (秒)
    daily-limit: 100 # 单 IP 每日最大尝试次数
    pass-token-ttl: 120 # 验证通过 Token 有效期 (秒)
```

## 3. 代码改造说明

### 3.1 引入配置属性类 (ConfigurationProperties)

为了替代硬编码常量，我们创建了以下属性类，并添加了 `@RefreshScope` 以支持动态刷新：

*   **`com.cloudflow.common.config.properties.SecurityProperties`**:
    *   替代了 `CacheConstants.EXPIRATION`, `CacheConstants.REFRESH_TIME`。
    *   替代了 `TokenService` 中的 `@Value("${jwt.secret}")`。
*   **`com.cloudflow.auth.config.properties.CaptchaProperties`**:
    *   替代了 `CaptchaService` 中的所有 `static final` 常量。
*   **`com.cloudflow.workflow.config.properties.WorkflowProperties`**:
    *   管理 Redis Stream 的 Key 和 Group。

### 3.2 Bootstrap 配置文件

所有微服务的 `bootstrap.yaml` 已被精简，仅包含 Nacos 连接信息：

```yaml
spring:
  cloud:
    nacos:
      config:
        shared-configs:
          - data-id: cloudflow-common.yaml
            refresh: true
```

## 4. 部署与验证

### 4.1 初始化配置
1.  找到脚本: `config/nacos_init.sql`。
2.  在 Nacos 数据库中执行该脚本，导入初始配置。

### 4.2 启动服务
1.  确保 Nacos Server (localhost:8848) 已启动。
2.  依次启动 `cloudflow-auth`, `cloudflow-service-workflow`, `cloudflow-gateway`。

### 4.3 验证热更新
1.  在 Nacos 控制台修改 `cloudflow-auth-dev.yaml` 中的 `cloudflow.captcha.daily-limit` 为 `50`。
2.  发布配置。
3.  观察 `cloudflow-auth` 控制台日志，应显示 `Refresh keys changed: [cloudflow.captcha.daily-limit]`。
4.  无需重启，新阈值即刻生效。
