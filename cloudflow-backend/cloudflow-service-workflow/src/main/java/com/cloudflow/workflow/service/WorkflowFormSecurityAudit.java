package com.cloudflow.workflow.service;

import com.cloudflow.common.audit.domain.SysAuditLogEntity;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.exception.WorkflowException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class WorkflowFormSecurityAudit {
    private final SysAuditLogMapper audits;
    private final WorkflowDraftJson json;

    @Transactional(propagation = Propagation.REQUIRES_NEW, rollbackFor = Exception.class)
    public void rejected(WfTask task, Set<String> fields) {
        SysAuditLogEntity audit = new SysAuditLogEntity();
        audit.setTenantId(WorkflowLaunchContextService.requireTenant());
        audit.setBizModule("workflow");
        audit.setAuditName("拒绝流程表单字段篡改");
        audit.setAuditField("formData");
        audit.setBeforeVal("[REDACTED]");
        audit.setAfterVal("DENIED");
        audit.setAfterJson(json.canonical(Map.of("instanceId", task.getInstanceId(), "taskId", task.getTaskId(),
                "nodeKey", task.getNodeKey(), "fields", fields.stream().sorted().toList())));
        audit.setHighRisk(1);
        audit.setRiskLevel("HIGH");
        audit.setCreateBy(String.valueOf(UserContext.getUserId()));
        audit.setCreateTime(LocalDateTime.now());
        if (audits.insert(audit) != 1) throw WorkflowException.invalidState("安全审计保存失败，本次操作已拒绝");
    }
}
