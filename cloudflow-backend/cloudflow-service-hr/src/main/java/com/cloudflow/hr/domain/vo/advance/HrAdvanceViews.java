package com.cloudflow.hr.domain.vo.advance;

import com.cloudflow.common.core.domain.PageResult;

import java.time.LocalDate;
import java.time.LocalDateTime;

public final class HrAdvanceViews {
    private HrAdvanceViews() { }

    public record Summary(Long advanceId, String advanceNo, Long employeeId, String employeeName,
            String amount, String purpose, LocalDate applyDate, String repayMode, String repayStartMonth,
            Integer repayMonths, String monthlyDeductAmount, String repaidAmount, String outstandingAmount,
            String reservedAmount, String writtenOffAmount, String status, String approvalStatus,
            LocalDateTime paidTime, Integer version) { }

    public record Repayment(Long repaymentId, String amount, String repayMonth, String repayType, String status,
            Long reversalOfId, LocalDate repayDate, LocalDateTime postedTime, Long proofFileId,
            String remark, String sourceEventKey) { }

    public record Detail(Summary advance, PageResult<Repayment> repayments, boolean canEdit,
            boolean canRepay, boolean canWriteoff) { }

    public record Proof(Long fileId, String fileName, long fileSize) { }

    public record Approval(String taskId, Long advanceId, String advanceNo, String employeeName,
            String amount, String purpose, LocalDate applyDate, String repayMode, String repayStartMonth,
            Integer repayMonths, String monthlyDeductAmount, String approvalStatus) { }
}
