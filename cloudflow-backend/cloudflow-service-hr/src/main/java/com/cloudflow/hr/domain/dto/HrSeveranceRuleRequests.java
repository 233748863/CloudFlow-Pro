package com.cloudflow.hr.domain.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import lombok.Getter;
import lombok.Setter;

public final class HrSeveranceRuleRequests {
    private HrSeveranceRuleRequests() { }

    @Getter @Setter
    public static class Query {
        @Min(1) @Max(1000000) private Integer pageNum = 1;
        @Min(1) @Max(100) private Integer pageSize = 20;
        @Size(max = 100) private String keyword;
        @Pattern(regexp = "DRAFT|CONFIRMED|DISABLED") private String status;
    }

    @Getter @Setter
    public static class Slab extends HrHRequests.StrictInput {
        @NotNull @Min(0) @Max(1000) private Integer sortNo;
        @NotNull @DecimalMin("0") @Digits(integer = 4, fraction = 4)
        @JsonFormat(shape = JsonFormat.Shape.STRING) private BigDecimal minServiceYears;
        @DecimalMin(value = "0", inclusive = false) @Digits(integer = 4, fraction = 4)
        @JsonFormat(shape = JsonFormat.Shape.STRING) private BigDecimal maxServiceYears;
        @NotNull @Pattern(regexp = "FIXED|PER_YEAR") private String calculationMode;
        @NotNull @DecimalMin("0") @Digits(integer = 4, fraction = 4)
        @JsonFormat(shape = JsonFormat.Shape.STRING) private BigDecimal compensationMonths;
    }

    @Getter @Setter
    public static class Settings extends HrHRequests.StrictInput {
        @NotBlank @Size(max = 100) private String ruleName;
        @NotNull @JsonFormat(pattern = "yyyy-MM-dd") private LocalDate effectiveFrom;
        @JsonFormat(pattern = "yyyy-MM-dd") private LocalDate effectiveTo;
        @NotNull @Size(max = 100) private List<@NotNull @Positive Long> salaryComponentIds;
        @NotNull @Min(1) @Max(120) private Integer averagingMonths;
        @NotNull @Pattern(regexp = "ACTUAL_MONTHS|FLOOR_YEAR|CEIL_HALF_YEAR") private String serviceRounding;
        @DecimalMin(value = "0", inclusive = false) @Digits(integer = 12, fraction = 2)
        @JsonFormat(shape = JsonFormat.Shape.STRING) private BigDecimal socialMonthlySalary;
        @DecimalMin(value = "0", inclusive = false) @Digits(integer = 4, fraction = 4)
        @JsonFormat(shape = JsonFormat.Shape.STRING) private BigDecimal baseCapMultiplier;
        @DecimalMin(value = "0", inclusive = false) @Digits(integer = 4, fraction = 4)
        @JsonFormat(shape = JsonFormat.Shape.STRING) private BigDecimal maxCompensationMonths;
        @NotNull @DecimalMin("0") @Digits(integer = 4, fraction = 4)
        @JsonFormat(shape = JsonFormat.Shape.STRING) private BigDecimal noticeMonths;
        @DecimalMin(value = "0", inclusive = false) @Digits(integer = 4, fraction = 4)
        @JsonFormat(shape = JsonFormat.Shape.STRING) private BigDecimal leaveDailyDivisor;
        @DecimalMin(value = "0", inclusive = false) @Digits(integer = 4, fraction = 4)
        @JsonFormat(shape = JsonFormat.Shape.STRING) private BigDecimal leaveHoursPerDay;
        @DecimalMin("0") @Digits(integer = 4, fraction = 4)
        @JsonFormat(shape = JsonFormat.Shape.STRING) private BigDecimal leaveCashMultiplier;
        @Size(max = 500) private String remark;
        @NotNull @Size(max = 100) @Valid private List<@NotNull Slab> slabs;
    }

    @Getter @Setter
    public static class Create extends Settings {
        @NotBlank @Size(max = 64) @Pattern(regexp = "[A-Za-z0-9][A-Za-z0-9_.-]*") private String ruleCode;
    }

    @Getter @Setter
    public static class Update extends Settings {
        @NotNull @Min(0) private Integer version;
    }
}
