package com.cloudflow.hr.job;

import com.cloudflow.common.job.annotation.JobHandler;
import com.cloudflow.common.job.model.JobResult;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.common.job.annotation.DistributedJob;
import com.cloudflow.common.tenant.support.TenantIterator;
import com.cloudflow.hr.domain.entity.HrEmployeeContract;
import com.cloudflow.hr.mapper.HrEmployeeContractMapper;
import com.cloudflow.hr.service.HrMessageService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

@Slf4j
@Component
@RequiredArgsConstructor
public class EmployeeContractExpireJob {

    private static final String CATEGORY_CONTRACT_EXPIRING = "CONTRACT_EXPIRING";
    private static final String CATEGORY_CONTRACT_EXPIRED = "CONTRACT_EXPIRED";

    private final TenantIterator tenantIterator;
    private final HrEmployeeContractMapper contractMapper;
    private final HrMessageService messageService;
    private final PlatformTransactionManager transactionManager;

    @JobHandler(value = "employeeContractExpire", desc = "员工合同到期提醒")
    @DistributedJob(name = "hr-employee-contract-expire-job", lockTime = 1800, waitTime = 5)
    public JobResult run() {
        LocalDate today = LocalDate.now();
        LocalDate threshold = today.plusDays(30);
        AtomicInteger expiring = new AtomicInteger();
        AtomicInteger expired = new AtomicInteger();
        List<RuntimeException> failures = new ArrayList<>();
        tenantIterator.forEachActiveTenant(tid -> {
            try {
                expiring.addAndGet(markExpiringContracts(tid, today, threshold));
                expired.addAndGet(markExpiredContracts(tid, today));
            } catch (RuntimeException exception) {
                log.error("HR合同到期扫描租户失败, tenantId={}", tid, exception);
                failures.add(new IllegalStateException("合同到期扫描失败，租户：" + tid, exception));
            }
        });
        if (!failures.isEmpty()) {
            IllegalStateException failure = new IllegalStateException("员工合同到期扫描存在失败租户："
                    + failures.size() + "个");
            failures.forEach(failure::addSuppressed);
            throw failure;
        }
        log.info("HR 合同到期扫描完成: expiring={}, expired={}", expiring.get(), expired.get());
        return JobResult.success(expiring.get() + expired.get(),
                "员工合同到期扫描完成：即将到期" + expiring.get() + "份，已到期" + expired.get() + "份");
    }

    private int markExpiringContracts(Long tenantId, LocalDate today, LocalDate threshold) {
        List<HrEmployeeContract> contracts = contractMapper.selectList(new LambdaQueryWrapper<HrEmployeeContract>()
                .eq(HrEmployeeContract::getTenantId, tenantId)
                .eq(HrEmployeeContract::getDeleted, 0)
                .ge(HrEmployeeContract::getEndDate, today)
                .le(HrEmployeeContract::getEndDate, threshold)
                .in(HrEmployeeContract::getStatus, "ACTIVE", "EFFECTIVE"));
        int updated = 0;
        // 每份合同的状态与消息事件共同提交，进程退出或消息登记失败时允许下次扫描重试。
        TransactionTemplate transaction = new TransactionTemplate(transactionManager);
        for (HrEmployeeContract contract : contracts) {
            Integer changed = transaction.execute(transactionStatus -> {
                int rows = contractMapper.update(null, new LambdaUpdateWrapper<HrEmployeeContract>()
                        .eq(HrEmployeeContract::getId, contract.getId())
                        .eq(HrEmployeeContract::getTenantId, tenantId)
                        .in(HrEmployeeContract::getStatus, "ACTIVE", "EFFECTIVE")
                        .set(HrEmployeeContract::getStatus, "EXPIRING")
                        .set(HrEmployeeContract::getUpdateBy, "system")
                        .set(HrEmployeeContract::getUpdateTime, LocalDateTime.now()));
                if (rows > 0) {
                    messageService.sendToEmployee(tenantId, contract.getEmployeeId(), CATEGORY_CONTRACT_EXPIRING,
                            "合同即将到期",
                            "合同 " + safe(contract.getContractNo()) + " 将于 " + contract.getEndDate() + " 到期",
                            "/hr/ess/contract", "HR_CONTRACT_EXPIRING", contract.getId());
                }
                return rows;
            });
            updated += changed;
        }
        return updated;
    }

    private int markExpiredContracts(Long tenantId, LocalDate today) {
        List<HrEmployeeContract> contracts = contractMapper.selectList(new LambdaQueryWrapper<HrEmployeeContract>()
                .eq(HrEmployeeContract::getTenantId, tenantId)
                .eq(HrEmployeeContract::getDeleted, 0)
                .lt(HrEmployeeContract::getEndDate, today)
                .ne(HrEmployeeContract::getStatus, "EXPIRED")
                .ne(HrEmployeeContract::getStatus, "TERMINATED"));
        int updated = 0;
        TransactionTemplate transaction = new TransactionTemplate(transactionManager);
        for (HrEmployeeContract contract : contracts) {
            Integer changed = transaction.execute(transactionStatus -> {
                int rows = contractMapper.update(null, new LambdaUpdateWrapper<HrEmployeeContract>()
                        .eq(HrEmployeeContract::getId, contract.getId())
                        .eq(HrEmployeeContract::getTenantId, tenantId)
                        .ne(HrEmployeeContract::getStatus, "EXPIRED")
                        .ne(HrEmployeeContract::getStatus, "TERMINATED")
                        .set(HrEmployeeContract::getStatus, "EXPIRED")
                        .set(HrEmployeeContract::getUpdateBy, "system")
                        .set(HrEmployeeContract::getUpdateTime, LocalDateTime.now()));
                if (rows > 0) {
                    messageService.sendToEmployee(tenantId, contract.getEmployeeId(), CATEGORY_CONTRACT_EXPIRED,
                            "合同已到期",
                            "合同 " + safe(contract.getContractNo()) + " 已于 " + contract.getEndDate() + " 到期",
                            "/hr/ess/contract", "HR_CONTRACT_EXPIRED", contract.getId());
                }
                return rows;
            });
            updated += changed;
        }
        return updated;
    }

    private String safe(String value) {
        return value == null ? "" : value;
    }
}
