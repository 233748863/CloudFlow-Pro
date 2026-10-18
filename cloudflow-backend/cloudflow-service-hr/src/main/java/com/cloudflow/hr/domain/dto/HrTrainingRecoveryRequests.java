package com.cloudflow.hr.domain.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import lombok.Getter;
import lombok.Setter;

public final class HrTrainingRecoveryRequests {
    private HrTrainingRecoveryRequests() { }

    @Getter @Setter
    public static class Query extends HrHRequests.PageQuery {
        @Size(max = 100) private String keyword;
        @Positive private Long enrollmentId;
        @Pattern(regexp = "DRAFT|CONFIRMED|CLEARED|VOID") private String status;
    }

    @Getter @Setter
    public static class Assessment extends HrHRequests.StrictInput {
        @NotNull @DecimalMin("0.00") @Digits(integer = 12, fraction = 2)
        @JsonFormat(shape = JsonFormat.Shape.STRING) private BigDecimal assessedAmount;
        @NotBlank @Size(max = 1000) private String assessmentReason;
    }

    @Getter @Setter
    public static class Draft extends Assessment {
        @NotNull @Positive private Long enrollmentId;
        @NotNull @Positive private Long agreementFileId;
    }

    @Getter @Setter
    public static class Update extends Assessment {
        @NotNull @Min(0) private Integer version;
    }

    @Getter @Setter
    public static class Confirm extends HrHRequests.StrictInput {
        @NotNull @Min(0) private Integer version;
    }
}
