package com.cloudflow.workflow.event;

import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.context.event.EventListener;
import org.springframework.util.StringUtils;

import java.util.HashMap;
import java.util.Map;

/**
 * OA 工作流事件监听器。
 *
 * <p>当前仅保留流程启动、撤回、作废的兜底同步。
 * 审批通过/驳回已迁移到 OA 自己消费 Redis Stream 回调，
 * 避免 workflow 服务继续直接跨库改写 OA 业务表。</p>
 */
@Component
public class OaWorkflowEventListener {

    private static final Logger log = LoggerFactory.getLogger(OaWorkflowEventListener.class);
    private static final String WORKFLOW_UPDATE_BY = "workflow";

    private final Map<String, OaBusinessBinding> bindings = new HashMap<>();

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private WfProcessInstanceMapper processInstanceMapper;

    public OaWorkflowEventListener() {
        register("business_trip", "biz_business_trip", "id", "instance_id", "BUSINESS_TRIP:", "APPROVED", "REJECTED", "CANCELLED");
        register("expense_claim", "biz_expense_claim", "id", "instance_id", "EXPENSE_CLAIM:", "APPROVED", "REJECTED", "CANCELLED");
        register("payment_request", "biz_payment_request", "id", "instance_id", "PAYMENT_REQUEST:", "APPROVED", "REJECTED", "CANCELLED");
        register("purchase_request", "biz_purchase_request", "id", "instance_id", "PURCHASE_REQUEST:", "APPROVED", "REJECTED", "CANCELLED");
        register("vehicle_approval", "oa_vehicle_usage", "usage_id", "process_instance_id", null, "1", "2", "5");
    }

    @EventListener
    @Async("workflowEventExecutor")
    public void onProcessStarted(ProcessStartedEvent event) {
        syncByBusinessKey(event.getProcessDefKey(), event.getBusinessKey(), event.getInstanceId(), null, "流程启动");
    }

    @EventListener
    @Async("workflowEventExecutor")
    public void onProcessRevoked(ProcessRevokedEvent event) {
        syncByInstance(event.getProcessDefKey(), event.getInstanceId(), SyncAction.CANCELLED, "流程撤回");
    }

    @EventListener
    @Async("workflowEventExecutor")
    public void onProcessInvalidated(ProcessInvalidatedEvent event) {
        syncByInstance(event.getProcessDefKey(), event.getInstanceId(), SyncAction.CANCELLED, "流程作废");
    }

    @EventListener
    @Async("workflowEventExecutor")
    public void onProcessTerminated(ProcessTerminatedEvent event) {
        syncByInstance(event.getProcessDefKey(), event.getInstanceId(), SyncAction.CANCELLED, "流程终止");
    }

    private void syncByInstance(String processDefKey, String instanceId, SyncAction action, String trigger) {
        OaBusinessBinding binding = bindings.get(processDefKey);
        if (binding == null) {
            return;
        }
        WfProcessInstance instance = processInstanceMapper.selectById(instanceId);
        if (instance == null) {
            log.warn("[OA回写] {} 时未找到流程实例: processDefKey={}, instanceId={}", trigger, processDefKey, instanceId);
            return;
        }
        sync(binding, instance.getBusinessKey(), instanceId, action, trigger);
    }

    private void syncByBusinessKey(String processDefKey, String businessKey, String instanceId, SyncAction action, String trigger) {
        OaBusinessBinding binding = bindings.get(processDefKey);
        if (binding == null) {
            return;
        }
        sync(binding, businessKey, instanceId, action, trigger);
    }

    // 根据 processKey 与 businessKey 解析目标业务单据，并回写实例 ID / 状态。
    private void sync(OaBusinessBinding binding, String businessKey, String instanceId, SyncAction action, String trigger) {
        Long businessId = binding.resolveBusinessId(businessKey);
        if (businessId == null) {
            log.warn("[OA回写] {} 时 businessKey 无法解析: processDefKey={}, businessKey={}", trigger, binding.processDefKey, businessKey);
            return;
        }

        int affectedRows;
        if (action == null) {
            affectedRows = jdbcTemplate.update(
                    "UPDATE " + binding.tableName +
                            " SET " + binding.instanceColumn + " = ?, update_by = ?, update_time = NOW() WHERE " + binding.idColumn + " = ?",
                    instanceId, WORKFLOW_UPDATE_BY, businessId
            );
        } else {
            affectedRows = jdbcTemplate.update(
                    "UPDATE " + binding.tableName +
                            " SET " + binding.instanceColumn + " = ?, status = ?, update_by = ?, update_time = NOW() WHERE " + binding.idColumn + " = ?",
                    instanceId, binding.resolveStatus(action), WORKFLOW_UPDATE_BY, businessId
            );
        }

        log.info("[OA回写] {}: processDefKey={}, businessKey={}, instanceId={}, table={}, businessId={}, status={}, affectedRows={}",
                trigger,
                binding.processDefKey,
                businessKey,
                instanceId,
                binding.tableName,
                businessId,
                action == null ? "UNCHANGED" : binding.resolveStatus(action),
                affectedRows);
    }

    private void register(String processDefKey,
                          String tableName,
                          String idColumn,
                          String instanceColumn,
                          String businessKeyPrefix,
                          String approvedStatus,
                          String rejectedStatus,
                          String cancelledStatus) {
        bindings.put(processDefKey, new OaBusinessBinding(
                processDefKey,
                tableName,
                idColumn,
                instanceColumn,
                businessKeyPrefix,
                approvedStatus,
                rejectedStatus,
                cancelledStatus
        ));
    }

    private enum SyncAction {
        APPROVED,
        REJECTED,
        CANCELLED
    }

    private static final class OaBusinessBinding {
        private final String processDefKey;
        private final String tableName;
        private final String idColumn;
        private final String instanceColumn;
        private final String businessKeyPrefix;
        private final String approvedStatus;
        private final String rejectedStatus;
        private final String cancelledStatus;

        private OaBusinessBinding(String processDefKey,
                                  String tableName,
                                  String idColumn,
                                  String instanceColumn,
                                  String businessKeyPrefix,
                                  String approvedStatus,
                                  String rejectedStatus,
                                  String cancelledStatus) {
            this.processDefKey = processDefKey;
            this.tableName = tableName;
            this.idColumn = idColumn;
            this.instanceColumn = instanceColumn;
            this.businessKeyPrefix = businessKeyPrefix;
            this.approvedStatus = approvedStatus;
            this.rejectedStatus = rejectedStatus;
            this.cancelledStatus = cancelledStatus;
        }

        private Long resolveBusinessId(String businessKey) {
            if (!StringUtils.hasText(businessKey)) {
                return null;
            }
            String rawId = businessKey;
            if (StringUtils.hasText(businessKeyPrefix)) {
                if (!businessKey.startsWith(businessKeyPrefix)) {
                    return null;
                }
                rawId = businessKey.substring(businessKeyPrefix.length());
            }
            try {
                return Long.parseLong(rawId);
            } catch (NumberFormatException ex) {
                return null;
            }
        }

        private String resolveStatus(SyncAction action) {
            return switch (action) {
                case APPROVED -> approvedStatus;
                case REJECTED -> rejectedStatus;
                case CANCELLED -> cancelledStatus;
            };
        }
    }
}
