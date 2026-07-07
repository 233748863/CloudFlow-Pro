package com.cloudflow.auth.job;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.auth.domain.SysDictOrphanAlert;
import com.cloudflow.auth.domain.SysDictType;
import com.cloudflow.auth.domain.SysTenant;
import com.cloudflow.auth.mapper.SysDictOrphanAlertMapper;
import com.cloudflow.auth.mapper.SysDictTypeMapper;
import com.cloudflow.auth.mapper.SysTenantMapper;
import com.cloudflow.auth.service.impl.DictReferenceRegistry;
import com.cloudflow.common.job.annotation.DistributedJob;
import com.cloudflow.common.tenant.TenantBroker;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@Slf4j
@Component
@RequiredArgsConstructor
public class SysDictOrphanAlertScanJob {

    private static final String SCAN_OPERATOR = "dict-orphan-scan";

    private final DictReferenceRegistry dictReferenceRegistry;
    private final SysDictOrphanAlertMapper orphanAlertMapper;
    private final SysDictTypeMapper dictTypeMapper;
    private final SysTenantMapper sysTenantMapper;

    @Scheduled(cron = "${cloudflow.auth.dict-orphan-scan-cron:0 0 2 * * ?}")
    @DistributedJob(name = "auth-dict-orphan-alert-scan-job", lockTime = 1800, waitTime = 5)
    public void scan() {
        List<DictReferenceRegistry.ImplicitDictReferenceAlert> implicitAlerts = dictReferenceRegistry.implicitOnlyBindings();
        List<Long> tenantIds = loadActiveTenantIds();
        if (tenantIds.isEmpty()) {
            log.info("dict orphan alert scan skipped, no active tenants");
            return;
        }
        for (Long tenantId : tenantIds) {
            TenantBroker.runAs(tenantId, ignored -> refreshTenantAlerts(tenantId, implicitAlerts));
        }
    }

    private List<Long> loadActiveTenantIds() {
        return TenantBroker.applyWithoutTenant(ignored -> sysTenantMapper.selectList(new LambdaQueryWrapper<SysTenant>()
                        .select(SysTenant::getTenantId)
                        .eq(SysTenant::getStatus, "0"))
                .stream()
                .map(SysTenant::getTenantId)
                .toList());
    }

    private void refreshTenantAlerts(Long tenantId, List<DictReferenceRegistry.ImplicitDictReferenceAlert> implicitAlerts) {
        orphanAlertMapper.delete(new LambdaQueryWrapper<SysDictOrphanAlert>()
                .eq(SysDictOrphanAlert::getTenantId, tenantId));
        if (implicitAlerts.isEmpty()) {
            log.info("dict orphan alert scan completed, tenantId={}, alertCount=0", tenantId);
            return;
        }
        Set<String> existingDictTypes = dictTypeMapper.selectList(new LambdaQueryWrapper<SysDictType>()
                        .select(SysDictType::getDictType))
                .stream()
                .map(SysDictType::getDictType)
                .collect(Collectors.toSet());
        LocalDateTime now = LocalDateTime.now();
        List<SysDictOrphanAlert> alerts = new ArrayList<>();
        for (DictReferenceRegistry.ImplicitDictReferenceAlert implicitAlert : implicitAlerts) {
            if (!existingDictTypes.contains(implicitAlert.dictType())) {
                continue;
            }
            SysDictOrphanAlert alert = new SysDictOrphanAlert();
            alert.setTenantId(tenantId);
            alert.setDictType(implicitAlert.dictType());
            alert.setReason(implicitAlert.reason());
            alert.setBindingSummary(implicitAlert.bindingSummary());
            alert.setBindingCount(implicitAlert.bindingCount());
            alert.setCreateBy(SCAN_OPERATOR);
            alert.setCreateTime(now);
            alert.setUpdateBy(SCAN_OPERATOR);
            alert.setUpdateTime(now);
            alerts.add(alert);
        }
        for (SysDictOrphanAlert alert : alerts) {
            orphanAlertMapper.insert(alert);
        }
        log.info("dict orphan alert scan completed, tenantId={}, alertCount={}", tenantId, alerts.size());
    }
}
