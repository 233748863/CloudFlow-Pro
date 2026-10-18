package com.cloudflow.crm.service.receivable;

import com.cloudflow.crm.constant.CrmConstants;
import com.cloudflow.crm.domain.CrmReceivable;
import com.cloudflow.crm.exception.CrmBusinessException;
import com.cloudflow.crm.service.deal.CrmDealPolicy;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Objects;
import java.util.Set;

public final class CrmReceivableAmounts {
    private CrmReceivableAmounts() { }

    public static void version(CrmReceivable record, Integer expected) {
        if (expected == null || expected < 0 || !Objects.equals(expected, record.getVersion()))
            throw new CrmBusinessException("回款计划已被修改，请刷新核对后重试");
        if (expected == Integer.MAX_VALUE) throw new CrmBusinessException("回款计划版本已达到上限");
    }

    public static void active(CrmReceivable record) {
        if (!Set.of(CrmConstants.ReceivableStatus.PLANNED, CrmConstants.ReceivableStatus.PARTIAL_RECEIVED,
                CrmConstants.ReceivableStatus.RECEIVED).contains(record.getStatus() == null ? "" : record.getStatus()))
            throw new CrmBusinessException("当前回款计划状态不能进行收款或退款");
    }

    public static BigDecimal received(CrmReceivable record) {
        BigDecimal amount = CrmDealPolicy.money(record.getReceivedAmount() == null ? BigDecimal.ZERO : record.getReceivedAmount());
        if (amount.compareTo(CrmDealPolicy.money(record.getPlannedAmount())) > 0)
            throw new CrmBusinessException("已到账金额超过计划金额，请核对原记录");
        return amount;
    }

    public static BigDecimal remaining(CrmReceivable record) {
        return CrmDealPolicy.money(record.getPlannedAmount()).subtract(received(record));
    }

    public static BigDecimal positive(BigDecimal amount, String label) {
        BigDecimal normalized = CrmDealPolicy.money(amount);
        if (normalized.signum() <= 0) throw new CrmBusinessException(label + "必须大于0");
        return normalized;
    }

    public static LocalDate date(LocalDate requested) {
        LocalDate date = requested == null ? LocalDate.now() : requested;
        if (date.isAfter(LocalDate.now())) throw new CrmBusinessException("实际收款日期不能晚于今天");
        return date;
    }

    public static void apply(CrmReceivable record, BigDecimal received, LocalDate receivedDate) {
        BigDecimal planned = CrmDealPolicy.money(record.getPlannedAmount());
        BigDecimal normalized = CrmDealPolicy.money(received);
        if (normalized.compareTo(planned) > 0) throw new CrmBusinessException("已到账金额不能超过计划金额");
        BigDecimal outstanding = planned.subtract(normalized);
        record.setPlannedAmount(planned);
        record.setReceivedAmount(normalized);
        record.setOutstandingAmount(outstanding);
        record.setReceivedDate(normalized.signum() == 0 ? null : date(record.getReceivedDate() == null ? receivedDate : record.getReceivedDate()));
        record.setStatus(normalized.signum() == 0 ? CrmConstants.ReceivableStatus.PLANNED
                : outstanding.signum() == 0 ? CrmConstants.ReceivableStatus.RECEIVED : CrmConstants.ReceivableStatus.PARTIAL_RECEIVED);
    }
}
