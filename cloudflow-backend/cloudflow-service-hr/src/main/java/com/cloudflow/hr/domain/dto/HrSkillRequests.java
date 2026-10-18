package com.cloudflow.hr.domain.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

public final class HrSkillRequests {
    private HrSkillRequests() { }

    @Data
    public static class Query {
        @Min(1)
        private int pageNum = 1;
        @Min(1) @Max(100)
        private int pageSize = 20;
        @Size(max = 100)
        private String keyword;
        @Size(max = 20)
        private String status;
        @Min(1)
        private Long employeeId;
        @Min(1)
        private Long positionId;
        @Min(1)
        private Long skillId;
        @Size(max = 64)
        private String requestKey;
    }

    public record Definition(@Min(1) Long skillId, @NotBlank @Size(max = 64) String skillCode,
            @NotBlank @Size(max = 100) String skillName, @Size(max = 100) String skillCategory,
            @Size(max = 1000) String description, @NotNull Map<String, String> levelDefinition,
            @NotBlank String status, @Min(0) Integer version) { }

    public record Requirement(@NotNull @Min(1) Long skillId,
            @NotNull @Min(1) @Max(5) Integer requiredLevel, @NotNull BigDecimal weight,
            @NotNull Boolean mandatory) { }

    public record PositionRequirements(@NotNull @Min(0) Integer version,
            @NotNull @Size(max = 100) List<@Valid Requirement> requirements) { }

    public record CourseTarget(@NotNull @Min(0) Integer version, @Min(1) Long skillId,
            @Min(1) @Max(5) Integer targetLevel) { }

    @Data
    public static class SelfAssessment {
        @NotNull @Min(1)
        private Long skillId;
        @NotNull @Min(1) @Max(5)
        private Integer level;
        private LocalDate expireDate;
        @NotBlank @Size(max = 500)
        private String remark;
        @NotBlank @Size(max = 64)
        private String requestKey;
    }

    @Data
    @EqualsAndHashCode(callSuper = true)
    public static class Assessment extends SelfAssessment {
        @NotNull @Min(1)
        private Long employeeId;
        @NotBlank
        private String evidenceType;
        @Min(1)
        private Long evidenceBizId;
    }

    public record Review(@NotNull @Min(0) Integer version, @NotNull Boolean approved,
            @Min(1) @Max(5) Integer level, LocalDate expireDate,
            @NotBlank @Size(max = 500) String remark) { }
}
