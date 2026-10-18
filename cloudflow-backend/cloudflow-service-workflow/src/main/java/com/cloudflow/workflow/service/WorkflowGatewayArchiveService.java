package com.cloudflow.workflow.service;

import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.cloudflow.workflow.mapper.WfTaskMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class WorkflowGatewayArchiveService {
    private final WfProcessInstanceMapper instances;
    private final WfTaskMapper tasks;
    private final WorkflowGatewayService gateways;

    public List<String> candidates(String afterId) {
        return instances.selectArchivedGatewayInstances(tenant(), afterId, 100);
    }

    @Audit(name = "清理已归档终态实例的网关记录", highRisk = true)
    @Transactional(rollbackFor = Exception.class)
    public int clean(String instanceId) {
        Long tenantId = tenant();
        WfProcessInstance instance = instances.selectArchivedForCleanup(tenantId, instanceId);
        if (instance == null) return 0;
        if (!tasks.selectInstanceForUpdate(tenantId, instanceId).isEmpty() || !WorkflowWaitState.list(instance, null).isEmpty()) {
            throw WorkflowException.invalidState("已归档实例仍有未完成任务或等待，停止清理网关记录");
        }
        gateways.deleteArchived(tenantId, instanceId);
        return 1;
    }

    private static Long tenant() {
        Long tenantId = TenantContext.getTenantId();
        if (tenantId == null) throw WorkflowException.permissionDenied("归档清理缺少租户上下文");
        return tenantId;
    }
}
