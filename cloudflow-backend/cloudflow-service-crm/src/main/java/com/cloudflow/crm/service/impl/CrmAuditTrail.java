package com.cloudflow.crm.service.impl;

import com.cloudflow.common.audit.domain.SysAuditLogEntity;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;

@Service
@RequiredArgsConstructor
public class CrmAuditTrail {
    private final SysAuditLogMapper auditMapper;

    @Transactional(rollbackFor = Exception.class)
    public void record(String action, String businessId, String detail, boolean highRisk) {
        insert(action, businessId, detail, highRisk);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW, rollbackFor = Exception.class)
    public void recordAttempt(String action, String businessId, String detail, boolean highRisk) {
        insert(action, businessId, detail, highRisk);
    }

    private void insert(String action, String businessId, String detail, boolean highRisk) {
        SysAuditLogEntity entry = new SysAuditLogEntity();
        entry.setTenantId(CrmRecordSupport.tenantId()); entry.setBizModule("crm");
        entry.setAuditName(action); entry.setAuditField(businessId); entry.setAfterVal(detail);
        entry.setHighRisk(highRisk ? 1 : 0); entry.setRiskLevel(highRisk ? "HIGH" : "LOW");
        entry.setCreateBy(CrmRecordSupport.userName()); entry.setCreateTime(LocalDateTime.now());
        auditMapper.insert(entry);
    }
}
