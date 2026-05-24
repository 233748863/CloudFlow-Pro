package com.cloudflow.hr.domain.vo.talent;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 培养行动视图。
 */
@Data
@Schema(name = "HrTalentDevelopmentActionVO", description = "培养行动视图")
public class HrTalentDevelopmentActionVO {

    @Schema(description = "行动主键")
    private Long id;

    @Schema(description = "员工 ID")
    private Long employeeId;

    @Schema(description = "来源盘点 ID")
    private Long sourceReviewId;

    @Schema(description = "来源人才池 ID")
    private Long sourcePoolId;

    @Schema(description = "行动类型")
    private String actionType;

    @Schema(description = "行动名称")
    private String actionName;

    @Schema(description = "导师员工 ID")
    private Long mentorId;

    @Schema(description = "负责人员工 ID")
    private Long ownerId;

    @Schema(description = "开始日期")
    private LocalDate startDate;

    @Schema(description = "结束日期")
    private LocalDate endDate;

    @Schema(description = "关联培训场次 ID")
    private Long trainingSessionId;

    @Schema(description = "状态")
    private String status;

    @Schema(description = "评估分数")
    private BigDecimal evaluationScore;

    @Schema(description = "评估备注")
    private String evaluationNotes;

    @Schema(description = "行动描述")
    private String description;

    @Schema(description = "创建时间")
    private LocalDateTime createTime;

    @Schema(description = "更新时间")
    private LocalDateTime updateTime;
}
