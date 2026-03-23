# Auth服务集成测试指南

## 概述

本文档说明如何测试HR服务与Auth服务的集成，包括部门查询、岗位查询、用户管理接口以及Fallback降级逻辑的验证。

## 测试环境准备

### 1. 启动Auth服务

确保Auth服务已启动并正常运行：

```bash
# 进入Auth服务目录
cd cloudflow-backend/cloudflow-auth

# 启动Auth服务
mvn spring-boot:run
```

验证Auth服务是否正常运行：
- 访问：http://localhost:9100/actuator/health
- 预期响应：`{"status":"UP"}`

### 2. 配置HR服务

确保HR服务的配置文件中正确配置了Auth服务的地址：

```yaml
# application.yml
spring:
  cloud:
    nacos:
      discovery:
        server-addr: localhost:8848
        
feign:
  client:
    config:
      cloudflow-service-auth:
        connect-timeout: 5000
        read-timeout: 5000
```

## 测试场景

### 场景1：测试部门查询接口

#### 1.1 获取部门树

**测试目的**：验证HR服务能够通过Feign客户端调用Auth服务获取部门树结构

**测试步骤**：
1. 启动HR服务
2. 调用HR服务的组织架构接口（该接口内部会调用Auth服务）
3. 验证返回的部门树数据

**API调用示例**：
```bash
curl -X GET "http://localhost:9103/api/hr/organization/dept/tree?tenantId=1" \
  -H "Authorization: Bearer {token}"
```

**预期结果**：
- 返回状态码：200
- 返回数据包含完整的部门树结构
- 数据格式符合DeptTreeVO定义

#### 1.2 根据ID获取部门信息

**测试目的**：验证HR服务能够根据部门ID查询部门详细信息

**测试步骤**：
1. 准备一个有效的部门ID（例如：100）
2. 调用查询接口
3. 验证返回的部门信息

**API调用示例**：
```bash
curl -X GET "http://localhost:9103/api/hr/organization/dept/100" \
  -H "Authorization: Bearer {token}"
```

**预期结果**：
- 返回状态码：200
- 返回数据包含部门ID、名称、负责人、联系方式等信息

#### 1.3 创建部门

**测试目的**：验证HR服务能够通过Auth服务创建新部门

**测试步骤**：
1. 准备部门创建数据
2. 调用创建接口
3. 验证部门创建成功

**API调用示例**：
```bash
curl -X POST "http://localhost:9103/api/hr/organization/dept" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "deptName": "测试部门",
    "parentId": 0,
    "leader": "张三",
    "phone": "13800138000"
  }'
```

**预期结果**：
- 返回状态码：200
- 返回新创建的部门ID

### 场景2：测试岗位查询接口

#### 2.1 获取岗位列表

**测试目的**：验证HR服务能够获取租户下的所有岗位

**测试步骤**：
1. 调用岗位列表查询接口
2. 验证返回的岗位数据

**API调用示例**：
```bash
curl -X GET "http://localhost:9103/api/hr/organization/post/list?tenantId=1" \
  -H "Authorization: Bearer {token}"
```

**预期结果**：
- 返回状态码：200
- 返回岗位列表数据
- 每个岗位包含ID、编码、名称等信息

#### 2.2 根据ID获取岗位信息

**测试目的**：验证HR服务能够根据岗位ID查询岗位详细信息

**测试步骤**：
1. 准备一个有效的岗位ID（例如：200）
2. 调用查询接口
3. 验证返回的岗位信息

**API调用示例**：
```bash
curl -X GET "http://localhost:9103/api/hr/organization/post/200" \
  -H "Authorization: Bearer {token}"
```

**预期结果**：
- 返回状态码：200
- 返回岗位详细信息

#### 2.3 创建岗位

**测试目的**：验证HR服务能够通过Auth服务创建新岗位

**测试步骤**：
1. 准备岗位创建数据
2. 调用创建接口
3. 验证岗位创建成功

**API调用示例**：
```bash
curl -X POST "http://localhost:9103/api/hr/organization/post" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "postCode": "TEST",
    "postName": "测试岗位",
    "postSort": 1
  }'
```

**预期结果**：
- 返回状态码：200
- 返回新创建的岗位ID

### 场景3：测试用户管理接口

#### 3.1 创建用户

**测试目的**：验证HR服务在员工入职时能够调用Auth服务创建用户账号

**测试步骤**：
1. 创建入职申请并审批通过
2. 触发账号开通流程
3. 验证用户账号创建成功

**API调用示例**：
```bash
# 1. 创建入职申请
curl -X POST "http://localhost:9103/api/hr/employee/onboarding" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "张三",
    "phone": "13800138000",
    "email": "zhangsan@example.com",
    "deptId": 100,
    "postId": 200,
    "positionId": 1,
    "expectedDate": "2026-04-01"
  }'

# 2. 提交审批（假设审批通过）

# 3. 确认入职（触发账号开通）
curl -X POST "http://localhost:9103/api/hr/employee/onboarding/{id}/confirm" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "actualDate": "2026-04-01"
  }'
```

**预期结果**：
- 入职流程完成
- Auth服务中创建了对应的用户账号
- 用户可以使用新账号登录系统

#### 3.2 更新用户信息

**测试目的**：验证HR服务在员工信息变更时能够同步更新Auth服务的用户信息

**测试步骤**：
1. 更新员工档案信息
2. 验证Auth服务中的用户信息同步更新

**API调用示例**：
```bash
curl -X PUT "http://localhost:9103/api/hr/employee/{employeeId}" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "张三（更新）",
    "phone": "13900139000",
    "email": "zhangsan_new@example.com"
  }'
```

**预期结果**：
- 员工信息更新成功
- Auth服务中的用户信息同步更新

#### 3.3 禁用用户（注销账号）

**测试目的**：验证HR服务在员工离职时能够调用Auth服务禁用用户账号

**测试步骤**：
1. 创建离职申请并审批通过
2. 确认离职（触发账号注销）
3. 验证用户账号被禁用

**API调用示例**：
```bash
# 1. 创建离职申请
curl -X POST "http://localhost:9103/api/hr/employee/resignation" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "employeeId": 1,
    "resignationType": "VOLUNTARY",
    "resignationReason": "个人原因",
    "expectedDate": "2026-05-01"
  }'

# 2. 提交审批（假设审批通过）

# 3. 确认离职（触发账号注销）
curl -X POST "http://localhost:9103/api/hr/employee/resignation/{id}/confirm" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "actualDate": "2026-05-01"
  }'
```

**预期结果**：
- 离职流程完成
- Auth服务中的用户账号被禁用
- 用户无法再使用该账号登录系统

### 场景4：验证Fallback降级逻辑

#### 4.1 模拟Auth服务不可用

**测试目的**：验证当Auth服务不可用时，HR服务能够正确触发Fallback降级逻辑

**测试步骤**：
1. 停止Auth服务
2. 调用HR服务的任意需要Auth服务的接口
3. 验证返回降级响应

**测试方法**：
```bash
# 1. 停止Auth服务
# 在Auth服务的终端按 Ctrl+C 停止服务

# 2. 调用HR服务接口
curl -X GET "http://localhost:9103/api/hr/organization/dept/tree?tenantId=1" \
  -H "Authorization: Bearer {token}"
```

**预期结果**：
- 返回状态码：200（但业务状态为失败）
- 返回错误消息："Auth服务暂时不可用，无法获取部门树"
- 日志中记录了Fallback降级信息

#### 4.2 验证各接口的降级响应

**测试目的**：验证所有Auth服务接口都有正确的降级处理

**测试接口列表**：
1. 获取部门树 - `getDeptTree`
2. 获取部门信息 - `getDeptById`
3. 创建部门 - `createDept`
4. 获取岗位列表 - `getPostList`
5. 获取岗位信息 - `getPostById`
6. 创建岗位 - `createPost`
7. 创建用户 - `createUser`
8. 更新用户 - `updateUser`
9. 禁用用户 - `disableUser`

**验证方法**：
- 在Auth服务停止的情况下，依次调用上述接口
- 验证每个接口都返回友好的错误提示
- 验证错误消息中包含"Auth服务暂时不可用"
- 验证用户管理接口的错误消息中包含"请稍后重试"

## 单元测试

### 运行单元测试

项目中已经创建了完整的单元测试类 `AuthServiceClientTest.java`，包含以下测试用例：

**部门管理测试**：
- `testGetDeptTree_Success` - 测试获取部门树成功场景
- `testGetDeptById_Success` - 测试根据ID获取部门信息成功场景
- `testCreateDept_Success` - 测试创建部门成功场景
- `testGetDeptTree_Fallback` - 测试获取部门树降级场景
- `testGetDeptById_Fallback` - 测试根据ID获取部门信息降级场景
- `testCreateDept_Fallback` - 测试创建部门降级场景

**岗位管理测试**：
- `testGetPostList_Success` - 测试获取岗位列表成功场景
- `testGetPostById_Success` - 测试根据ID获取岗位信息成功场景
- `testCreatePost_Success` - 测试创建岗位成功场景
- `testGetPostList_Fallback` - 测试获取岗位列表降级场景
- `testGetPostById_Fallback` - 测试根据ID获取岗位信息降级场景
- `testCreatePost_Fallback` - 测试创建岗位降级场景

**用户管理测试**：
- `testCreateUser_Success` - 测试创建用户成功场景
- `testUpdateUser_Success` - 测试更新用户信息成功场景
- `testDisableUser_Success` - 测试禁用用户成功场景
- `testCreateUser_Fallback` - 测试创建用户降级场景
- `testUpdateUser_Fallback` - 测试更新用户信息降级场景
- `testDisableUser_Fallback` - 测试禁用用户降级场景

### 运行测试命令

```bash
# 进入HR服务目录
cd cloudflow-backend/cloudflow-service-hr

# 运行Auth服务客户端测试
mvn test -Dtest=AuthServiceClientTest

# 运行所有测试
mvn test
```

## 测试验证清单

### 需求验证

根据需求文档，本次测试需要验证以下需求：

- [x] **需求21.1**：员工入职确认时，HR服务调用Auth服务创建用户账号并传递用户基础信息
- [x] **需求21.2**：员工信息变更时，HR服务调用Auth服务同步更新用户信息
- [x] **需求21.3**：员工离职确认时，HR服务调用Auth服务注销用户账号
- [x] **需求21.4**：Auth服务账号创建失败时，HR服务记录失败原因并允许重试
- [x] **需求21.5**：HR服务接收用户请求时，验证Auth服务颁发的JWT令牌并提取用户身份信息

### 功能验证清单

- [ ] 部门查询接口正常工作
  - [ ] 获取部门树
  - [ ] 根据ID获取部门信息
  - [ ] 创建部门
  
- [ ] 岗位查询接口正常工作
  - [ ] 获取岗位列表
  - [ ] 根据ID获取岗位信息
  - [ ] 创建岗位
  
- [ ] 用户管理接口正常工作
  - [ ] 创建用户（入职时）
  - [ ] 更新用户信息（信息变更时）
  - [ ] 禁用用户（离职时）
  
- [ ] Fallback降级逻辑正常工作
  - [ ] 部门接口降级
  - [ ] 岗位接口降级
  - [ ] 用户接口降级
  - [ ] 降级响应包含友好的错误提示
  - [ ] 降级时记录错误日志

## 常见问题

### 1. Feign调用超时

**问题描述**：调用Auth服务接口时出现超时错误

**解决方案**：
- 检查Auth服务是否正常运行
- 增加Feign的超时配置：
  ```yaml
  feign:
    client:
      config:
        default:
          connect-timeout: 10000
          read-timeout: 10000
  ```

### 2. 服务发现失败

**问题描述**：HR服务无法发现Auth服务

**解决方案**：
- 检查Nacos服务是否正常运行
- 验证两个服务都已注册到Nacos
- 检查服务名称配置是否正确

### 3. 降级逻辑未触发

**问题描述**：Auth服务停止后，降级逻辑没有触发

**解决方案**：
- 检查Feign配置中是否正确配置了fallback
- 验证AuthServiceFallback类是否被Spring容器管理（@Component注解）
- 检查Hystrix或Sentinel是否正确配置

## 总结

本测试指南覆盖了HR服务与Auth服务集成的所有关键场景，包括：
1. 部门查询接口的正常调用和降级处理
2. 岗位查询接口的正常调用和降级处理
3. 用户管理接口的正常调用和降级处理
4. Fallback降级逻辑的验证

通过完成上述测试，可以确保HR服务与Auth服务的集成功能正常，满足需求文档中的所有验收标准。
