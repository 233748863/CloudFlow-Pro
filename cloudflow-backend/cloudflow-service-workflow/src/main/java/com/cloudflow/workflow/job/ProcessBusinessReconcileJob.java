package com.cloudflow.workflow.job;

import com.cloudflow.common.job.annotation.DistributedJob;
import com.cloudflow.common.tenant.TenantBroker;
import com.cloudflow.common.workflow.callback.registry.BusinessTypeRegistry;
import com.cloudflow.workflow.domain.WfReconcileAlert;
import com.cloudflow.workflow.mapper.WfReconcileAlertMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.List;

@Slf4j
@Component
@RequiredArgsConstructor
public class ProcessBusinessReconcileJob {

    private final WfReconcileAlertMapper reconcileAlertMapper;
    private final BusinessTypeRegistry businessTypeRegistry;

    @Scheduled(cron = "0 */5 * * * *")
    @DistributedJob(name = "processBusinessReconcile", lockTime = 240)
    public void reconcile() {
        // 平台级跨租户对账：扫描所有租户的流程-业务表一致性，
        // 必须跳过 MP 租户过滤，否则只能扫到 null 租户的记录。
        TenantBroker.runWithoutTenant(() -> {
            try {
                if (businessTypeRegistry.size() == 0) {
                    log.warn("[对账] BusinessTypeRegistry 为空，本次跳过");
                    return;
                }
                List<WfReconcileAlert> inconsistent = reconcileAlertMapper.selectInconsistentRecords(
                        6, businessTypeRegistry.all());
                if (inconsistent.isEmpty()) return;
                for (WfReconcileAlert alert : inconsistent) {
                    alert.setCreateTime(LocalDateTime.now());
                    try {
                        reconcileAlertMapper.insert(alert);
                        log.warn("[对账] 发现不一致: processInstanceId={}, businessType={}, businessId={}, tenantId={}",
                                alert.getProcessInstanceId(), alert.getBusinessType(), alert.getBusinessId(),
                                alert.getTenantId());
                    } catch (Exception e) {
                        // uk_instance 唯一键冲突时忽略（已记录过）
                        log.debug("[对账] 跳过已存在记录: processInstanceId={}", alert.getProcessInstanceId());
                    }
                }
            } catch (Exception e) {
                log.error("[对账] 对账 Job 执行失败", e);
            }
        });
    }
}
