package com.cloudflow.hr.domain.vo.performance;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * HR 360 评估邀请 + 应答 join 行 VO。
 */
@Data
@Schema(name = "Hr360EvaluatorRowVO", description = "HR 360 评估邀请 + 应答 join 行 VO")
public class Hr360EvaluatorRowVO {
    @Schema(description = "邀请 ID") private Long id;
    @Schema(description = "目标 ID") private Long objectiveId;
    @Schema(description = "目标名称") private String objectiveName;
    @Schema(description = "考核周期名称") private String cycleName;
    @Schema(description = "分解 ID") private Long assignmentId;
    @Schema(description = "被评员工 ID") private Long evaluateeId;
    @Schema(description = "被评员工姓名") private String evaluateeName;
    @Schema(description = "评估人 ID") private Long evaluatorId;
    @Schema(description = "评估人姓名") private String evaluatorName;
    @Schema(description = "评估来源（SELF/MANAGER/PEER/SUBORDINATE/CUSTOMER）") private String evaluatorSource;
    @Schema(description = "权重") private BigDecimal weight;
    @Schema(description = "状态（PENDING/SUBMITTED/CANCELLED）") private String status;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime inviteTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime submitTime;
    @Schema(description = "提醒次数") private Integer remindCount;
    @Schema(description = "聚合后绩效结果 ID") private Long resultId;
    @Schema(description = "得分") private BigDecimal score;
    @Schema(description = "维度得分明细") private List<Map<String, Object>> dimensionScores;
    @Schema(description = "评语") private String commentText;
}
