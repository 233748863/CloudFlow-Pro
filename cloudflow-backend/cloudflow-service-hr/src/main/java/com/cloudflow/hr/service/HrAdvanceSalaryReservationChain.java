package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.entity.HrAdvanceRepayment;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;

import static com.cloudflow.hr.service.HrHException.conflict;

/** A refunded salary deduction receives a new reservation; every former repayment remains immutable in the chain. */
final class HrAdvanceSalaryReservationChain {
    private HrAdvanceSalaryReservationChain() { }

    static String rootKey(Long advanceId, Long salaryId) { return "SALARY:" + salaryId + ":ADVANCE:" + advanceId; }
    static String restoredKey(Long advanceId, Long salaryId, Long originalRepaymentId) {
        return rootKey(advanceId, salaryId) + ":AFTER:" + originalRepaymentId;
    }
    static String reversalKey(Long reversalId, Long originalRepaymentId) {
        return "SETTLEMENT_REVERSAL:" + reversalId + ":REPAYMENT:" + originalRepaymentId;
    }

    static HrAdvanceRepayment current(Long tenantId, Long advanceId, Long salaryId, String month, List<HrAdvanceRepayment> ledger) {
        if (tenantId == null || tenantId <= 0 || advanceId == null || advanceId <= 0 || salaryId == null || salaryId <= 0
                || month == null || !month.matches("[0-9]{4}-(0[1-9]|1[0-2])") || month.startsWith("0000-") || ledger == null) throw changed();
        Set<Long> ids = new HashSet<>(); Set<String> keys = new HashSet<>();
        for (HrAdvanceRepayment row : ledger) {
            if (row == null || !Objects.equals(tenantId, row.getTenantId()) || !Objects.equals(advanceId, row.getAdvanceId())
                    || row.getRepaymentId() == null || row.getRepaymentId() <= 0 || !ids.add(row.getRepaymentId())
                    || row.getSourceEventKey() == null || row.getSourceEventKey().isBlank() || !keys.add(row.getSourceEventKey())) throw changed();
        }
        List<HrAdvanceRepayment> candidates = ledger.stream().filter(row -> Objects.equals(salaryId, row.getSalarySlipId()) && row.getReversalOfId() == null).toList();
        if (candidates.isEmpty()) {
            if (keys.contains(rootKey(advanceId, salaryId))) throw changed();
            return null;
        }
        for (HrAdvanceRepayment entry : candidates) {
            if (!"SALARY".equals(entry.getRepayType()) || !month.equals(entry.getRepayMonth()) || entry.getSettlementId() != null
                    || entry.getProofFileId() != null || entry.getRepayAmount() == null || entry.getRepayAmount().signum() <= 0
                    || entry.getRepayAmount().stripTrailingZeros().scale() > 2
                    || !List.of("RESERVED", "RELEASED", "POSTED", "REVERSED").contains(String.valueOf(entry.getStatus()))) throw changed();
            if (List.of("POSTED", "REVERSED").contains(entry.getStatus())) {
                if (entry.getPostedTime() == null || entry.getRepayDate() == null) throw changed();
            } else if (entry.getPostedTime() != null || entry.getRepayDate() != null) throw changed();
        }
        HrAdvanceRepayment current = uniqueKey(candidates, rootKey(advanceId, salaryId));
        if (current == null) throw changed();
        Set<Long> visited = new HashSet<>();
        while (visited.add(current.getRepaymentId())) {
            Long originalId = current.getRepaymentId();
            List<HrAdvanceRepayment> refunds = ledger.stream().filter(row -> Objects.equals(originalId, row.getReversalOfId())).toList();
            if (refunds.size() > 1 || !"REVERSED".equals(current.getStatus()) && !refunds.isEmpty()
                    || "REVERSED".equals(current.getStatus()) && refunds.size() != 1) throw changed();
            HrAdvanceRepayment refund = refunds.isEmpty() ? null : refunds.get(0);
            if (refund != null && (!"SALARY".equals(refund.getRepayType()) || !"POSTED".equals(refund.getStatus())
                    || !month.equals(refund.getRepayMonth()) || refund.getRepayAmount() == null
                    || refund.getRepayAmount().compareTo(current.getRepayAmount().negate()) != 0
                    || refund.getRepayDate() == null || refund.getPostedTime() == null || refund.getRepayDate().isBefore(current.getRepayDate()))) throw changed();
            HrAdvanceRepayment next = uniqueKey(candidates, restoredKey(advanceId, salaryId, originalId));
            boolean settlementRefund = refund != null && refund.getSettlementId() != null;
            if (settlementRefund && (refund.getSettlementId() <= 0 || refund.getSalarySlipId() != null || refund.getProofFileId() != null
                    || !reversalKey(refund.getSettlementId(), originalId).equals(refund.getSourceEventKey()))) throw changed();
            if (refund != null && !settlementRefund && (refund.getSalarySlipId() == null || refund.getSalarySlipId() <= 0
                    || Objects.equals(salaryId, refund.getSalarySlipId()) || refund.getProofFileId() != null
                    || !("SALARY_CORRECTION:" + refund.getSalarySlipId() + ":REPAYMENT:" + originalId).equals(refund.getSourceEventKey()))) throw changed();
            if (next == null) {
                if (visited.size() != candidates.size() || settlementRefund) throw changed();
                return current;
            }
            if (!settlementRefund || !"REVERSED".equals(current.getStatus())
                    || current.getRepayAmount().compareTo(next.getRepayAmount()) != 0) throw changed();
            current = next;
        }
        throw changed();
    }

    private static HrAdvanceRepayment uniqueKey(List<HrAdvanceRepayment> rows, String key) {
        List<HrAdvanceRepayment> matches = rows.stream().filter(row -> key.equals(row.getSourceEventKey())).toList();
        if (matches.size() > 1) throw changed();
        return matches.isEmpty() ? null : matches.get(0);
    }
    private static HrHException changed() { return conflict("ADVANCE_SALARY_CHAIN_INVALID", "工资扣还、原款返还与恢复预约的关联不一致"); }
}
