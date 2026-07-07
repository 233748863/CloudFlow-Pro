package com.cloudflow.workflow.event;

import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.util.StringUtils;

import java.util.HashMap;
import java.util.Map;

/**
 * CRM 工作流撤销/作废回写。
 *
 * <p>当前 CRM 审批通过/驳回已经走各自 callback handler；这里补的是
 * 流程撤回 / 作废 / 终止时的业务单据回滚，避免业务单据长期停在 PENDING。</p>
 */
@Component
public class CrmWorkflowEventListener {

    private static final Logger log = LoggerFactory.getLogger(CrmWorkflowEventListener.class);
    private static final String WORKFLOW_UPDATE_BY = "workflow";

    private final Map<String, CrmBusinessBinding> bindings = new HashMap<>();

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private WfProcessInstanceMapper processInstanceMapper;

    public CrmWorkflowEventListener() {
        register("quote_approval", "crm_quote", "quote_id", "instance_id",
                "CRM_QUOTE:", "DRAFT");
        register("customer_renewal_review", "crm_renewal", "renewal_id", "instance_id",
                "CRM_RENEWAL:", "PLANNED");
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    @Async("workflowEventExecutor")
    public void onProcessRevoked(ProcessRevokedEvent event) {
        syncByInstance(event.getProcessDefKey(), event.getInstanceId(), "流程撤回");
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    @Async("workflowEventExecutor")
    public void onProcessInvalidated(ProcessInvalidatedEvent event) {
        syncByInstance(event.getProcessDefKey(), event.getInstanceId(), "流程作废");
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    @Async("workflowEventExecutor")
    public void onProcessTerminated(ProcessTerminatedEvent event) {
        syncByInstance(event.getProcessDefKey(), event.getInstanceId(), "流程终止");
    }

    private void syncByInstance(String processDefKey, String instanceId, String trigger) {
        CrmBusinessBinding binding = bindings.get(processDefKey);
        if (binding == null) {
            return;
        }
        WfProcessInstance instance = processInstanceMapper.selectById(instanceId);
        if (instance == null) {
            log.warn("[CRM回写] {} 时未找到流程实例: processDefKey={}, instanceId={}",
                    trigger, processDefKey, instanceId);
            return;
        }
        Long businessId = binding.resolveBusinessId(instance.getBusinessKey());
        if (businessId == null) {
            log.warn("[CRM回写] {} 时 businessKey 无法解析: processDefKey={}, businessKey={}",
                    trigger, processDefKey, instance.getBusinessKey());
            return;
        }
        int affectedRows = jdbcTemplate.update(
                binding.updateRollbackSql,
                instanceId, binding.cancelledStatus, WORKFLOW_UPDATE_BY, businessId
        );
        log.info("[CRM回写] {}: processDefKey={}, businessKey={}, instanceId={}, table={}, businessId={}, status={}, affectedRows={}",
                trigger,
                processDefKey,
                instance.getBusinessKey(),
                instanceId,
                binding.tableName,
                businessId,
                binding.cancelledStatus,
                affectedRows);
    }

    private void register(String processDefKey,
                          String tableName,
                          String idColumn,
                          String instanceColumn,
                          String businessKeyPrefix,
                          String cancelledStatus) {
        bindings.put(processDefKey, new CrmBusinessBinding(
                processDefKey, tableName, idColumn, instanceColumn, businessKeyPrefix, cancelledStatus));
    }

    private static final class CrmBusinessBinding {
        private final String tableName;
        private final String businessKeyPrefix;
        private final String cancelledStatus;
        private final String updateRollbackSql;

        private CrmBusinessBinding(String processDefKey,
                                   String tableName,
                                   String idColumn,
                                   String instanceColumn,
                                   String businessKeyPrefix,
                                   String cancelledStatus) {
            validateIdentifier(processDefKey);
            validateIdentifier(tableName);
            validateIdentifier(idColumn);
            validateIdentifier(instanceColumn);
            this.tableName = tableName;
            this.businessKeyPrefix = businessKeyPrefix;
            this.cancelledStatus = cancelledStatus;
            this.updateRollbackSql = String.format(
                    "UPDATE %s SET %s = ?, status = ?, update_by = ?, update_time = NOW() WHERE %s = ?",
                    tableName, instanceColumn, idColumn
            );
        }

        private Long resolveBusinessId(String businessKey) {
            if (!StringUtils.hasText(businessKey) || !businessKey.startsWith(businessKeyPrefix)) {
                return null;
            }
            try {
                return Long.parseLong(businessKey.substring(businessKeyPrefix.length()));
            } catch (NumberFormatException ex) {
                return null;
            }
        }

        private static void validateIdentifier(String identifier) {
            if (!identifier.matches("[A-Za-z0-9_]+")) {
                throw new IllegalArgumentException("非法 SQL 标识符: " + identifier);
            }
        }
    }
}
