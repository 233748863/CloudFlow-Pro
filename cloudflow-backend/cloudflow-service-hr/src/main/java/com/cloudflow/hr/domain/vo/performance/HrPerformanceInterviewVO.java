package com.cloudflow.hr.domain.vo.performance;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.databind.JsonNode;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * HR 绩效面谈记录 VO（剔除 deleted/tenantId）。
 */
@Data
@Schema(name = "HrPerformanceInterviewVO", description = "HR 绩效面谈记录 VO")
public class HrPerformanceInterviewVO {
    @Schema(description = "面谈 ID") private Long id;
    @Schema(description = "目标 ID") private Long objectiveId;
    @Schema(description = "考核结果 ID") private Long resultId;
    @Schema(description = "被评估人 ID") private Long evaluateeId;
    @Schema(description = "被评估人姓名") private String evaluateeName;
    @Schema(description = "面谈人 ID") private Long interviewerId;
    @Schema(description = "面谈人姓名") private String interviewerName;
    @Schema(description = "HR 观察员 ID") private Long hrObserverId;
    @Schema(description = "HR 观察员姓名") private String hrObserverName;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime interviewTime;
    @Schema(description = "地点") private String location;
    @Schema(description = "持续时长（分钟）") private Integer durationMinutes;
    @Schema(description = "共识结论") private String consensus;
    @Schema(description = "改进事项数组") private JsonNode improvementItems;
    @Schema(description = "员工反馈") private String employeeFeedback;
    @Schema(description = "经理意见") private String managerComment;
    @Schema(description = "附件 URL") private JsonNode attachmentUrls;
    @Schema(description = "状态 DRAFT/CONFIRMED") private String status;
    @Schema(description = "创建人") private String createBy;
    @Schema(description = "更新人") private String updateBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
}
