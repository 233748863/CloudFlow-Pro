package com.cloudflow.crm.service.impl;

import com.cloudflow.crm.constant.CrmConstants;
import com.cloudflow.crm.domain.CrmFollowUp;
import com.cloudflow.crm.domain.CrmReceivable;
import com.cloudflow.crm.domain.CrmRenewal;
import com.cloudflow.crm.domain.CrmServiceTicket;
import com.cloudflow.crm.domain.vo.CrmHealthReasonItemVO;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.stream.Collectors;

/** 依据本次读取的有效业务记录计算健康状态，计算过程不再访问数据库。 */
final class CrmHealthCalculator {
    private CrmHealthCalculator() { }

    static HealthSnapshot calculate(Long customerId, List<CrmFollowUp> followUps,
                                    List<CrmRenewal> renewals, List<CrmReceivable> receivables,
                                    List<CrmServiceTicket> tickets, LocalDateTime now) {
        LocalDate today = now.toLocalDate();
        LocalDateTime lastFollowUp = followUps.stream().map(CrmFollowUp::getFollowUpTime)
                .filter(Objects::nonNull).max(Comparator.naturalOrder()).orElse(null);
        LocalDateTime nextFollowUp = followUps.stream().map(CrmFollowUp::getNextFollowUpTime)
                .filter(Objects::nonNull).filter(time -> !time.isBefore(now))
                .min(Comparator.naturalOrder()).orElse(null);
        LocalDate renewalDate = renewals.stream()
                .filter(item -> !CrmConstants.RenewalStatus.LOST.equalsIgnoreCase(item.getStatus()))
                .map(CrmHealthCalculator::resolveRenewalDate).filter(Objects::nonNull)
                .min(Comparator.naturalOrder()).orElse(null);
        long overdueDays = receivables.stream()
                .filter(item -> item.getDueDate() != null && item.getDueDate().isBefore(today))
                .filter(item -> item.getOutstandingAmount() != null && item.getOutstandingAmount().signum() > 0)
                .mapToLong(item -> ChronoUnit.DAYS.between(item.getDueDate(), today)).max().orElse(0);
        List<CrmHealthReasonItemVO> reasons = new ArrayList<>();
        String customerLink = "/office/crm/customer/" + customerId;
        if (renewalDate != null) {
            long days = ChronoUnit.DAYS.between(today, renewalDate);
            if (days <= 90) {
                reasons.add(reason("RENEWAL", "RENEWAL_WINDOW", days <= 30 ? "30天内续约到期" : "90天内续约到期",
                        days <= 30 ? CrmConstants.HealthLevel.RED : CrmConstants.HealthLevel.YELLOW,
                        customerLink + "#renewal"));
            }
        }
        if (overdueDays > 0) {
            reasons.add(reason("RECEIVABLE", "RECEIVABLE_OVERDUE", overdueDays > 30 ? "回款逾期超过30天" : "回款逾期未超过30天",
                    overdueDays > 30 ? CrmConstants.HealthLevel.RED : CrmConstants.HealthLevel.YELLOW,
                    customerLink + "#cashflow"));
        }
        boolean highSeverity = false;
        boolean overdueTicket = false;
        for (CrmServiceTicket ticket : tickets) {
            if (ticket.getStatus() == null || CrmConstants.TicketStatus.RESOLVED.equals(ticket.getStatus())
                    || CrmConstants.TicketStatus.CLOSED.equals(ticket.getStatus())) {
                continue;
            }
            highSeverity |= CrmConstants.TicketSeverity.P1.equals(ticket.getSeverity())
                    || CrmConstants.TicketSeverity.P2.equals(ticket.getSeverity());
            overdueTicket |= ticket.getDueTime() != null && ticket.getDueTime().isBefore(now);
        }
        if (highSeverity) {
            reasons.add(reason("TICKET", "HIGH_SEVERITY_OPEN", "存在高严重度未关闭工单",
                    CrmConstants.HealthLevel.RED, customerLink + "#ticket"));
        }
        if (overdueTicket) {
            reasons.add(reason("TICKET", "SLA_OVERDUE", "存在SLA已超时未关闭工单",
                    CrmConstants.HealthLevel.RED, customerLink + "#ticket"));
        }
        if (lastFollowUp == null || ChronoUnit.DAYS.between(lastFollowUp.toLocalDate(), today) >= 30) {
            reasons.add(reason("FOLLOW_UP", "STALE_FOLLOW_UP", "30天未跟进",
                    CrmConstants.HealthLevel.YELLOW, customerLink + "#follow-up"));
        }
        if (reasons.isEmpty()) {
            reasons.add(reason("HEALTH", "NORMAL", "状态正常", CrmConstants.HealthLevel.GREEN, customerLink));
        }
        String level = reasons.stream().anyMatch(item -> CrmConstants.HealthLevel.RED.equals(item.getLevel()))
                ? CrmConstants.HealthLevel.RED : reasons.get(0).getLevel();
        String summary = reasons.stream().filter(item -> level.equals(item.getLevel()))
                .map(CrmHealthReasonItemVO::getName).collect(Collectors.joining("；"));
        return new HealthSnapshot(lastFollowUp, nextFollowUp, level, summary, List.copyOf(reasons));
    }

    static LocalDate resolveRenewalDate(CrmRenewal renewal) {
        if ((CrmConstants.RenewalStatus.WON.equalsIgnoreCase(renewal.getStatus())
                || CrmConstants.RenewalStatus.CLOSED.equalsIgnoreCase(renewal.getStatus()))
                && renewal.getNextExpireDate() != null) {
            return renewal.getNextExpireDate();
        }
        if (renewal.getCurrentExpireDate() != null) {
            return renewal.getCurrentExpireDate();
        }
        return renewal.getNextExpireDate() != null ? renewal.getNextExpireDate() : renewal.getExpectedSignDate();
    }

    private static CrmHealthReasonItemVO reason(String type, String code, String name, String level, String link) {
        CrmHealthReasonItemVO item = new CrmHealthReasonItemVO();
        item.setType(type);
        item.setCode(code);
        item.setName(name);
        item.setLevel(level);
        item.setLinkTarget(link);
        return item;
    }

    record HealthSnapshot(LocalDateTime lastFollowUp, LocalDateTime nextFollowUp, String level,
                          String summary, List<CrmHealthReasonItemVO> reasons) { }
}
