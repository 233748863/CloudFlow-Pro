package com.cloudflow.hr.domain.dto.benefit;

import com.cloudflow.common.core.domain.PageQuery;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * 福利申领分页查询入参。
 */
@Data
@EqualsAndHashCode(callSuper = true)
@Schema(name = "HrBenefitRequestQueryDTO", description = "福利申领分页查询入参")
public class HrBenefitRequestQueryDTO extends PageQuery {

    @Schema(description = "申领编号")
    private String requestNo;

    @Schema(description = "员工 ID")
    private Long employeeId;

    @Schema(description = "福利方案 ID")
    private Long schemeId;

    @Schema(description = "申领类型")
    private String requestType;

    @Schema(description = "状态")
    private String status;
}
