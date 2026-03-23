# Workflow服务集成测试指南

## 概述

本文档说明如何测试HR服务与Workflow服务的集成，包括流程启动、流程查询、流程撤销以及审批结果回调的验证。

## 测试环境准备

### 1. 启动Workflow服务

确保Workflow服务已启动并正常运行：

```bash
# 进入Workflow服务目录
cd cloudflow-backend/cloudflow-service-workflow

# 启动Workflow服务
mvn spring-boot:run
```

验证Workflow服务是否正常运行：
- 访问：http://localhost:9102/actuator/health
- 预期响应：`{"status":"UP"}`

### 2. 配置HR服务

确保HR服务的配置文件中正确配置了Workflow服务的地址：

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
      cloudflow-service-workflow:
        connect-timeout: 5000
        read-timeout: 5000
```

## 测试场景

### 场景1：测试流程启动接口

#### 1.1 启动入职审批流程

**测试目的**：验证HR服务能够通过Feign客户端调用Workflow服务启动入职审批流程

**测试步骤**：
1. 创建入职申请
2. 提交审批（触发流程启动）
3. 验证流程启动成功并返回流程实例ID

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

# 2. 提交审批（触发流程启动）
curl -X POST "http://localhost:9103/api/hr/employee/onboarding/{id}/submit" \
  -H "Authorization: Bearer {token}"
```

**预期结果**：
- 返回状态码：200
- 入职申请状态更新为"审批中"
- 申请记录中包含流程实例ID
- Workflow服务中创建了对应的流程实例

#### 1.2 启动转正审批流程

**测试目的**：验证HR服务能够启动转正审批流程

**API调用示例**：
```bash
# 创建并提交转正申请
curl -X POST "http://localhost:9103/api/hr/employee/probation" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "employeeId": 1,
    "expectedRegularDate": "2026-04-01",
    "selfEvaluation": "试用期表现良好"
  }'
```

**预期结果**：
- 转正申请状态更新为"审批中"
- 申请记录中包含流程实例ID
- Workflow服务中创建了转正审批流程

#### 1.3 启动调岗审批流程

**API调用示例**：
```bash
curl -X POST "http://localhost:9103/api/hr/employee/transfer" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "employeeId": 1,
    "toDeptId": 101,
    "toPostId": 201,
    "toPositionId": 2,
    "transferType": "DEPT",
    "reason": "业务需要",
    "effectiveDate": "2026-05-01"
  }'
```

#### 1.4 启动离职审批流程

**API调用示例**：
```bash
curl -X POST "http://localhost:9103/api/hr/employee/resignation" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "employeeId": 1,
    "resignationType": "VOLUNTARY",
    "resignationReason": "个人原因",
    "expectedDate": "2026-05-01"
  }'
```

#### 1.5 启动请假审批流程

**API调用示例**：
```bash
curl -X POST "http://localhost:9103/api/hr/attendance/leave" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "leaveTypeId": 1,
    "startTime": "2026-04-10 09:00:00",
    "endTime": "2026-04-12 18:00:00",
    "reason": "家庭事务"
  }'
```

#### 1.6 启动加班审批流程

**API调用示例**：
```bash
curl -X POST "http://localhost:9103/api/hr/attendance/overtime" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "startTime": "2026-03-25 19:00:00",
    "endTime": "2026-03-25 22:00:00",
    "overtimeType": "WORKDAY",
    "reason": "项目紧急",
    "compensationType": "TIME_OFF"
  }'
```

#### 1.7 启动调薪审批流程

**API调用示例**：
```bash
curl -X POST "http://localhost:9103/api/hr/salary/adjustment" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "employeeId": 1,
    "adjustmentType": "PROMOTION",
    "adjustmentReason": "晋升调薪",
    "afterSalaryData": {...},
    "effectiveDate": "2026-05-01"
  }'
```

#### 1.8 启动招聘需求审批流程

**API调用示例**：
```bash
curl -X POST "http://localhost:9103/api/hr/recruitment/request" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "deptId": 100,
    "positionId": 1,
    "headcount": 2,
    "jobRequirements": "3年以上Java开发经验",
    "salaryMin": 15000,
    "salaryMax": 25000,
    "expectedDate": "2026-05-01"
  }'
```

#### 1.9 启动Offer审批流程

**API调用示例**：
```bash
curl -X POST "http://localhost:9103/api/hr/recruitment/offer/{offerId}/submit" \
  -H "Authorization: Bearer {token}"
```

#### 1.10 启动补卡审批流程

**API调用示例**：
```bash
curl -X POST "http://localhost:9103/api/hr/attendance/supplement" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "attendanceDate": "2026-03-20",
    "checkType": "CHECK_IN",
    "checkTime": "2026-03-20 09:00:00",
    "reason": "忘记打卡"
  }'
```

### 场景2：测试流程查询接口

#### 2.1 查询流程实例状态

**测试目的**：验证HR服务能够查询流程实例的当前状态

**测试步骤**：
1. 获取已启动的流程实例ID
2. 调用查询接口
3. 验证返回的流程状态信息

**API调用示例**：
```bash
curl -X GET "http://localhost:9103/api/hr/workflow/process/{processInstanceId}" \
  -H "Authorization: Bearer {token}"
```

**预期结果**：
- 返回状态码：200
- 返回流程实例信息，包括：
  - 流程实例ID
  - 业务类型
  - 业务ID
  - 流程状态（RUNNING/COMPLETED）
  - 当前节点
  - 审批结果（如果已完成）

#### 2.2 查询运行中的流程

**测试场景**：查询正在审批中的流程实例

**验证点**：
- 流程状态为"RUNNING"
- 当前节点显示正确的审批节点名称
- 审批结果为空

#### 2.3 查询已完成的流程

**测试场景**：查询已审批完成的流程实例

**验证点**：
- 流程状态为"COMPLETED"
- 审批结果为"APPROVED"或"REJECTED"
- 如果被拒绝，包含拒绝原因

### 场景3：测试流程撤销接口

#### 3.1 撤销运行中的流程

**测试目的**：验证HR服务能够撤销正在运行的流程

**测试步骤**：
1. 启动一个审批流程
2. 在流程完成前调用撤销接口
3. 验证流程被成功撤销

**API调用示例**：
```bash
curl -X POST "http://localhost:9103/api/hr/workflow/process/{processInstanceId}/cancel" \
  -H "Authorization: Bearer {token}"
```

**预期结果**：
- 返回状态码：200
- 流程实例状态更新为"CANCELLED"
- 业务数据状态同步更新

#### 3.2 撤销已完成的流程（失败场景）

**测试目的**：验证无法撤销已完成的流程

**预期结果**：
- 返回错误提示："流程已完成，无法撤销"

### 场景4：测试审批结果回调

#### 4.1 入职审批通过回调

**测试目的**：验证Workflow服务审批通过后，HR服务能够正确处理回调

**测试步骤**：
1. 启动入职审批流程
2. 在Workflow服务中完成审批（通过）
3. Workflow服务回调HR服务
4. 验证HR服务更新业务数据

**回调接口**：
```
POST http://localhost:9103/api/hr/callback/approval
Content-Type: application/json

{
  "processInstanceId": "process-instance-12345",
  "businessType": "ONBOARDING",
  "businessId": 1,
  "result": "APPROVED",
  "approver": "张经理",
  "approveTime": "2026-03-21 10:30:00",
  "comment": "同意入职"
}
```

**预期结果**：
- 入职申请状态更新为"已通过"
- 生成入职任务清单
- 记录审批日志

#### 4.2 转正审批通过回调

**回调数据**：
```json
{
  "processInstanceId": "probation-process-002",
  "businessType": "PROBATION_CONFIRMATION",
  "businessId": 2,
  "result": "APPROVED",
  "approver": "李总监",
  "approveTime": "2026-03-21 11:00:00",
  "comment": "同意转正"
}
```

**预期结果**：
- 转正申请状态更新为"已通过"
- 员工状态更新为"正式员工"
- 记录转正日期

#### 4.3 调岗审批通过回调

**预期结果**：
- 调岗申请状态更新为"已通过"
- 员工的部门、岗位、职位信息更新
- 记录调岗历史

#### 4.4 离职审批通过回调

**预期结果**：
- 离职申请状态更新为"已通过"
- 生成离职交接清单
- 等待确认离职

#### 4.5 请假审批通过回调

**预期结果**：
- 请假申请状态更新为"已通过"
- 扣减假期额度
- 记录请假记录

#### 4.6 加班审批通过回调

**预期结果**：
- 加班申请状态更新为"已通过"
- 根据补偿类型转换为调休额度或加班费
- 记录加班记录

#### 4.7 调薪审批通过回调

**预期结果**：
- 调薪申请状态更新为"已通过"
- 等待调薪生效日期
- 记录调薪历史

#### 4.8 招聘需求审批通过回调

**预期结果**：
- 招聘需求状态更新为"招聘中"
- 支持发布到招聘渠道

#### 4.9 Offer审批通过回调

**预期结果**：
- Offer状态更新为"已通过"
- 支持发送Offer给候选人

#### 4.10 补卡审批通过回调

**预期结果**：
- 补卡申请状态更新为"已通过"
- 补充打卡记录
- 标记为补卡状态

#### 4.11 审批拒绝回调

**回调数据**：
```json
{
  "processInstanceId": "process-instance-12345",
  "businessType": "LEAVE",
  "businessId": 5,
  "result": "REJECTED",
  "approver": "王经理",
  "approveTime": "2026-03-21 14:00:00",
  "comment": "请假时间与重要会议冲突",
  "rejectReason": "请假时间与重要会议冲突"
}
```

**预期结果**：
- 请假申请状态更新为"已拒绝"
- 释放冻结的假期额度
- 记录拒绝原因

### 场景5：验证Fallback降级逻辑

#### 5.1 模拟Workflow服务不可用

**测试目的**：验证当Workflow服务不可用时，HR服务能够正确触发Fallback降级逻辑

**测试步骤**：
1. 停止Workflow服务
2. 尝试启动审批流程
3. 验证返回降级响应

**测试方法**：
```bash
# 1. 停止Workflow服务
# 在Workflow服务的终端按 Ctrl+C 停止服务

# 2. 尝试提交审批
curl -X POST "http://localhost:9103/api/hr/employee/onboarding/{id}/submit" \
  -H "Authorization: Bearer {token}"
```

**预期结果**：
- 返回错误消息："工作流服务暂时不可用，无法启动审批流程，请稍后重试"
- 日志中记录了Fallback降级信息
- 业务数据状态未变更

#### 5.2 验证各接口的降级响应

**测试接口列表**：
1. 启动流程 - `startProcess`
2. 查询流程实例 - `getProcessInstance`
3. 撤销流程 - `cancelProcess`

**验证方法**：
- 在Workflow服务停止的情况下，依次调用上述接口
- 验证每个接口都返回友好的错误提示
- 验证错误消息中包含"工作流服务暂时不可用"
- 验证启动和撤销接口的错误消息中包含"请稍后重试"

## 单元测试

### 运行单元测试

项目中已经创建了完整的单元测试类 `WorkflowServiceClientTest.java`，包含以下测试用例：

**流程启动测试**：
- `testStartProcess_Success` - 测试启动流程成功场景
- `testStartProcess_OnboardingApproval` - 测试启动入职审批流程
- `testStartProcess_ProbationConfirmation` - 测试启动转正审批流程
- `testStartProcess_Transfer` - 测试启动调岗审批流程
- `testStartProcess_Resignation` - 测试启动离职审批流程
- `testStartProcess_Leave` - 测试启动请假审批流程
- `testStartProcess_Overtime` - 测试启动加班审批流程
- `testStartProcess_SalaryAdjustment` - 测试启动调薪审批流程
- `testStartProcess_RecruitmentRequest` - 测试启动招聘需求审批流程
- `testStartProcess_Offer` - 测试启动Offer审批流程
- `testStartProcess_AttendanceSupplement` - 测试启动补卡审批流程
- `testStartProcess_Fallback` - 测试启动流程降级场景

**流程查询测试**：
- `testGetProcessInstance_Success` - 测试查询流程实例成功场景
- `testGetProcessInstance_Completed` - 测试查询已完成的流程
- `testGetProcessInstance_Rejected` - 测试查询被拒绝的流程
- `testGetProcessInstance_Fallback` - 测试查询流程降级场景

**流程撤销测试**：
- `testCancelProcess_Success` - 测试撤销流程成功场景
- `testCancelProcess_Fallback` - 测试撤销流程降级场景

**边界条件测试**：
- `testStartProcess_NullBusinessType` - 测试空业务类型
- `testGetProcessInstance_NotFound` - 测试查询不存在的流程
- `testCancelProcess_AlreadyCompleted` - 测试撤销已完成的流程

### 运行测试命令

```bash
# 进入HR服务目录
cd cloudflow-backend/cloudflow-service-hr

# 运行Workflow服务客户端测试
mvn test -Dtest=WorkflowServiceClientTest

# 运行所有测试
mvn test
```

## 测试验证清单

### 需求验证

根据需求文档，本次测试需要验证以下需求：

- [x] **需求20.1**：HR服务发起审批流程时，调用Workflow服务的流程启动接口并传递流程类型和业务数据
- [x] **需求20.2**：Workflow服务完成审批后，回调HR服务的审批结果接口并传递审批结果和审批意见
- [x] **需求20.3**：HR服务接收审批结果后，根据审批结果更新业务数据状态

### 功能验证清单

- [ ] 流程启动接口正常工作
  - [ ] 入职审批流程
  - [ ] 转正审批流程
  - [ ] 调岗审批流程
  - [ ] 离职审批流程
  - [ ] 请假审批流程
  - [ ] 加班审批流程
  - [ ] 调薪审批流程
  - [ ] 招聘需求审批流程
  - [ ] Offer审批流程
  - [ ] 补卡审批流程
  
- [ ] 流程查询接口正常工作
  - [ ] 查询运行中的流程
  - [ ] 查询已完成的流程
  - [ ] 查询被拒绝的流程
  
- [ ] 流程撤销接口正常工作
  - [ ] 撤销运行中的流程
  - [ ] 无法撤销已完成的流程
  
- [ ] 审批结果回调正常工作
  - [ ] 入职审批通过回调
  - [ ] 转正审批通过回调
  - [ ] 调岗审批通过回调
  - [ ] 离职审批通过回调
  - [ ] 请假审批通过回调
  - [ ] 加班审批通过回调
  - [ ] 调薪审批通过回调
  - [ ] 招聘需求审批通过回调
  - [ ] Offer审批通过回调
  - [ ] 补卡审批通过回调
  - [ ] 审批拒绝回调
  
- [ ] Fallback降级逻辑正常工作
  - [ ] 启动流程降级
  - [ ] 查询流程降级
  - [ ] 撤销流程降级
  - [ ] 降级响应包含友好的错误提示
  - [ ] 降级时记录错误日志

## 业务类型说明

HR服务支持以下10种业务类型的审批流程：

| 业务类型 | 业务代码 | 说明 |
|---------|---------|------|
| 入职审批 | ONBOARDING | 新员工入职申请审批 |
| 转正审批 | PROBATION_CONFIRMATION | 试用期员工转正审批 |
| 调岗审批 | TRANSFER | 员工部门或岗位调整审批 |
| 离职审批 | RESIGNATION | 员工离职申请审批 |
| 请假审批 | LEAVE | 员工请假申请审批 |
| 加班审批 | OVERTIME | 员工加班申请审批 |
| 调薪审批 | SALARY_ADJUSTMENT | 员工薪资调整审批 |
| 招聘需求审批 | RECRUITMENT_REQUEST | 部门招聘需求审批 |
| Offer审批 | OFFER | 候选人Offer发放审批 |
| 补卡审批 | ATTENDANCE_SUPPLEMENT | 员工补卡申请审批 |

## 常见问题

### 1. Feign调用超时

**问题描述**：调用Workflow服务接口时出现超时错误

**解决方案**：
- 检查Workflow服务是否正常运行
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

**问题描述**：HR服务无法发现Workflow服务

**解决方案**：
- 检查Nacos服务是否正常运行
- 验证两个服务都已注册到Nacos
- 检查服务名称配置是否正确

### 3. 降级逻辑未触发

**问题描述**：Workflow服务停止后，降级逻辑没有触发

**解决方案**：
- 检查Feign配置中是否正确配置了fallback
- 验证WorkflowServiceFallback类是否被Spring容器管理（@Component注解）
- 检查Hystrix或Sentinel是否正确配置

### 4. 回调接口未收到请求

**问题描述**：Workflow服务审批完成后，HR服务未收到回调

**解决方案**：
- 检查Workflow服务中是否正确配置了HR服务的回调地址
- 验证HR服务的回调接口是否正常运行
- 检查网络连接是否正常
- 查看Workflow服务的日志，确认是否发送了回调请求

### 5. 审批结果处理失败

**问题描述**：收到审批结果回调，但业务数据未更新

**解决方案**：
- 检查WorkflowCallbackServiceImpl中的业务类型分发逻辑
- 验证对应的ApprovalHandler是否正确实现
- 查看HR服务的日志，确认错误原因
- 检查数据库事务是否正常提交

## 测试数据准备

### 1. 准备测试员工

在测试前，需要在数据库中准备测试员工数据：

```sql
-- 插入测试员工
INSERT INTO hr_employee (tenant_id, employee_no, name, gender, phone, email, 
    dept_id, post_id, position_id, employee_type, employee_status, hire_date)
VALUES (1, 'EMP001', '张三', 'MALE', '13800138000', 'zhangsan@example.com',
    100, 200, 1, 'FULL_TIME', 'PROBATION', '2025-10-01');
```

### 2. 准备测试假期类型和额度

```sql
-- 插入假期类型
INSERT INTO hr_leave_type (tenant_id, leave_code, leave_name, need_quota, is_paid, unit, status)
VALUES (1, 'ANNUAL', '年假', 1, 1, 'DAY', 1);

-- 插入假期额度
INSERT INTO hr_leave_quota (tenant_id, employee_id, leave_type_id, year, 
    total_quota, used_quota, frozen_quota, available_quota)
VALUES (1, 1, 1, 2026, 10.0, 0.0, 0.0, 10.0);
```

### 3. 准备测试班次

```sql
-- 插入班次
INSERT INTO hr_shift (tenant_id, shift_code, shift_name, start_time, end_time, 
    break_minutes, late_threshold, early_threshold, work_minutes, status)
VALUES (1, 'NORMAL', '正常班', '09:00:00', '18:00:00', 60, 15, 15, 480, 1);
```

## 总结

本测试指南覆盖了HR服务与Workflow服务集成的所有关键场景，包括：
1. 10种业务类型的流程启动接口测试
2. 流程查询接口的正常调用和边界条件测试
3. 流程撤销接口的正常调用和失败场景测试
4. 审批结果回调的处理验证
5. Fallback降级逻辑的验证

通过完成上述测试，可以确保HR服务与Workflow服务的集成功能正常，满足需求文档中的所有验收标准。

## 附录：测试用例执行记录表

| 测试用例 | 执行日期 | 执行人 | 测试结果 | 备注 |
|---------|---------|--------|---------|------|
| 启动入职审批流程 | | | | |
| 启动转正审批流程 | | | | |
| 启动调岗审批流程 | | | | |
| 启动离职审批流程 | | | | |
| 启动请假审批流程 | | | | |
| 启动加班审批流程 | | | | |
| 启动调薪审批流程 | | | | |
| 启动招聘需求审批流程 | | | | |
| 启动Offer审批流程 | | | | |
| 启动补卡审批流程 | | | | |
| 查询流程实例 | | | | |
| 撤销流程 | | | | |
| 审批结果回调 | | | | |
| Fallback降级逻辑 | | | | |
