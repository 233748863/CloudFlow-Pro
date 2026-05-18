package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.crm.constant.CrmConstants;
import com.cloudflow.crm.domain.CrmReceivable;
import com.cloudflow.crm.domain.CrmRenewal;
import com.cloudflow.crm.domain.CrmServiceTicket;
import com.cloudflow.crm.mapper.CrmReceivableMapper;
import com.cloudflow.crm.mapper.CrmRenewalMapper;
import com.cloudflow.crm.mapper.CrmServiceTicketMapper;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;

/**
 * 健康度相关的无状态计算。
 * 抽出以便 {@link CrmCustomerServiceImpl} 与 {@link CrmCustomerWorkspaceServiceImpl} 共享。
 */
final class CrmHealthCalculator {

    private CrmHealthCalculator() {
    }

    static LocalDate resolveRenewalWindowDate(CrmRenewalMapper renewalMapper, Long customerId) {
        return renewalMapper.selectList(new LambdaQueryWrapper<CrmRenewal>()
                        .eq(CrmRenewal::getCustomerId, customerId)
                        .eq(CrmRenewal::getDeleted, CrmConstants.DelFlag.NORMAL))
                .stream()
                .filter(item -> !CrmConstants.RenewalStatus.LOST.equalsIgnoreCase(item.getStatus()))
                .map(CrmHealthCalculator::resolveRenewalDate)
                .filter(Objects::nonNull)
                .min(Comparator.naturalOrder())
                .orElse(null);
    }

    static LocalDate resolveRenewalDate(CrmRenewal renewal) {
        if (renewal == null) {
            return null;
        }
        if (CrmConstants.RenewalStatus.WON.equalsIgnoreCase(renewal.getStatus())
                || CrmConstants.RenewalStatus.CLOSED.equalsIgnoreCase(renewal.getStatus())) {
            if (renewal.getNextExpireDate() != null) {
                return renewal.getNextExpireDate();
            }
        }
        if (renewal.getCurrentExpireDate() != null) {
            return renewal.getCurrentExpireDate();
        }
        if (renewal.getNextExpireDate() != null) {
            return renewal.getNextExpireDate();
        }
        return renewal.getExpectedSignDate();
    }

    static int resolveMaxOverdueDays(CrmReceivableMapper receivableMapper, Long customerId, LocalDate today) {
        List<CrmReceivable> receivables = receivableMapper.selectList(new LambdaQueryWrapper<CrmReceivable>()
                .eq(CrmReceivable::getCustomerId, customerId)
                .eq(CrmReceivable::getDeleted, CrmConstants.DelFlag.NORMAL));
        return (int) receivables.stream()
                .filter(item -> item.getDueDate() != null)
                .filter(item -> item.getOutstandingAmount() != null && item.getOutstandingAmount().signum() > 0)
                .filter(item -> item.getDueDate().isBefore(today))
                .mapToLong(item -> ChronoUnit.DAYS.between(item.getDueDate(), today))
                .max()
                .orElse(0L);
    }

    static boolean hasHighSeverityOpenTicket(CrmServiceTicketMapper mapper, Long customerId) {
        return mapper.selectCount(new LambdaQueryWrapper<CrmServiceTicket>()
                .eq(CrmServiceTicket::getCustomerId, customerId)
                .eq(CrmServiceTicket::getDeleted, CrmConstants.DelFlag.NORMAL)
                .in(CrmServiceTicket::getSeverity,
                        CrmConstants.TicketSeverity.HIGH,
                        CrmConstants.TicketSeverity.CRITICAL)
                .notIn(CrmServiceTicket::getStatus,
                        CrmConstants.TicketStatus.RESOLVED,
                        CrmConstants.TicketStatus.CLOSED)) > 0;
    }

    static String resolveAgingBucket(LocalDate dueDate, LocalDate today) {
        if (dueDate == null || !dueDate.isBefore(today)) {
            return "CURRENT";
        }
        long overdueDays = ChronoUnit.DAYS.between(dueDate, today);
        if (overdueDays <= 30) {
            return "DUE_30";
        }
        if (overdueDays <= 60) {
            return "DUE_60";
        }
        if (overdueDays <= 90) {
            return "DUE_90";
        }
        return "DUE_90_PLUS";
    }
}
