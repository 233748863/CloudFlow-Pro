package com.cloudflow.workflow.service;

import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.workflow.domain.monitor.AnomalyAlert;
import com.cloudflow.workflow.mapper.AnomalyAlertMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Objects;

@Slf4j
@Service
@RequiredArgsConstructor
public class WorkflowGatewayFailureService {
    private final AnomalyAlertMapper alerts;

    @Transactional(propagation = Propagation.REQUIRES_NEW, rollbackFor = Exception.class)
    public void report(Long tenantId, String instanceId, String definitionKey, String nodeKey, String nodeName) {
        if (tenantId == null || !Objects.equals(tenantId, TenantContext.getTenantId())) throw WorkflowExecutionContext.invalid();
        AnomalyAlert alert = new AnomalyAlert();
        alert.setTenantId(tenantId);
        alert.setInstanceId(instanceId);
        alert.setProcessDefKey(definitionKey);
        alert.setNodeKey(nodeKey);
        alert.setNodeName(nodeName);
        alert.setAnomalyType("EXECUTION_FAILED");
        alert.setSeverity("HIGH");
        alert.setErrorMessage("GATEWAY_NO_MATCH: 网关没有命中出口且未配置默认出口，本次操作已回滚");
        alert.setResolved("N");
        alert.setNotificationSent("N");
        alert.setAlertTime(LocalDateTime.now());
        alert.setCreateTime(alert.getAlertTime());
        alert.setUpdateTime(alert.getAlertTime());
        if (alerts.insert(alert) != 1) throw WorkflowExecutionContext.invalid();
        log.warn("GATEWAY_NO_MATCH: tenantId={}, instanceId={}, nodeKey={}", tenantId, instanceId, nodeKey);
    }
}
