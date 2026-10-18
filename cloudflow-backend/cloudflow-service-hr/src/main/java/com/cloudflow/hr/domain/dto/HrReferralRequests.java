package com.cloudflow.hr.domain.dto;

import jakarta.validation.constraints.*;
import lombok.Data;

public final class HrReferralRequests {
    private HrReferralRequests() { }

    @Data
    public static class Submit {
        @NotBlank @Size(max = 100) private String candidateName;
        @Size(max = 32) private String contactPhone;
        @Size(max = 254) private String email;
        @Size(max = 200) private String currentEmployer;
        @Size(max = 100) private String currentJobTitle;
        @NotNull @Positive private Long targetPositionId;
        @NotNull @Positive private Long resumeFileId;
        @Size(max = 1000) private String referralReason;
    }

    @Data
    public static class Query {
        @Min(1) private int pageNum = 1;
        @Min(1) @Max(100) private int pageSize = 20;
        @Size(max = 100) private String keyword;
        @Pattern(regexp = "SUBMITTED|SCREENING|INTERVIEWING|OFFERED|HIRED|REJECTED|DUPLICATE") private String status;
    }

    @Data
    public static class Screening {
        @NotNull @Min(0) private Integer version;
        @NotNull private Boolean accepted;
        @NotBlank @Size(max = 1000) private String reason;
    }

    @Data
    public static class Convert {
        @NotNull @Min(0) private Integer version;
        @NotNull @Positive private Long requisitionId;
    }

    @Data
    public static class Bonus {
        @NotNull @Min(0) private Integer version;
        @NotBlank @Pattern(regexp = "(?:0|[1-9][0-9]{0,11})(?:\\.[0-9]{1,2})?") private String amount;
        @NotNull @Positive private Long salaryComponentId;
        @NotNull @Positive private Long payrollPeriodId;
        @NotBlank @Size(max = 500) private String conditionRemark;
        @NotNull @AssertTrue private Boolean conditionsVerified;
    }
}
