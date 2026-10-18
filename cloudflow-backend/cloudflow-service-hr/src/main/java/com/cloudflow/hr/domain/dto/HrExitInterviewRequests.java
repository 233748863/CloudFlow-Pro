package com.cloudflow.hr.domain.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.time.LocalDateTime;
import java.util.List;
import lombok.Getter;
import lombok.Setter;

public final class HrExitInterviewRequests {
    private HrExitInterviewRequests() { }

    @Getter @Setter
    public static class Query extends HrHRequests.PageQuery {
        @Positive private Long lifecycleApplicationId;
        @Size(max = 64) private String keyword;
        @Pattern(regexp = "DRAFT|CONFIRMED") private String status;
    }

    @Getter @Setter
    public static class Draft extends HrHRequests.StrictInput {
        @NotNull @Positive private Long lifecycleApplicationId;
        @Positive private Long settlementId;
        @NotNull @Positive private Long interviewerId;
        @NotNull @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss") private LocalDateTime interviewTime;
        @Size(max = 200) private String location;
        @Size(max = 1000) private String leavingReason;
        @Size(max = 10000) private String employeeFeedback;
        @Size(max = 10000) private String managerComment;
        @Size(max = 50) private List<@NotNull @Size(min = 1, max = 1000) String> improvementItems;
        @Size(max = 50) private List<@NotNull @Positive Long> attachmentFileIds;
        @NotNull @Pattern(regexp = "DRAFT|CONFIRMED") private String status = "DRAFT";
        @Min(0) private Integer version;
    }
}
