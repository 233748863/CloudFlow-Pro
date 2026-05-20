# cloudflow-common-workflow-callback

工作流审批回调公共模块。封装 Redis Stream 消费容器、幂等存储、死信处理与统一分发器，业务服务按下文模板接入即可。

---

## 一、依赖

业务服务 pom 引入：

```xml
<dependency>
    <groupId>com.cloudflow</groupId>
    <artifactId>cloudflow-common-workflow-callback</artifactId>
    <version>${revision}</version>
</dependency>
```

## 二、yaml 配置

```yaml
cloudflow:
  workflow:
    callback:
      enabled: true                                       # 可选，默认 true
      stream-key: workflow:stream:approval-callback:oa    # workflow 写入端约定的 Stream Key
      group: group:oa:workflow-callback                   # 当前服务的消费组名
      consumer-prefix: oa-callback                        # 消费者名前缀（自动拼随机后缀）
      idempotent-ttl-hours: 72                            # 幂等键 TTL，默认 72h
      max-retry: 5                                        # 失败重试上限，超过转 DLQ
```

## 三、默认模板（推荐）：实现 `ApprovalResultHandler`

最佳实践：业务侧仅实现 `ApprovalResultHandler` 接口并注册为 Spring Bean。框架自动按 `businessType` 路由到对应 Handler，由 `DefaultWorkflowCallbackDispatcher` 统一调度。

```java
package com.cloudflow.oa.workflow.handler;

import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.common.workflow.callback.handler.ApprovalResultHandler;
import org.springframework.stereotype.Component;

@Component
public class LeaveApprovalResultHandler implements ApprovalResultHandler {

    @Override
    public String getSupportedBusinessType() {
        // 必须与 workflow 流程变量 businessType 完全一致
        return "OA_LEAVE";
    }

    @Override
    public void handleApproved(ApprovalResultDTO dto) {
        // 更新业务单据为"已通过"，触发后续业务流转
    }

    @Override
    public void handleRejected(ApprovalResultDTO dto) {
        // 更新业务单据为"已驳回"，记录审批意见
    }
}
```

注意事项：

- `getSupportedBusinessType()` 返回值必须与 workflow 流程变量中的 `businessType` 字符串严格一致（大小写敏感、不可前后空格）。
- `handleApproved` / `handleRejected` 在 `@Transactional(rollbackFor = Exception.class)` 上下文中执行，抛异常会触发回滚并进入重试。
- 同一服务可注册多个 Handler；同一 `businessType` 仅允许一个，重复注册后启动失败。

## 四、高级用法（逃生口）：自定义 `WorkflowCallbackService`

当 Handler 的"按 businessType 路由"无法覆盖复杂场景时（如 HR 服务需要在 Dispatcher 层做多业务联动、补偿事务、分布式锁等），可直接实现 `WorkflowCallbackService` 接口并注册为 Bean，框架会自动跳过默认 Dispatcher：

```java
@Service
public class HrWorkflowCallbackDispatcher implements WorkflowCallbackService {
    @Override
    public void handleApprovalResult(ApprovalResultDTO dto) {
        // 自行实现路由 / 补偿 / 锁等逻辑
    }
}
```

判定规则（见 `WorkflowCallbackAutoConfiguration`）：

- 业务上下文存在 `WorkflowCallbackService` Bean → 跳过 `DefaultWorkflowCallbackDispatcher` 注册。
- 业务上下文存在至少一个 `ApprovalResultHandler` Bean 且无自定义 `WorkflowCallbackService` → 注册 `DefaultWorkflowCallbackDispatcher`。
- 两者都没有 → 容器启动会因缺少 `WorkflowCallbackService` 依赖而失败，提示需任选其一。

## 五、可观测与运维

| 能力     | 入口                                                               |
| -------- | ------------------------------------------------------------------ |
| 幂等去重 | Redis SETNX，key = `wf:cb:idem:{processInstanceId}`，TTL 见配置    |
| 重试上限 | `max-retry` 触顶后投递到 `wf:dlq:callback` Stream 与 DB 表         |
| DLQ 管理 | workflow 服务 `CallbackDlqAdminController` 提供 list/replay/ignore |
| 业务对账 | `ProcessBusinessReconcileJob` 5min 扫描 `wf_reconcile_alert`       |

## 六、常见问题

- **Q：换 businessType 命名后回调不生效？**
  A：workflow 流程变量中的 `businessType` 与 Handler `getSupportedBusinessType()` 必须严格一致；可观察日志中"注册审批结果处理器: X -> Y"行验证。

- **Q：能同时存在多个 ApprovalResultHandler 和自定义 Dispatcher 吗？**
  A：不能。一旦自定义 `WorkflowCallbackService` Bean 存在，`DefaultWorkflowCallbackDispatcher` 不会被注册，已注册的 `ApprovalResultHandler` 不会被任何分发器使用。
