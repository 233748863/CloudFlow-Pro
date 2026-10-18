package com.cloudflow.hr.domain.vo.performance;

import com.cloudflow.hr.service.HrAppraisalRules;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

public final class HrAppraisalViews {
    private HrAppraisalViews() { }

    public record Employee(Long employeeId, String employeeName, String employeeNo, Long deptId, Long positionId,
                           Long jobLevelId, Long userId, LocalDateTime updateTime) { }
    public record Preview(List<Employee> employees, String digest) { }
    public record Option(Long identifier, String name) { }
    public record Options(List<Option> departments, List<Option> positions, List<Option> jobLevels) { }
    public record Kra(Long kraId, String kraName, BigDecimal weight, int sortNo, String description) { }
    public record Cycle(Long cycleId, String cycleName, String cycleType, LocalDate startDate, LocalDate endDate,
                        List<Long> scopeDeptIds, List<Long> scopePositionIds, List<Long> scopeJobLevelIds,
                        String evaluationMethod, String finalScoreMode, String finalScoreFormula,
                        HrAppraisalRules.Configuration scoreConfig, String status, int version,
                        LocalDateTime completedTime, String remark, int visibleParticipants) { }
    public record Goal(Long assignmentId, Long objectiveId, String objectiveName, Long parentId, Long kraId,
                       String assigneeType, Long assigneeId, String assigneeName, BigDecimal weight,
                       BigDecimal targetValue, Integer objectiveVersion, Integer assignmentVersion) { }
    public record GoalInput(Long assignmentId, Long resultId, Integer resultVersion, BigDecimal score, String summary) { }
    public record SourceInput(Long responseId, Long invitationId, Long employeeId, Long evaluatorEmployeeId,
                              String source, Integer invitationVersion, BigDecimal score, LocalDateTime submitTime) { }
    public record Rule(Long ruleId, Integer version, String ruleName, String enforceMode,
                       List<HrAppraisalRules.GradeQuota> distribution) { }
    public record Frozen(String evaluationMethod, String finalScoreMode, String finalScoreFormula,
                         HrAppraisalRules.Configuration scoreConfig, List<Kra> kras, List<Goal> goals,
                         Rule distributionRule, String participantsDigest) { }
    public record Inputs(List<GoalInput> goals, List<SourceInput> sources, Map<String, BigDecimal> values) { }
    public record Result(Long appraisalResultId, Long employeeId, Long userId, String employeeName, String employeeNo,
                         BigDecimal calculatedScore, BigDecimal finalScore, String grade, String calibrationReason,
                         String status, int version, List<GoalInput> goalScores, Map<String, BigDecimal> sourceScores) { }
    public record Session(Long sessionId, String sessionName, LocalDateTime scheduledAt, String location,
                          Long facilitatorUserId, List<Long> participantUserIds, String agenda, String minutes, String status,
                          List<Option> participantNames) { }
    public record Detail(Cycle cycle, List<Kra> kras, List<Goal> goals, List<Result> results,
                         Rule distributionRule, HrAppraisalRules.Distribution distribution, List<Session> sessions) { }
    public record Calculation(Long employeeId, String employeeName, BigDecimal calculatedScore, String error) { }
    public record Calculated(int version, List<Calculation> results) { }
    public record Invitation(Long invitationId, Integer version, Long cycleId, String cycleName, String cycleStatus,
                             String objectiveName, String evaluateeName, String evaluatorSource, String status,
                             BigDecimal score, String commentText, LocalDateTime submitTime,
                             BigDecimal minScore, BigDecimal maxScore) { }
}
