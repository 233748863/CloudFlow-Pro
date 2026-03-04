# 本地开发环境 Nacos 配置指南

## 配置概述

本文档说明如何在本地运行后端服务，同时连接到开发服务器上的 Nacos。

## Nacos 服务器信息

- **服务器地址**: http://192.168.1.173:18848
- **命名空间名称**: WorkflowPro
- **命名空间ID**: ae5cca25-3dae-4da1-897d-25edb370e00d
- **用户名**: nacos
- **密码**: nacos

## 已配置的服务

所有后端服务的 `bootstrap.yaml` 配置文件已更新为连接到开发服务器的 Nacos：

### 1. Gateway 服务 (端口: 9000)
**配置文件**: `cloudflow-backend/cloudflow-gateway/src/main/resources/bootstrap.yaml`

```yaml
spring:
  cloud:
    nacos:
      discovery:
        server-addr: 192.168.1.173:18848
        namespace: ae5cca25-3dae-4da1-897d-25edb370e00d
      config:
        server-addr: 192.168.1.173:18848
        namespace: ae5cca25-3dae-4da1-897d-25edb370e00d
```

### 2. Auth 服务 (端口: 9001)
**配置文件**: `cloudflow-backend/cloudflow-auth/src/main/resources/bootstrap.yaml`

```yaml
spring:
  cloud:
    nacos:
      discovery:
        server-addr: 192.168.1.173:18848
        namespace: ae5cca25-3dae-4da1-897d-25edb370e00d
      config:
        server-addr: 192.168.1.173:18848
        namespace: ae5cca25-3dae-4da1-897d-25edb370e00d
```

### 3. Workflow 服务 (端口: 9002)
**配置文件**: `cloudflow-backend/cloudflow-service-workflow/src/main/resources/bootstrap.yaml`

```yaml
spring:
  cloud:
    nacos:
      discovery:
        server-addr: ${NACOS_SERVER:192.168.1.173:18848}
        namespace: ${NACOS_NAMESPACE:ae5cca25-3dae-4da1-897d-25edb370e00d}
      config:
        server-addr: ${NACOS_SERVER:192.168.1.173:18848}
        namespace: ${NACOS_NAMESPACE:ae5cca25-3dae-4da1-897d-25edb370e00d}
```

**注意**: Workflow 服务支持通过环境变量覆盖配置。

### 4. OA 服务
**配置文件**: `cloudflow-backend/cloudflow-service-oa/src/main/resources/bootstrap.yaml`

```yaml
spring:
  cloud:
    nacos:
      server-addr: 192.168.1.173:18848
      username: nacos
      password: nacos
      config:
        namespace: ae5cca25-3dae-4da1-897d-25edb370e00d
      discovery:
        namespace: ae5cca25-3dae-4da1-897d-25edb370e00d
```

## 启动服务步骤

### 前置条件

1. **确保网络连通性**
   ```bash
   # 测试是否能访问 Nacos 服务器
   curl http://192.168.1.173:18848/nacos/
   ```

2. **确认 Nacos 配置已上传**
   
   项目中 `config/` 目录下已有现成的 Nacos 配置文件，需要导入到 Nacos 的 `WorkflowPro` 命名空间中。
   
   **现有配置文件清单：**
   
   | 文件 | Data ID | 说明 | 状态 |
   |------|---------|------|------|
   | `config/cloudflow-common.yaml` | cloudflow-common.yaml | 公共配置（数据库、Redis、JWT等） | ✅ 已有 |
   | `config/cloudflow-gateway.yaml` | cloudflow-gateway.yaml | 网关路由配置 | ✅ 已有 |
   | `config/cloudflow-auth.yaml` | cloudflow-auth.yaml | 认证服务配置 | ✅ 已有 |
   | `config/cloudflow-service-workflow.yaml` | cloudflow-service-workflow.yaml | 工作流服务配置 | ✅ 已有 |
   | `config/cloudflow-oa.yaml` | cloudflow-oa.yaml | OA 服务配置 | ✅ 已有 |
   
   **导入步骤：**
   
   a. 登录 Nacos 控制台: http://192.168.1.173:18848/nacos （用户名/密码: nacos/nacos）
   
   b. 切换到 `WorkflowPro` 命名空间
   
   c. 进入 "配置管理" -> "配置列表"
   
   d. 逐个创建配置（点击 "+" 按钮）：
   
   **配置1: cloudflow-common.yaml**
   - Data ID: `cloudflow-common.yaml`
   - Group: `DEFAULT_GROUP`
   - 配置格式: `YAML`
   - 配置内容: 复制 `config/cloudflow-common.yaml` 文件内容
   - ✅ **已配置**: 数据库 (192.168.1.173:3306/cloud_flow_db) 和 Redis (192.168.1.173:6379) 已配置
   
   **配置2: cloudflow-gateway.yaml**
   - Data ID: `cloudflow-gateway.yaml`
   - Group: `DEFAULT_GROUP`
   - 配置格式: `YAML`
   - 配置内容: 复制 `config/cloudflow-gateway.yaml` 文件内容
   - ✅ **可直接使用**: 网关路由配置，无需修改
   
   **配置3: cloudflow-auth.yaml**
   - Data ID: `cloudflow-auth.yaml`
   - Group: `DEFAULT_GROUP`
   - 配置格式: `YAML`
   - 配置内容: 复制 `config/cloudflow-auth.yaml` 文件内容
   - ✅ **已配置**: 数据库和 Redis 已配置为开发服务器地址
   
   **配置4: cloudflow-service-workflow.yaml**
   - Data ID: `cloudflow-service-workflow.yaml`
   - Group: `DEFAULT_GROUP`
   - 配置格式: `YAML`
   - 配置内容: 复制 `config/cloudflow-service-workflow.yaml` 文件内容
   - ✅ **已配置**: 数据库和 Redis 已配置为开发服务器地址
   
   **配置5: cloudflow-oa.yaml**
   - Data ID: `cloudflow-oa.yaml`
   - Group: `DEFAULT_GROUP`
   - 配置格式: `YAML`
   - 配置内容: 复制 `config/cloudflow-oa.yaml` 文件内容
   - ✅ **已配置**: 数据库和 Redis 已配置为开发服务器地址
   
   e. 确认所有 5 个配置文件都已创建成功

### 启动顺序

建议按以下顺序启动服务：

#### 1. 启动 Gateway 服务
```bash
cd cloudflow-backend/cloudflow-gateway
mvn spring-boot:run
```

#### 2. 启动 Auth 服务
```bash
cd cloudflow-backend/cloudflow-auth
mvn spring-boot:run
```

#### 3. 启动 Workflow 服务
```bash
cd cloudflow-backend/cloudflow-service-workflow
mvn spring-boot:run
```

#### 4. 启动 OA 服务（可选）
```bash
cd cloudflow-backend/cloudflow-service-oa
mvn spring-boot:run
```

### 使用 IDE 启动

如果使用 IntelliJ IDEA 或其他 IDE：

1. 打开每个服务的主类（通常是 `*Application.java`）
2. 右键点击 -> Run
3. 服务会自动读取 `bootstrap.yaml` 配置

## 验证服务注册

### 1. 检查 Nacos 控制台

访问: http://192.168.1.173:18848/nacos

- 用户名: nacos
- 密码: nacos
- 切换到 `WorkflowPro` 命名空间
- 在"服务管理" -> "服务列表"中查看已注册的服务

### 2. 检查服务健康状态

```bash
# Gateway 健康检查
curl http://localhost:9000/actuator/health

# Auth 健康检查
curl http://localhost:9001/actuator/health

# Workflow 健康检查
curl http://localhost:9002/actuator/health
```

## 常见问题排查

### 问题 1: 无法连接到 Nacos

**症状**: 服务启动时报错 `Connection refused` 或 `Unable to connect to Nacos server`

**解决方案**:
1. 检查网络连接: `ping 192.168.1.173`
2. 检查 Nacos 服务是否运行: `curl http://192.168.1.173:18848/nacos/`
3. 检查防火墙设置

### 问题 2: 命名空间配置错误

**症状**: 服务启动成功但在 Nacos 控制台看不到服务

**解决方案**:
1. 确认命名空间 ID 正确: `ae5cca25-3dae-4da1-897d-25edb370e00d`
2. 在 Nacos 控制台切换到正确的命名空间查看

### 问题 3: 配置文件未找到

**症状**: 服务启动时报错 `config data not found`

**解决方案**:
1. 登录 Nacos 控制台
2. 切换到 `WorkflowPro` 命名空间
3. 在"配置管理" -> "配置列表"中添加缺失的配置文件

### 问题 4: 端口冲突

**症状**: 服务启动失败，提示端口已被占用

**解决方案**:
```bash
# Windows 查看端口占用
netstat -ano | findstr :9000
netstat -ano | findstr :9001
netstat -ano | findstr :9002

# 结束占用端口的进程
taskkill /PID <进程ID> /F
```

## 环境变量配置（可选）

对于 Workflow 服务，你也可以通过环境变量覆盖配置：

```bash
# Windows CMD
set NACOS_SERVER=192.168.1.173:18848
set NACOS_NAMESPACE=ae5cca25-3dae-4da1-897d-25edb370e00d
mvn spring-boot:run

# Windows PowerShell
$env:NACOS_SERVER="192.168.1.173:18848"
$env:NACOS_NAMESPACE="ae5cca25-3dae-4da1-897d-25edb370e00d"
mvn spring-boot:run
```

## 切换回本地 Nacos

如果需要切换回本地 Nacos，只需将配置文件中的地址改回：

```yaml
server-addr: localhost:8848
namespace: # 留空或使用本地命名空间
```

## 相关文档

- [Nacos 配置指南](./NACOS_CONFIGURATION_GUIDE.md)
- [Nacos 微服务部署](./NACOS_MICROSERVICE_DEPLOYMENT.md)
- [后端生产就绪评估](./BACKEND_PRODUCTION_READINESS_FINAL_ASSESSMENT.md)

## 技术支持

如遇到问题，请检查：
1. 服务日志输出
2. Nacos 控制台的服务状态
3. 网络连接状态
4. 配置文件是否正确上传到 Nacos
