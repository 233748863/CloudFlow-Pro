package com.cloudflow.hr.domain.vo.skill;

import com.cloudflow.common.core.domain.PageResult;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

public final class HrSkillViews {
    private HrSkillViews() { }

    public record Definition(Long skillId, String skillCode, String skillName, String skillCategory,
            String description, Map<String, String> levelDefinition, String status, Integer version) { }

    public record Requirement(Long skillId, String skillName, Integer requiredLevel, String weight,
            boolean mandatory) { }

    public record Position(Long positionId, String positionName, Integer version,
            List<Requirement> requirements) { }

    public record Course(Long courseId, String courseName, String status, Integer version,
            Long skillId, String skillName, Integer targetLevel) { }

    public record Assessment(Long assessmentId, Long employeeId, String employeeName,
            Long skillId, String skillName, Integer level, String evidenceType, String evidenceBizId,
            String status, boolean current, int effectiveLevel, LocalDate expireDate, String remark,
            LocalDateTime createTime, LocalDateTime assessTime, Integer version, String requestKey) { }

    public record Recommendation(Long courseId, String courseName, Integer targetLevel,
            Long sessionId, String sessionNo) { }

    public record Gap(Long skillId, String skillName, Integer requiredLevel, int currentLevel,
            int gap, boolean mandatory, String weight, List<Recommendation> recommendations) { }

    public record EmployeeGap(Long employeeId, String employeeName, Long positionId,
            String positionName, List<Gap> skills) { }

    public record Profile(Long employeeId, String employeeName, Long positionId,
            PageResult<Assessment> assessments) { }

    public record Employee(Long employeeId, String employeeName, String employeeNo, Long positionId) { }
}
