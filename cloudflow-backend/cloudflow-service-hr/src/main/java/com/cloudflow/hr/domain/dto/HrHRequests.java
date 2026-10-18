package com.cloudflow.hr.domain.dto;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.*;
import lombok.Getter;
import lombok.Setter;
import org.springframework.format.annotation.DateTimeFormat;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

public final class HrHRequests {
    private HrHRequests() {}

    public abstract static class StrictInput {
        @JsonAnySetter
        public final void rejectUnknown(String field, JsonNode value) {
            throw new IllegalArgumentException("请求包含不允许写入的字段");
        }
    }

    @Getter @Setter
    public static class VersionDTO extends StrictInput {
        @NotNull @Min(0) private Integer version;
    }

    @Getter @Setter
    public static class ReasonVersionDTO extends VersionDTO {
        @NotBlank @Size(max = 500) private String reason;
    }

    @Getter @Setter
    public static class OvertimeDraftDTO extends StrictInput {
        @NotNull @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss") private LocalDateTime startTime;
        @NotNull @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss") private LocalDateTime endTime;
        @NotNull @Pattern(regexp = "PAY|COMPENSATORY") private String settleMode;
        @NotBlank @Size(max = 800) private String reason;
        @Min(0) private Integer version;
    }

    @Getter @Setter
    public static class OvertimeHoursReviewDTO extends VersionDTO {
        @NotNull @Positive private Integer approvedMinutes;
        @NotBlank @Size(max = 500) private String note;
    }

    @Getter @Setter
    public static class OvertimePayReviewDTO extends VersionDTO {
        @NotNull @DecimalMin(value = "0", inclusive = false) @Digits(integer = 16, fraction = 2)
        private BigDecimal hourlyRate;
        @NotNull @Positive private Long payrollPeriodId;
        @NotBlank @Size(max = 500) private String note;
    }

    @Getter @Setter
    public static class OvertimeResolutionDTO extends ReasonVersionDTO {
        @NotNull @Pattern(regexp = "REJECT|COMPENSATORY_ADJUSTMENT|PAY_CORRECTION") private String action;
        @Positive private Long targetPeriodId;
        @Positive private Long originalSlipId;
    }

    @Getter @Setter
    public static class OvertimeTypeDTO extends StrictInput {
        @NotBlank @Size(max = 50) private String typeCode;
        @NotBlank @Size(max = 100) private String typeName;
        @NotNull @Pattern(regexp = "WORKDAY|REST_DAY|HOLIDAY") private String applicableDayType;
        @DecimalMin(value = "0", inclusive = false) @Digits(integer = 2, fraction = 2) private BigDecimal rateMultiplier;
        @Positive private Long salaryComponentId;
        @NotNull @Min(0) @Max(1) private Integer compensatoryFlag;
        @DecimalMin(value = "0", inclusive = false) @Digits(integer = 2, fraction = 2) private BigDecimal compensatoryRatio;
        @Positive private Long compensatoryLeaveTypeId;
        @DecimalMin(value = "0", inclusive = false) @Digits(integer = 6, fraction = 2) private BigDecimal maxHoursPerMonth;
        @DecimalMin(value = "0", inclusive = false) @Digits(integer = 6, fraction = 2) private BigDecimal maxHoursPerDay;
        @NotNull @Min(1) @Max(1) private Integer needApprovalFlag;
        @Size(max = 500) private String remark;
        @Min(0) private Integer version;
    }

    @Getter @Setter
    public static class OvertimeTypeStatusDTO extends ReasonVersionDTO {
        @NotNull @Min(0) @Max(1) private Integer status;
    }

    @Getter @Setter
    public static class ShiftDraftDTO extends StrictInput {
        @NotNull @Pattern(regexp = "SINGLE|SWAP") private String requestMode;
        @NotNull @JsonFormat(pattern = "yyyy-MM-dd") private LocalDate attendanceDate;
        @Positive private Long targetShiftId;
        @Positive private Long targetRuleId;
        @Positive private Long swapEmployeeId;
        @NotBlank @Size(max = 800) private String reason;
        @Min(0) private Integer version;
    }

    @Getter @Setter
    public static class ShiftResponseDTO extends VersionDTO {
        @NotNull @Pattern(regexp = "ACCEPTED|DECLINED") private String decision;
        @Size(max = 500) private String note;
    }

    @Getter @Setter
    public static class PageQuery {
        @Min(1) private Integer pageNum = 1;
        @Min(1) @Max(100) private Integer pageSize = 10;
        @Pattern(regexp = "createTime|workDate|requestNo") private String sortBy = "createTime";
        @Pattern(regexp = "asc|desc") private String sortOrder = "desc";
        @Positive private Long employeeId;
        @Positive private Long deptId;
    }

    @Getter @Setter
    public static class OvertimeQuery extends PageQuery {
        @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) private LocalDate workDateFrom;
        @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) private LocalDate workDateTo;
        @Pattern(regexp = "DRAFT|SUBMITTED|PENDING|APPROVING|APPROVED|REJECTED|CANCELLED") private String status;
        @Pattern(regexp = "NOT_READY|PENDING|SETTLED|FAILED|NEEDS_RESOLUTION|CORRECTION_PENDING|REJECTED") private String settlementStatus;
        @Pattern(regexp = "PAY|COMPENSATORY") private String settleMode;
    }

    @Getter @Setter
    public static class ShiftRequestQuery extends PageQuery {
        @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) private LocalDate dateFrom;
        @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) private LocalDate dateTo;
        @Pattern(regexp = "DRAFT|WAITING_ACCEPTANCE|PENDING|APPROVING|APPROVED|REJECTED|CANCELLED") private String status;
        @Pattern(regexp = "NOT_READY|PENDING|APPLIED|FAILED") private String applicationStatus;
    }
}
