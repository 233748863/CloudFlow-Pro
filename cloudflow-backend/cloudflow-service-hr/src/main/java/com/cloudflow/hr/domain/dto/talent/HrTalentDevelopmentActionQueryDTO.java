package com.cloudflow.hr.domain.dto.talent;

import com.cloudflow.common.core.domain.PageQuery;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * 培养行动分页查询条件。
 */
@Data
@EqualsAndHashCode(callSuper = true)
@Schema(name = "HrTalentDevelopmentActionQueryDTO", description = "培养行动分页查询条件")
public class HrTalentDevelopmentActionQueryDTO extends PageQuery {

    @Schema(description = "员工 ID")
    private Long employeeId;

    @Schema(description = "来源盘点 ID")
    private Long sourceReviewId;

    @Schema(description = "来源人才池 ID")
    private Long sourcePoolId;

    @Schema(description = "行动类型")
    private String actionType;

    @Schema(description = "状态")
    private String status;

    @Schema(description = "负责人员工 ID")
    private Long ownerId;
}
