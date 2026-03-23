# 工作流回调处理使用指南

## 概述

工作流回调处理模块负责接收工作流服务的审批结果回调，并根据业务类型分发到对应的处理器进行处理。

## 架构设计

### 核心组件

1. **WorkflowCallbackController**: 接收工作流服务的HTTP回调请求
2. **WorkflowCallbackService**: 业务类型分发器，负责将审批结果分发到对应的处理器
3. **ApprovalResultHandler**: 审批结果处理器接口，定义了处理审批通过和拒绝的方法
4. **具体业务处理器**: 实现ApprovalResultHandler接口，处理特定业务类型的审批结果

### 支持的业务类型

| 业务类型 | 说明 | 处理器类 |
|---------|------|---------|
| ONBOARDING | 入职审批 | OnboardingApprovalHandler |
| PROBATION_CONFIRMATION | 转正审批 | ProbationConfirmationApprovalHandler |
| TRANSFER | 调岗审批 | TransferApprovalHandler |
| RESIGNATION | 离职审批 | ResignationApprovalHandler |
| LEAVE | 请假审批 | LeaveApprovalHandler |
| OVERTIME | 加班审批 | OvertimeApprovalHandler |
| SALARY_ADJUSTMENT | 调薪审批 | SalaryAdjustmentApprovalHandler |
| RECRUITMENT_REQUEST | 招聘需求审批 | RecruitmentRequestApprovalHandler |
| OFFER | Offer审批 | OfferApprovalHandler |
| ATTENDANCE_SUPPLEMENT | 补卡审批 | AttendanceSupplementApprovalHandler |

## 回调接口

### 接口地址

```
POST /api/hr/callback/approval
```

### 请求参数

```json
{
  "tenantId": 1,
  "processInstanceId": "process_12345",
  "businessType": "LEAVE",
  "businessId": 100,
  "businessNo": "LEAVE20260320001",
  "approvalResult": "APPROVED",
  "approvalComment": "同意请假",
  "approverId": 1,
  "approverName": "张三",
  "approvalTime": 1710912000000,
  "variables": {
    "extensionDays": 30
  }
}
```

### 参数说明

| 参数 | 类型 | 必填 | 说明 |
|-----|------|------|------|
| tenantId | Long | 是 | 租户ID |
| processInstanceId | String | 是 | 流程实例ID |
| businessType | String | 是 | 业务类型（见上表） |
| businessId | Long | 是 | 业务ID（如请假申请ID） |
| businessNo | String | 否 | 业务编号 |
| approvalResult | String | 是 | 审批结果：APPROVED-通过，REJECTED-拒绝 |
| approvalComment | String | 否 | 审批意见 |
| approverId | Long | 否 | 审批人ID |
| approverName | String | 否 | 审批人姓名 |
| approvalTime | Long | 否 | 审批时间（时间戳） |
| variables | Map | 否 | 流程变量（可选） |

### 响应结果

```json
{
  "code": 200,
  "msg": "操作成功",
  "data": null
}
```

## 处理流程

### 1. 接收回调

WorkflowCallbackController接收工作流服务的HTTP回调请求。

### 2. 参数验证

WorkflowCallbackService验证必要参数：
- 租户ID不能为空
- 流程实例ID不能为空
- 业务类型不能为空
- 业务ID不能为空
- 审批结果不能为空且只能是APPROVED或REJECTED

### 3. 业务类型分发

根据businessType从处理器映射表中获取对应的处理器。

### 4. 执行处理

根据approvalResult调用处理器的handleApproved或handleRejected方法。

### 5. 返回结果

处理成功返回200，处理失败返回错误信息。

## 扩展新的业务类型

如果需要支持新的业务类型，按以下步骤操作：

### 1. 创建处理器类

```java
@Slf4j
@Component
@RequiredArgsConstructor
public class NewBusinessApprovalHandler implements ApprovalResultHandler {

    private final NewBusinessService newBusinessService;

    @Override
    public String getSupportedBusinessType() {
        return "NEW_BUSINESS";
    }

    @Override
    public void handleApproved(ApprovalResultDTO dto) {
        log.info("处理新业务审批通过，businessId: {}", dto.getBusinessId());
        newBusinessService.approveNewBusiness(dto.getBusinessId());
    }

    @Override
    public void handleRejected(ApprovalResultDTO dto) {
        log.info("处理新业务审批拒绝，businessId: {}", dto.getBusinessId());
        newBusinessService.rejectNewBusiness(dto.getBusinessId());
    }
}
```

### 2. 实现业务服务方法

在对应的Service中实现审批通过和拒绝的处理逻辑。

### 3. 自动注册

处理器类添加@Component注解后，会自动被Spring扫描并注册到WorkflowCallbackService的处理器映射表中。

## 错误处理

### 业务异常

如果处理过程中发生业务异常（如数据不存在、状态不正确等），会抛出HrBusinessException，并返回错误信息给工作流服务。

### 系统异常

如果处理过程中发生系统异常（如数据库连接失败等），会抛出HrSystemException，并返回错误信息给工作流服务。

### 事务回滚

所有处理方法都使用@Transactional注解，如果处理失败会自动回滚事务。

## 日志记录

所有处理器都会记录详细的日志：
- 接收回调时记录业务类型、业务ID、审批结果
- 处理成功时记录处理完成信息
- 处理失败时记录错误信息和堆栈

## 测试

### 健康检查

```bash
curl http://localhost:9103/api/hr/callback/health
```

### 模拟回调

```bash
curl -X POST http://localhost:9103/api/hr/callback/approval \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": 1,
    "processInstanceId": "test_process_001",
    "businessType": "LEAVE",
    "businessId": 1,
    "businessNo": "LEAVE20260320001",
    "approvalResult": "APPROVED",
    "approvalComment": "同意请假",
    "approverId": 1,
    "approverName": "测试审批人",
    "approvalTime": 1710912000000
  }'
```

## 注意事项

1. 工作流服务必须在审批完成后调用此回调接口
2. 回调接口应该配置在工作流服务的回调地址中
3. 建议工作流服务实现重试机制，确保回调成功
4. 如果回调失败，工作流服务应该记录失败信息并支持人工重试
5. 所有处理器的处理方法都应该是幂等的，支持重复调用
