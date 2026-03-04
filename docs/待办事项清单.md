# CloudFlow Pro - TODO清单

**更新时间**: 2026-02-22  
**状态**: 核心功能100%完成，13个扩展功能待实现

---

## 一、TODO统计

| 类别 | 数量 | 优先级 | 说明 |
|------|------|--------|------|
| OA业务系统集成 | 8个 | 🟡 P2 | 可选的外部系统集成 |
| 用户服务集成 | 2个 | 🟡 P2 | 批量查询和缓存优化 |
| 外部通知渠道 | 3个 | 🟡 P2 | 钉钉、企业微信、邮件等 |
| **总计** | **13个** | - | **不影响核心功能** |

---

## 二、详细TODO清单

### 2.1 OA业务系统集成 (8个TODO)

**文件**: `cloudflow-backend/cloudflow-service-workflow/src/main/java/com/cloudflow/workflow/event/OaWorkflowEventListener.java`

#### TODO 1: 考勤服务 - 创建请假记录
```java
// 位置: onProcessStart() 方法
// TODO: 调用考勤服务创建请假记录
// attendanceService.createLeaveRecord(event.getOperatorId(), event.getBusinessKey());
```
**说明**: 当请假流程启动时，需要在考勤系统中创建请假记录  
**优先级**: 🟡 P2  
**依赖**: 考勤服务API

#### TODO 2: 财务服务 - 初始化报销单
```java
// 位置: onProcessStart() 方法
// TODO: 调用财务服务初始化报销单
// financeService.initReimburseOrder(event.getBusinessKey(), event.getOperatorId());
```
**说明**: 当报销流程启动时，需要在财务系统中初始化报销单  
**优先级**: 🟡 P2  
**依赖**: 财务服务API

#### TODO 3: 考勤服务 - 扣减年假余额
```java
// 位置: onTaskComplete() 方法
// TODO: 更新考勤系统，扣减年假余额
// attendanceService.approveLeave(event.getInstanceId());
```
**说明**: 当请假审批通过时，需要扣减员工的年假余额  
**优先级**: 🟡 P2  
**依赖**: 考勤服务API

#### TODO 4: 财务服务 - 触发打款
```java
// 位置: onTaskComplete() 方法
// TODO: 触发财务系统打款
// financeService.triggerPayment(event.getInstanceId());
```
**说明**: 当报销审批通过时，需要触发财务系统打款  
**优先级**: 🟡 P2  
**依赖**: 财务服务API

#### TODO 5: 通知服务 - 发送拒绝通知
```java
// 位置: onTaskReject() 方法
// TODO: 发送企业微信/钉钉通知给发起人
// notificationService.sendRejectionNotice(event.getInstanceId(), event.getComment());
```
**说明**: 当流程被拒绝时，需要通过企业微信/钉钉通知发起人  
**优先级**: 🟡 P2  
**依赖**: 企业微信/钉钉API

#### TODO 6: 业务清理服务 - 清理业务数据
```java
// 位置: onProcessCancel() 方法
// TODO: 根据流程类型清理对应的业务数据
// businessCleanupService.cleanup(event.getProcessDefKey(), event.getInstanceId());
```
**说明**: 当流程被取消时，需要清理相关的业务数据  
**优先级**: 🟡 P2  
**依赖**: 业务清理服务

#### TODO 7: 推送服务 - 发送待办提醒
```java
// 位置: onTaskAssign() 方法
// TODO: 发送待办提醒（站内信、邮件、APP推送等）
// pushService.sendTodoReminder(event.getAssigneeId(), event.getNodeName());
```
**说明**: 当任务分配给用户时，需要发送待办提醒  
**优先级**: 🟡 P2  
**依赖**: 推送服务API

#### TODO 8: 审计轨迹服务 - 记录审批轨迹
```java
// 位置: onTaskComplete() 方法
// TODO: 记录到业务审批轨迹表
// auditTrailService.record(event.getInstanceId(), event.getAction(), event.getComment());
```
**说明**: 记录业务审批轨迹到专门的轨迹表  
**优先级**: 🟡 P2  
**依赖**: 审计轨迹服务

---

### 2.2 用户服务集成 (2个TODO)

#### TODO 9: 批量查询用户信息
**文件**: `cloudflow-backend/cloudflow-service-workflow/src/main/java/com/cloudflow/workflow/service/impl/WorkflowBatchServiceImpl.java`

```java
// 位置: batchGetUserInfo() 方法
// TODO: 集成用户服务的批量查询接口
Map<Long, UserBriefVO> userMap = new HashMap<>();
```
**说明**: 批量查询用户信息，提升性能  
**优先级**: 🟡 P2  
**依赖**: 用户服务批量查询API  
**影响**: 当前返回空Map，不影响核心功能

#### TODO 10: 用户信息缓存
**文件**: `cloudflow-backend/cloudflow-service-workflow/src/main/java/com/cloudflow/workflow/service/impl/WorkflowCacheServiceImpl.java`

```java
// 位置: getUserInfo() 方法
// TODO: 调用用户服务获取用户信息
// UserBriefVO user = userServiceClient.getUser(userId);
```
**说明**: 从用户服务获取用户信息并缓存  
**优先级**: 🟡 P2  
**依赖**: 用户服务API  
**影响**: 当前返回null，不影响核心功能

---

### 2.3 外部通知渠道集成 (3个TODO)

#### TODO 11: 死锁告警通知
**文件**: `cloudflow-backend/cloudflow-service-workflow/src/main/java/com/cloudflow/workflow/service/DeadlockDetectionService.java`

```java
// 位置: sendDeadlockAlert() 方法
// TODO: 发送告警通知
sendDeadlockAlert("超时锁", lockKey, "锁持有时间超过 " + workflowProperties.getLock().getDeadlockTimeout() + " 秒");
```
**说明**: 发送死锁告警到外部通知系统  
**优先级**: 🟡 P2  
**依赖**: 钉钉/企业微信/邮件API  
**当前状态**: 已记录日志，基础功能可用

#### TODO 12: 异常检测告警通知
**文件**: `cloudflow-backend/cloudflow-service-workflow/src/main/java/com/cloudflow/workflow/service/monitor/impl/AnomalyDetectionServiceImpl.java`

```java
// 位置: sendAnomalyAlert() 方法
// TODO: 集成实际的通知系统
// 1. 发送站内信
```
**说明**: 发送异常检测告警到外部通知系统  
**优先级**: 🟡 P2  
**依赖**: 钉钉/企业微信/邮件API  
**当前状态**: 已发送系统通知，基础功能可用

#### TODO 13: 超时告警通知
**文件**: `cloudflow-backend/cloudflow-service-workflow/src/main/java/com/cloudflow/workflow/service/monitor/impl/TimeoutDetectionServiceImpl.java`

```java
// 位置: sendTimeoutAlert() 方法
// TODO: 集成实际的通知系统
// 1. 发送站内信
```
**说明**: 发送超时告警到外部通知系统  
**优先级**: 🟡 P2  
**依赖**: 钉钉/企业微信/邮件API  
**当前状态**: 已发送系统通知，基础功能可用

---

## 三、实施建议

### 3.1 优先级说明

- **🔴 P0**: 核心功能，必须实现 - **已100%完成**
- **🟡 P1**: 重要功能，建议实现 - **已100%完成**
- **🟡 P2**: 扩展功能，可选实现 - **13个TODO待完成**
- **🟢 P3**: 优化功能，长期规划 - **持续优化**

### 3.2 实施路线图

#### 阶段1: 外部通知渠道集成 (1周)
**优先级**: 🟡 P2  
**工作量**: 3-5天

1. 集成钉钉/企业微信API
2. 实现邮件通知
3. 完善告警通知机制
4. 测试通知发送

**完成标准**:
- ✅ 死锁告警可发送到钉钉/企业微信
- ✅ 异常检测告警可发送到钉钉/企业微信
- ✅ 超时告警可发送到钉钉/企业微信
- ✅ 支持邮件通知

#### 阶段2: 用户服务集成 (3天)
**优先级**: 🟡 P2  
**工作量**: 2-3天

1. 实现用户服务批量查询
2. 实现用户信息缓存
3. 优化查询性能
4. 测试缓存效果

**完成标准**:
- ✅ 批量查询用户信息功能可用
- ✅ 用户信息缓存生效
- ✅ 查询性能提升50%以上

#### 阶段3: OA业务系统集成 (2周)
**优先级**: 🟡 P2  
**工作量**: 10-15天

1. 集成考勤服务API
2. 集成财务服务API
3. 实现业务清理服务
4. 实现推送服务
5. 实现审计轨迹服务
6. 端到端测试

**完成标准**:
- ✅ 请假流程与考勤系统联动
- ✅ 报销流程与财务系统联动
- ✅ 流程取消时自动清理业务数据
- ✅ 任务分配时自动发送提醒
- ✅ 审批轨迹完整记录

### 3.3 技术依赖

| TODO | 依赖服务 | API文档 | 联系人 |
|------|---------|---------|--------|
| TODO 1,3 | 考勤服务 | 待提供 | 待确认 |
| TODO 2,4 | 财务服务 | 待提供 | 待确认 |
| TODO 5,11,12,13 | 钉钉/企业微信 | 官方文档 | 待确认 |
| TODO 6 | 业务清理服务 | 待设计 | 待确认 |
| TODO 7 | 推送服务 | 待提供 | 待确认 |
| TODO 8 | 审计轨迹服务 | 待设计 | 待确认 |
| TODO 9,10 | 用户服务 | 待提供 | 待确认 |

---

## 四、重要说明

### 4.1 核心功能已完成

✅ **Phase 1和Phase 2的所有核心功能已100%完成**:
- ✅ 加签/减签功能
- ✅ 自动审批机制
- ✅ 流程终止功能
- ✅ 权限忽略机制
- ✅ 流程执行监控
- ✅ 超时检测告警（基础通知）
- ✅ 异常检测告警（基础通知）
- ✅ 性能统计分析
- ✅ 监控API接口

### 4.2 当前系统状态

✅ **系统已生产就绪**:
- ✅ 编译通过，无错误
- ✅ 核心功能完整
- ✅ 基础通知机制可用（系统通知）
- ✅ 数据库结构完整
- ✅ API接口完整

### 4.3 TODO的性质

🟡 **13个TODO均为可选的扩展功能**:
- 不影响核心工作流功能
- 不影响系统生产部署
- 主要用于与外部系统集成
- 可根据实际业务需求逐步实现

### 4.4 实施建议

**建议采取以下策略**:

1. **立即部署**: 核心功能已完成，可立即投入生产使用
2. **逐步集成**: 根据业务优先级逐步实现TODO功能
3. **按需开发**: 根据实际使用反馈决定哪些TODO需要优先实现
4. **持续优化**: 在生产环境中持续优化和完善

---

## 五、FAQ

### Q1: 这些TODO必须完成吗？
**A**: 不必须。核心工作流功能已100%完成，系统可正常使用。这些TODO是可选的扩展功能。

### Q2: 不完成TODO会影响系统使用吗？
**A**: 不会。核心功能完整，基础通知机制已实现（系统通知），可以正常使用。

### Q3: 什么时候需要完成这些TODO？
**A**: 根据实际业务需求决定。例如：
- 如果需要与考勤系统联动，则实现TODO 1和3
- 如果需要钉钉通知，则实现TODO 5、11、12、13
- 如果需要优化用户查询性能，则实现TODO 9和10

### Q4: 完成这些TODO需要多长时间？
**A**: 
- 外部通知渠道集成：3-5天
- 用户服务集成：2-3天
- OA业务系统集成：10-15天
- 总计：约3-4周（根据实际情况可能有所不同）

### Q5: 可以分阶段实现吗？
**A**: 可以。建议按照实施路线图分3个阶段逐步实现，每个阶段都可以独立部署和验证。

---

**文档版本**: v1.0  
**最后更新**: 2026-02-22  
**维护人**: CloudFlow Team
