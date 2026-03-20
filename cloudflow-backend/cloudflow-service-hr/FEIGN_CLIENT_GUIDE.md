# Feign客户端配置指南

## 概述

本文档说明HR服务中Feign客户端的配置和使用方法。HR服务通过Feign客户端与Auth服务和Workflow服务进行通信。

## 已实现的Feign客户端

### 1. AuthServiceClient（Auth服务客户端）

**服务名称**: `cloudflow-service-auth`

**接口路径**: `/api/auth`

**功能**:
- 部门管理：获取部门树、查询部门信息、创建部门
- 岗位管理：获取岗位列表、查询岗位信息、创建岗位
- 用户管理：创建用户、更新用户信息、禁用用户

**使用示例**:
```java
@Service
@RequiredArgsConstructor
public class EmployeeService {
    
    private final AuthServiceClient authServiceClient;
    
    public void createEmployeeAccount(Employee employee) {
        // 创建用户账号
        UserCreateDTO dto = new UserCreateDTO();
        dto.setTenantId(employee.getTenantId());
        dto.setUserName(employee.getEmployeeNo());
        dto.setNickName(employee.getName());
        dto.setEmail(employee.getEmail());
        dto.setPhonenumber(employee.getPhone());
        dto.setDeptId(employee.getDeptId());
        dto.setPostIds(Collections.singletonList(employee.getPostId()));
        
        Result<Long> result = authServiceClient.createUser(dto);
        if (!result.isSuccess()) {
            throw new HrBusinessException("创建用户账号失败：" + result.getMsg());
        }
        
        employee.setUserId(result.getData());
    }
}
```

### 2. WorkflowServiceClient（Workflow服务客户端）

**服务名称**: `cloudflow-service-workflow`

**接口路径**: `/api/workflow`

**功能**:
- 启动流程：发起审批流程
- 查询流程：查询流程实例状态
- 撤销流程：取消审批流程

**使用示例**:
```java
@Service
@RequiredArgsConstructor
public class OnboardingService {
    
    private final WorkflowServiceClient workflowServiceClient;
    
    public void submitOnboardingApplication(OnboardingApplication application) {
        // 启动入职审批流程
        ProcessStartDTO dto = new ProcessStartDTO();
        dto.setTenantId(application.getTenantId());
        dto.setProcessDefinitionKey("onboarding_approval");
        dto.setBusinessType("ONBOARDING");
        dto.setBusinessId(application.getId());
        dto.setBusinessNo(application.getApplicationNo());
        dto.setProcessTitle("入职申请-" + application.getName());
        dto.setStartUserId(StpUtil.getLoginIdAsLong());
        
        Result<String> result = workflowServiceClient.startProcess(dto);
        if (!result.isSuccess()) {
            throw new HrBusinessException("启动审批流程失败：" + result.getMsg());
        }
        
        application.setProcessInstanceId(result.getData());
        application.setStatus("APPROVING");
    }
}
```

## Feign配置说明

### 1. 超时配置

在 `application.yml` 中配置：

```yaml
feign:
  client:
    config:
      default:
        connect-timeout: 5000  # 默认连接超时5秒
        read-timeout: 10000    # 默认读取超时10秒
      cloudflow-service-auth:
        connect-timeout: 3000  # Auth服务连接超时3秒
        read-timeout: 5000     # Auth服务读取超时5秒
      cloudflow-service-workflow:
        connect-timeout: 5000  # Workflow服务连接超时5秒
        read-timeout: 15000    # Workflow服务读取超时15秒（工作流操作可能较慢）
```

### 2. 重试策略

在 `FeignConfig` 中配置：

```java
@Bean
public Retryer feignRetryer() {
    // 重试间隔100ms，最大间隔1000ms，最多重试3次（包括首次请求）
    return new Retryer.Default(100, 1000, 3);
}
```

### 3. 日志级别

在 `FeignConfig` 中配置：

```java
@Bean
public Logger.Level feignLoggerLevel() {
    return Logger.Level.BASIC;  // NONE, BASIC, HEADERS, FULL
}
```

在 `application.yml` 中启用日志：

```yaml
logging:
  level:
    com.cloudflow.hr.client: DEBUG  # 启用Feign客户端日志
```

### 4. 请求拦截器

`FeignRequestInterceptor` 自动传递以下信息：
- 租户ID（X-Tenant-Id）
- 用户ID（X-User-Id）
- 认证Token（Authorization）

## Fallback降级机制

### 1. AuthServiceFallback

当Auth服务不可用时，返回友好的错误信息：

```java
@Override
public Result<Long> createUser(UserCreateDTO dto) {
    log.error("Auth服务调用失败：创建用户失败，用户名={}", dto.getUserName());
    return Result.fail("Auth服务暂时不可用，无法创建用户账号，请稍后重试");
}
```

### 2. WorkflowServiceFallback

当Workflow服务不可用时，返回友好的错误信息：

```java
@Override
public Result<String> startProcess(ProcessStartDTO dto) {
    log.error("Workflow服务调用失败：启动流程失败，业务类型={}，业务ID={}", 
        dto.getBusinessType(), dto.getBusinessId());
    return Result.fail("工作流服务暂时不可用，无法启动审批流程，请稍后重试");
}
```

## 测试方法

### 1. 使用测试控制器

访问以下接口测试Feign客户端：

```bash
# 测试获取部门树
GET http://localhost:9005/api/hr/test/feign/auth/dept/tree?tenantId=100000

# 测试获取岗位列表
GET http://localhost:9005/api/hr/test/feign/auth/post/list?tenantId=100000

# 测试查询流程实例
GET http://localhost:9005/api/hr/test/feign/workflow/process/{processInstanceId}

# 测试Fallback降级
GET http://localhost:9005/api/hr/test/feign/test/fallback
```

### 2. 查看日志

启用DEBUG日志查看Feign调用详情：

```yaml
logging:
  level:
    com.cloudflow.hr.client: DEBUG
```

## 注意事项

### 1. 服务发现

确保Auth服务和Workflow服务已在Nacos中注册：
- `cloudflow-service-auth`
- `cloudflow-service-workflow`

### 2. 熔断器

已启用熔断器，当服务不可用时会自动降级：

```yaml
feign:
  circuitbreaker:
    enabled: true
```

### 3. 错误处理

业务代码中应该处理Feign调用失败的情况：

```java
Result<Long> result = authServiceClient.createUser(dto);
if (!result.isSuccess()) {
    // 处理失败情况
    throw new HrBusinessException("创建用户失败：" + result.getMsg());
}
```

### 4. 事务处理

Feign调用不在本地事务范围内，需要考虑分布式事务：
- 使用Seata分布式事务（如果需要）
- 实现补偿机制
- 记录失败日志，支持人工干预

## 流程类型定义

Workflow服务支持的业务类型：

| 业务类型 | 说明 | 流程定义Key |
|---------|------|------------|
| ONBOARDING | 入职审批 | onboarding_approval |
| PROBATION_CONFIRMATION | 转正审批 | probation_confirmation_approval |
| TRANSFER | 调岗审批 | transfer_approval |
| RESIGNATION | 离职审批 | resignation_approval |
| LEAVE | 请假审批 | leave_approval |
| OVERTIME | 加班审批 | overtime_approval |
| SALARY_ADJUSTMENT | 调薪审批 | salary_adjustment_approval |
| RECRUITMENT_REQUEST | 招聘需求审批 | recruitment_request_approval |
| OFFER | Offer审批 | offer_approval |
| ATTENDANCE_SUPPLEMENT | 补卡审批 | attendance_supplement_approval |

## 性能优化建议

### 1. 使用连接池

可以启用OkHttp或HttpClient客户端以提高性能：

```yaml
feign:
  okhttp:
    enabled: true
```

需要添加依赖：
```xml
<dependency>
    <groupId>io.github.openfeign</groupId>
    <artifactId>feign-okhttp</artifactId>
</dependency>
```

### 2. 启用请求压缩

已启用请求和响应压缩：

```yaml
feign:
  compression:
    request:
      enabled: true
      min-request-size: 2048
    response:
      enabled: true
```

### 3. 合理设置超时时间

根据实际业务场景调整超时时间：
- 快速查询接口：3-5秒
- 复杂业务接口：10-15秒
- 长时间操作：考虑异步处理

## 故障排查

### 1. 连接超时

检查：
- 目标服务是否启动
- 网络是否通畅
- Nacos服务发现是否正常

### 2. 读取超时

检查：
- 目标服务响应是否过慢
- 是否需要增加超时时间
- 是否需要优化目标服务性能

### 3. Fallback未生效

检查：
- 是否启用了熔断器：`feign.circuitbreaker.enabled=true`
- Fallback类是否添加了 `@Component` 注解
- FeignClient是否正确配置了 `fallback` 属性

## 相关文档

- [Spring Cloud OpenFeign官方文档](https://docs.spring.io/spring-cloud-openfeign/docs/current/reference/html/)
- [Feign GitHub](https://github.com/OpenFeign/feign)
- [CloudFlow Pro架构文档](../../../docs/)
