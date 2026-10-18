package com.cloudflow.hr.domain.vo.settlement;

import com.fasterxml.jackson.annotation.JsonFormat;
import java.math.BigDecimal;
import java.time.LocalDateTime;

public record HrTrainingRecoveryView(Long recoveryId, Long employeeId, String employeeName, Long enrollmentId,
        String courseName, String sessionNo, Long agreementFileId, String agreementFileName,
        @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal assessedAmount,
        @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal collectedAmount,
        String assessmentReason, String status, Long confirmedBy, LocalDateTime confirmedTime, Long settlementId, Integer version) {
    public record Agreement(Long fileId, String fileName, long fileSize) { }
    public record Enrollment(Long value, String label) { }
}
