package com.cloudflow.hr.domain.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PastOrPresent;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDate;

public final class HrAdvanceRequests {
    private HrAdvanceRequests() { }

    @Getter @Setter
    public static class Query {
        @NotNull @Min(1) private Integer pageNum = 1;
        @NotNull @Min(1) @Max(100) private Integer pageSize = 20;
        @Positive private Long employeeId;
        @Size(max = 64) private String keyword;
        @Pattern(regexp = "APPLYING|APPROVED|PAID|REPAYING|CLEARED|WRITTEN_OFF") private String status;
        @Pattern(regexp = "DRAFT|SUBMITTED|APPROVED|REJECTED|CANCELLED") private String approvalStatus;
    }

    @Getter @Setter
    public static class Draft extends HrHRequests.StrictInput {
        @NotNull @DecimalMin(value = "0", inclusive = false) @Digits(integer = 12, fraction = 2)
        private BigDecimal amount;
        @NotBlank @Size(max = 500) private String purpose;
        @NotBlank @Pattern(regexp = "SALARY_DEDUCT|LUMP_SUM") private String repayMode;
        @Pattern(regexp = "[0-9]{4}-(0[1-9]|1[0-2])") private String repayStartMonth;
        @Positive private Integer repayMonths;
        @DecimalMin(value = "0", inclusive = false) @Digits(integer = 12, fraction = 2)
        private BigDecimal monthlyDeductAmount;
        @Min(0) private Integer version;
    }

    @Getter @Setter
    public static class Repayment extends HrHRequests.VersionDTO {
        @NotNull @DecimalMin(value = "0", inclusive = false) @Digits(integer = 12, fraction = 2)
        private BigDecimal amount;
        @NotBlank @Pattern(regexp = "[a-f0-9]{32}") private String sourceEventKey;
        @NotNull @Positive private Long proofFileId;
        @NotNull @PastOrPresent @JsonFormat(pattern = "yyyy-MM-dd") private LocalDate repayDate;
        @NotBlank @Size(max = 500) private String remark;
    }

    @Getter @Setter
    public static class Writeoff extends HrHRequests.ReasonVersionDTO {
        @NotNull @DecimalMin(value = "0", inclusive = false) @Digits(integer = 12, fraction = 2)
        private BigDecimal amount;
        @NotBlank @Pattern(regexp = "[a-f0-9]{32}") private String sourceEventKey;
        @NotNull @AssertTrue private Boolean confirmed;
    }
}
