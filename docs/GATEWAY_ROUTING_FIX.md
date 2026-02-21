# 网关路由问题修复文档

## 问题描述

前端监控页面访问后端API时出现404错误:
- 请求: `/monitor/overview`
- 错误: `No static resource monitor/overview`

## 根本原因

**网关StripPrefix配置导致路径被错误截断**

### 请求流程分析

1. **前端代码**: `request.get('/workflow/monitor/overview')`
2. **加上baseURL**: `/api/workflow/monitor/overview`
3. **Vite代理去掉/api**: `/workflow/monitor/overview`
4. **网关路由匹配**: 
   ```yaml
   - id: cloudflow-workflow
     uri: lb://cloudflow-service-workflow
     predicates:
       - Path=/workflow/**
     filters:
       - StripPrefix=1  # 去掉 /workflow
   ```
5. **转发到服务**: `/monitor/overview`
6. **Controller期望路径**: `/workflow/monitor/overview` ❌

### 问题所在

网关配置中的`StripPrefix=1`会去掉路径的第一段(`/workflow`),但Controller的`@RequestMapping`仍然包含`/workflow`前缀,导致路径不匹配。

## 解决方案

**修改Controller路径,去掉`/workflow`前缀**

在微服务架构中,网关已经通过路由规则区分了服务(`/workflow/**` → workflow服务),服务内部不需要再加服务名前缀。

## 修复的Controller

### 1. WorkflowMonitorController
```java
// 修复前
@RequestMapping("/workflow/monitor")

// 修复后
@RequestMapping("/monitor")
```

### 2. AlertController
```java
// 修复前
@RequestMapping("/workflow/alert")

// 修复后
@RequestMapping("/alert")
```

### 3. WorkflowEnhanceController
```java
// 修复前
@RequestMapping("/workflow/enhance")

// 修复后
@RequestMapping("/enhance")
```

### 4. ProcessCategoryController
```java
// 修复前
@RequestMapping("/workflow/category")

// 修复后
@RequestMapping("/category")
```

## 已验证正确的Controller

以下Controller路径已经正确,无需修改:
- `ProcessCopyController`: `@RequestMapping("/copy")`
- `DeployEnhancementController`: `@RequestMapping("/deploy")`

## 最终路由映射

| 前端请求 | 网关转发 | Controller路径 | 最终匹配 |
|---------|---------|---------------|---------|
| `/api/workflow/monitor/overview` | `/monitor/overview` | `/monitor/overview` | ✅ |
| `/api/workflow/alert/timeout/list` | `/alert/timeout/list` | `/alert/timeout/list` | ✅ |
| `/api/workflow/enhance/task/addSign` | `/enhance/task/addSign` | `/enhance/task/addSign` | ✅ |
| `/api/workflow/category/tree` | `/category/tree` | `/category/tree` | ✅ |

## 验证步骤

1. 重新编译workflow服务
2. 重启服务
3. 访问监控页面测试API调用
4. 检查是否还有404错误

## 相关文件

- 网关配置: `config/cloudflow-gateway.yaml`
- Vite代理配置: `cloudflow-frontend/vite.config.ts`
- 前端API配置: `cloudflow-frontend/src/services/api/request.ts`

## 经验教训

1. **微服务路由设计**: 网关负责服务路由,服务内部不应包含服务名前缀
2. **StripPrefix使用**: 使用`StripPrefix`时要确保Controller路径与转发后的路径匹配
3. **统一规范**: 所有Controller应遵循相同的路径规范,避免混乱

## 修复时间

2026-02-22 06:26

## 修复人员

CloudFlow Team
