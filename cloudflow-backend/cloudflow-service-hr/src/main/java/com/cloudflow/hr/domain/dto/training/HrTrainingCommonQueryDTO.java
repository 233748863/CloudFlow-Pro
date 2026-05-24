package com.cloudflow.hr.domain.dto.training;

import com.cloudflow.common.core.domain.PageQuery;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * 培训域共用查询入参（培训报名、题库、试卷、作答列表使用）。
 *
 * <p>培训子域过滤维度统一收敛为：关键字、状态、员工、课程/试卷/题目关联，避免每张表单建独立 QueryDTO。
 */
@Data
@EqualsAndHashCode(callSuper = true)
@Schema(name = "HrTrainingCommonQueryDTO", description = "培训域共用分页查询入参")
public class HrTrainingCommonQueryDTO extends PageQuery {

    @Schema(description = "关键字 模糊匹配")
    private String keyword;

    @Schema(description = "状态")
    private String status;

    @Schema(description = "员工 ID")
    private Long employeeId;

    @Schema(description = "课程 ID")
    private Long courseId;

    @Schema(description = "培训计划 ID")
    private Long planId;

    @Schema(description = "培训排期 ID")
    private Long sessionId;

    @Schema(description = "试卷 ID")
    private Long paperId;

    @Schema(description = "题目类型 SINGLE/MULTI/JUDGE/FILL/ESSAY")
    private String questionType;

    @Schema(description = "难度等级")
    private String difficulty;
}
