package com.cloudflow.workflow.event;

import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.HashMap;
import java.util.Map;

/**
 * HR 工作流撤销/作废回写。
 *
 * <p>审批通过/驳回继续由 HR callback service 处理；这里专门回补
 * 撤销/作废/终止路径，避免业务单据卡在 APPROVING/PENDING。</p>
 */
@Component
public class HrWorkflowEventListener {

    private static final Logger log = LoggerFactory.getLogger(HrWorkflowEventListener.class);
    private static final String WORKFLOW_UPDATE_BY = "workflow";

    private final Map<String, HrBusinessBinding> bindings = new HashMap<>();

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private WfProcessInstanceMapper processInstanceMapper;

    public HrWorkflowEventListener() {
        register("wf_hr_benefit_request", "hr_benefit_request", "id", "process_instance_id",
                "HR_BENEFIT_REQUEST:", "status", "CANCELLED", null);
        register("wf_hr_certificate_request", "hr_certificate_request", "id", "process_instance_id",
                "HR_CERTIFICATE_REQUEST:", "status", "CANCELLED", null);
        register("wf_hr_contract_sign", "hr_contract_signature", "id", "process_instance_id",
                "HR_CONTRACT_SIGN:", "sign_status", "CANCELLED",
                """
                        UPDATE hr_employee_contract c
                        JOIN hr_contract_signature s ON c.id = s.contract_id
                        SET c.sign_status = 'UNSIGNED', c.update_by = ?, c.update_time = NOW()
                        WHERE s.id = ?
                        """);
        register("wf_hr_training_enrollment", "hr_training_enrollment", "id", "process_instance_id",
                "HR_TRAINING_ENROLLMENT:", "status", "WITHDRAWN", null);
    }

    @EventListener
    @Async("workflowEventExecutor")
    public void onProcessRevoked(ProcessRevokedEvent event) {
        syncByInstance(event.getProcessDefKey(), event.getInstanceId(), "流程撤回");
    }

    @EventListener
    @Async("workflowEventExecutor")
    public void onProcessInvalidated(ProcessInvalidatedEvent event) {
        syncByInstance(event.getProcessDefKey(), event.getInstanceId(), "流程作废");
    }

    @EventListener
    @Async("workflowEventExecutor")
    public void onProcessTerminated(ProcessTerminatedEvent event) {
        syncByInstance(event.getProcessDefKey(), event.getInstanceId(), "流程终止");
    }

    private void syncByInstance(String processDefKey, String instanceId, String trigger) {
        HrBusinessBinding binding = bindings.get(processDefKey);
        if (binding == null) {
            return;
        }
        WfProcessInstance instance = processInstanceMapper.selectById(instanceId);
        if (instance == null) {
            log.warn("[HR回写] {} 时未找到流程实例: processDefKey={}, instanceId={}",
                    trigger, processDefKey, instanceId);
            return;
        }
        Long businessId = binding.resolveBusinessId(instance.getBusinessKey());
        if (businessId == null) {
            log.warn("[HR回写] {} 时 businessKey 无法解析: processDefKey={}, businessKey={}",
                    trigger, processDefKey, instance.getBusinessKey());
            return;
        }
        int affectedRows = jdbcTemplate.update(
                binding.updateRollbackSql,
                instanceId, binding.cancelledStatus, WORKFLOW_UPDATE_BY, businessId
        );
        if (binding.postRollbackSql != null) {
            jdbcTemplate.update(binding.postRollbackSql, WORKFLOW_UPDATE_BY, businessId);
        }
        log.info("[HR回写] {}: processDefKey={}, businessKey={}, instanceId={}, table={}, businessId={}, status={}, affectedRows={}",
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
                          String statusColumn,
                          String cancelledStatus,
                          String postRollbackSql) {
        bindings.put(processDefKey, new HrBusinessBinding(
                processDefKey, tableName, idColumn, instanceColumn, businessKeyPrefix, statusColumn, cancelledStatus, postRollbackSql));
    }

    private static final class HrBusinessBinding {
        private final String tableName;
        private final String businessKeyPrefix;
        private final String cancelledStatus;
        private final String postRollbackSql;
        private final String updateRollbackSql;

        private HrBusinessBinding(String processDefKey,
                                  String tableName,
                                  String idColumn,
                                  String instanceColumn,
                                  String businessKeyPrefix,
                                  String statusColumn,
                                  String cancelledStatus,
                                  String postRollbackSql) {
            validateIdentifier(processDefKey);
            validateIdentifier(tableName);
            validateIdentifier(idColumn);
            validateIdentifier(instanceColumn);
            validateIdentifier(statusColumn);
            this.tableName = tableName;
            this.businessKeyPrefix = businessKeyPrefix;
            this.cancelledStatus = cancelledStatus;
            this.postRollbackSql = postRollbackSql;
            this.updateRollbackSql = String.format(
                    "UPDATE %s SET %s = ?, %s = ?, update_by = ?, update_time = NOW() WHERE %s = ?",
                    tableName, instanceColumn, statusColumn, idColumn
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
