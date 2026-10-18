package com.cloudflow.hr.domain.dto;

import com.cloudflow.hr.service.HrAppraisalRules;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

public final class HrAppraisalRequests {
    private HrAppraisalRequests() { }

    @Getter @Setter
    public static class Query {
        @Min(1) private int pageNum = 1;
        @Min(1) @Max(100) private int pageSize = 20;
        @Size(max = 100) private String keyword;
        @Pattern(regexp = "DRAFT|ONGOING|SCORING|CALIBRATING|COMPLETED") private String status;
    }

    @Getter @Setter
    public static class InvitationQuery {
        @Min(1) private int pageNum = 1;
        @Min(1) @Max(100) private int pageSize = 20;
        @Size(max = 100) private String keyword;
        @Pattern(regexp = "PENDING|SUBMITTED|CANCELLED") private String status;
    }

    @Getter @Setter
    public static class Response extends HrHRequests.VersionDTO {
        @NotNull @Digits(integer = 6, fraction = 2) private BigDecimal score;
        @NotBlank @Size(max = 2000) private String commentText;
    }

    @Getter @Setter
    public static class Draft extends HrHRequests.StrictInput {
        @Positive private Long cycleId;
        @Min(0) private Integer version;
        @NotBlank @Size(max = 100) private String cycleName;
        @NotNull @Pattern(regexp = "MONTHLY|QUARTERLY|HALF_YEARLY|YEARLY") private String cycleType;
        @NotNull private LocalDate startDate;
        @NotNull private LocalDate endDate;
        @NotNull private List<@NotNull @Positive Long> scopeDeptIds = List.of();
        @NotNull private List<@NotNull @Positive Long> scopePositionIds = List.of();
        @NotNull private List<@NotNull @Positive Long> scopeJobLevelIds = List.of();
        @NotNull private String evaluationMethod;
        @NotNull private String finalScoreMode;
        @Size(max = 500) private String finalScoreFormula;
        @NotNull private HrAppraisalRules.Configuration scoreConfig;
        @Size(max = 500) private String remark;
    }

    @Getter @Setter
    public static class Transition extends HrHRequests.VersionDTO {
        @NotNull private String targetStatus;
        @Size(max = 64) private String previewDigest;
        private boolean acknowledgeWarnings;
    }

    @Getter @Setter
    public static class Kras extends HrHRequests.VersionDTO {
        @NotNull @Valid private List<Kra> kras;
    }

    public record Kra(@NotBlank @Size(max = 100) String kraName, @NotNull @DecimalMin("0") @Digits(integer = 1, fraction = 4) BigDecimal weight,
                      @Size(max = 500) String description) { }

    @Getter @Setter
    public static class GoalTree extends HrHRequests.VersionDTO {
        @Positive private Long objectiveId;
        @NotBlank @Size(max = 200) private String objectiveName;
        @Positive private Long kraId;
        @NotEmpty @Valid private List<GoalNode> nodes;
    }

    public record GoalNode(@NotBlank @Size(max = 64) String key, @Size(max = 64) String parentKey,
                           @NotNull @Pattern(regexp = "EMPLOYEE|DEPT") String assigneeType,
                           @NotNull @Positive Long assigneeId,
                           @NotNull @DecimalMin("0") @Digits(integer = 1, fraction = 4) BigDecimal weight,
                           @NotNull @Digits(integer = 14, fraction = 4) BigDecimal targetValue) { }

    @Getter @Setter
    public static class GoalScore extends HrHRequests.VersionDTO {
        @NotNull @Positive private Long assignmentId;
        @NotNull @Digits(integer = 6, fraction = 2) private BigDecimal score;
        @NotBlank @Size(max = 2000) private String summary;
    }

    @Getter @Setter
    public static class Distribution extends HrHRequests.VersionDTO {
        @NotBlank @Size(max = 120) private String ruleName;
        @NotNull @Pattern(regexp = "WARN|BLOCK") private String enforceMode;
        @NotEmpty private List<HrAppraisalRules.GradeQuota> distribution;
    }

    @Getter @Setter
    public static class Calibration extends HrHRequests.VersionDTO {
        @NotNull @Positive private Long appraisalResultId;
        @NotNull @Min(0) private Integer resultVersion;
        @NotNull @Digits(integer = 6, fraction = 4) private BigDecimal finalScore;
        @NotBlank @Size(max = 30) private String grade;
        @NotBlank @Size(max = 1000) private String reason;
    }

    @Getter @Setter
    public static class Session extends HrHRequests.VersionDTO {
        @Positive private Long sessionId;
        @NotBlank @Size(max = 200) private String sessionName;
        @NotNull private LocalDateTime scheduledAt;
        @NotBlank @Size(max = 200) private String location;
        @NotNull @Positive private Long facilitatorUserId;
        @NotEmpty private List<@NotNull @Positive Long> participantUserIds;
        @NotBlank @Size(max = 2048) private String agenda;
        @Size(max = 4096) private String minutes;
        @NotNull @Pattern(regexp = "PLANNED|ONGOING|COMPLETED|CANCELLED") private String status;
    }
}
