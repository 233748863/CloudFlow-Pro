package com.cloudflow.hr.domain.dto.lifecycle;

import com.cloudflow.common.core.domain.PageQuery;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDate;

/**
 * 员工生命周期域共用分页查询入参（入职 / 转正 / 调动 / 离职 / 复职 / 借调 申请列表使用）。
 */
@Data
@EqualsAndHashCode(callSuper = true)
@Schema(name = "HrLifecycleCommonQueryDTO", description = "员工生命周期域共用分页查询入参")
public class HrLifecycleCommonQueryDTO extends PageQuery {

    @Schema(description = "关键字 模糊匹配")
    private String keyword;

    @Schema(description = "员工 ID")
    private Long employeeId;

    @Schema(description = "部门 ID")
    private Long deptId;

    @Schema(description = "申请类型 ONBOARDING/REGULAR/TRANSFER/RESIGNATION/REINSTATE/SECONDMENT")
    private String applicationType;

    @Schema(description = "状态")
    private String status;

    @Schema(description = "起始日期")
    private LocalDate startDate;

    @Schema(description = "结束日期")
    private LocalDate endDate;
}
