package com.cloudflow.hr.job;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.common.tenant.support.TenantIterator;
import com.cloudflow.hr.domain.entity.HrEmployeeContract;
import com.cloudflow.hr.domain.entity.HrSelfServiceMessage;
import com.cloudflow.hr.mapper.HrEmployeeContractMapper;
import com.cloudflow.hr.mapper.HrSelfServiceMessageMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.LocalDateTime;
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
    private final HrSelfServiceMessageMapper messageMapper;

    @Scheduled(cron = "${cloudflow.hr.contract.expire-cron:0 0 4 * * ?}")
    public void run() {
        LocalDate today = LocalDate.now();
        LocalDate threshold = today.plusDays(30);
        AtomicInteger expiring = new AtomicInteger();
        AtomicInteger expired = new AtomicInteger();
        tenantIterator.forEachActiveTenant(tid -> {
            expiring.addAndGet(markExpiringContracts(tid, today, threshold));
            expired.addAndGet(markExpiredContracts(tid, today));
        });
        log.info("HR 合同到期扫描完成: expiring={}, expired={}", expiring.get(), expired.get());
    }

    private int markExpiringContracts(Long tenantId, LocalDate today, LocalDate threshold) {
        List<HrEmployeeContract> contracts = contractMapper.selectList(new LambdaQueryWrapper<HrEmployeeContract>()
                .eq(HrEmployeeContract::getTenantId, tenantId)
                .eq(HrEmployeeContract::getDeleted, 0)
                .ge(HrEmployeeContract::getEndDate, today)
                .le(HrEmployeeContract::getEndDate, threshold)
                .in(HrEmployeeContract::getStatus, "ACTIVE", "EFFECTIVE"));
        int updated = 0;
        for (HrEmployeeContract contract : contracts) {
            int rows = contractMapper.update(null, new LambdaUpdateWrapper<HrEmployeeContract>()
                    .eq(HrEmployeeContract::getId, contract.getId())
                    .eq(HrEmployeeContract::getTenantId, tenantId)
                    .in(HrEmployeeContract::getStatus, "ACTIVE", "EFFECTIVE")
                    .set(HrEmployeeContract::getStatus, "EXPIRING")
                    .set(HrEmployeeContract::getUpdateBy, "system")
                    .set(HrEmployeeContract::getUpdateTime, LocalDateTime.now()));
            if (rows > 0) {
                createMessageIfAbsent(tenantId, contract.getEmployeeId(), CATEGORY_CONTRACT_EXPIRING,
                        "合同即将到期",
                        "合同 " + safe(contract.getContractNo()) + " 将于 " + contract.getEndDate() + " 到期",
                        contract.getId());
                updated += rows;
            }
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
        for (HrEmployeeContract contract : contracts) {
            int rows = contractMapper.update(null, new LambdaUpdateWrapper<HrEmployeeContract>()
                    .eq(HrEmployeeContract::getId, contract.getId())
                    .eq(HrEmployeeContract::getTenantId, tenantId)
                    .ne(HrEmployeeContract::getStatus, "EXPIRED")
                    .ne(HrEmployeeContract::getStatus, "TERMINATED")
                    .set(HrEmployeeContract::getStatus, "EXPIRED")
                    .set(HrEmployeeContract::getUpdateBy, "system")
                    .set(HrEmployeeContract::getUpdateTime, LocalDateTime.now()));
            if (rows > 0) {
                createMessageIfAbsent(tenantId, contract.getEmployeeId(), CATEGORY_CONTRACT_EXPIRED,
                        "合同已到期",
                        "合同 " + safe(contract.getContractNo()) + " 已于 " + contract.getEndDate() + " 到期",
                        contract.getId());
                updated += rows;
            }
        }
        return updated;
    }

    private void createMessageIfAbsent(Long tenantId, Long employeeId, String category,
                                       String title, String summary, Long relatedId) {
        if (employeeId == null || relatedId == null) {
            return;
        }
        Long exists = messageMapper.selectCount(new LambdaQueryWrapper<HrSelfServiceMessage>()
                .eq(HrSelfServiceMessage::getTenantId, tenantId)
                .eq(HrSelfServiceMessage::getEmployeeId, employeeId)
                .eq(HrSelfServiceMessage::getCategory, category)
                .eq(HrSelfServiceMessage::getRelatedId, relatedId)
                .last("LIMIT 1"));
        if (exists != null && exists > 0) {
            return;
        }
        HrSelfServiceMessage message = new HrSelfServiceMessage();
        message.setTenantId(tenantId);
        message.setEmployeeId(employeeId);
        message.setCategory(category);
        message.setTitle(title);
        message.setSummary(summary);
        message.setLinkUrl("/hr/ess/contract");
        message.setRelatedId(relatedId);
        message.setReadFlag(false);
        messageMapper.insert(message);
    }

    private String safe(String value) {
        return value == null ? "" : value;
    }
}
