package com.cloudflow.hr.domain.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.util.List;
import lombok.Getter;
import lombok.Setter;

public final class HrSettlementRequests {
    private HrSettlementRequests() { }

    @Getter @Setter
    public static class Query extends HrHRequests.PageQuery {
        @Size(max = 64) private String keyword;
        @Pattern(regexp = "DRAFT|CONFIRMED|PAID|CLOSED") private String status;
    }

    @Getter @Setter
    public static class Create extends HrHRequests.StrictInput {
        @NotNull @Positive private Long lifecycleApplicationId;
        @Size(max = 500) private String remark;
    }

    @Getter @Setter
    public static class Sampling extends HrHRequests.StrictInput {
        @NotNull @Size(min = 1, max = 120) private List<@NotNull @Pattern(regexp = "[1-9][0-9]{3}-(0[1-9]|1[0-2])") String> months;
        @NotNull @DecimalMin(value = "0", inclusive = false) @DecimalMax("120") @Digits(integer = 3, fraction = 4) private BigDecimal averagingMonths;
        @NotBlank @Size(max = 2000) private String reason;
    }

    @Getter @Setter
    public static class Update extends HrHRequests.VersionDTO {
        @Positive private Long ruleId;
        @Valid private Sampling sampling;
        @Size(max = 500) private String remark;
    }

    @Getter @Setter
    public static class AssetReminder extends HrHRequests.VersionDTO {
        @NotNull @jakarta.validation.constraints.PositiveOrZero private Integer assetVersion;
        @NotNull @jakarta.validation.constraints.PositiveOrZero private Long lastReminderId;
    }

    @Getter @Setter
    public static class AssetReview extends HrHRequests.VersionDTO {
        @NotBlank @Pattern(regexp = "[a-f0-9]{64}") private String sourceFingerprint;
        @NotBlank @Pattern(regexp = "LOSS_ASSESSED|RELEASED_NO_LOSS|CLEAR") private String resolution;
        @NotNull @DecimalMin("0") @DecimalMax("999999999999.99") @Digits(integer = 12, fraction = 6) private BigDecimal amount;
        @NotBlank @Size(max = 2000) private String reason;
    }

    @Getter @Setter
    public static class Receipt extends HrHRequests.VersionDTO {
        @NotNull @Positive private Long proofFileId;
        @NotNull @jakarta.validation.constraints.PastOrPresent private java.time.LocalDate actualDate;
    }

    @Getter @Setter
    public static class Reverse extends HrHRequests.VersionDTO {
        @NotBlank @Size(max = 500) private String reason;
    }
}
