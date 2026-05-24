package com.cloudflow.hr.domain.dto.talent;

import com.cloudflow.common.core.domain.PageQuery;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * 人才盘点活动分页查询条件。
 */
@Data
@EqualsAndHashCode(callSuper = true)
@Schema(name = "HrTalentReviewQueryDTO", description = "人才盘点活动分页查询条件")
public class HrTalentReviewQueryDTO extends PageQuery {

    @Schema(description = "关键字（按盘点编号 / 名称模糊匹配）")
    private String keyword;

    @Schema(description = "盘点状态：DRAFT / IN_PROGRESS / CALIBRATING / PUBLISHED / CLOSED")
    private String status;

    @Schema(description = "盘点年度")
    private Integer reviewYear;

    @Schema(description = "盘点周期类型")
    private String cycleType;

    @Schema(description = "盘点范围类型")
    private String scopeType;

    @Schema(description = "盘点责任人员工 ID")
    private Long ownerId;
}
