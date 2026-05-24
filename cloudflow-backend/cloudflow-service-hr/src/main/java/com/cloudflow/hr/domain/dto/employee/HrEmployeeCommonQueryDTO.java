package com.cloudflow.hr.domain.dto.employee;

import com.cloudflow.common.core.domain.PageQuery;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDate;

/**
 * 员工域共用分页查询入参（员工档案 / 紧急联系人 / 员工合同 / 员工证件 列表使用）。
 *
 * <p>员工域过滤维度统一收敛：关键字、员工状态、用工类型、部门、岗位、入职日期区间。
 */
@Data
@EqualsAndHashCode(callSuper = true)
@Schema(name = "HrEmployeeCommonQueryDTO", description = "员工域共用分页查询入参")
public class HrEmployeeCommonQueryDTO extends PageQuery {

    @Schema(description = "关键字 模糊匹配 工号/姓名")
    private String keyword;

    @Schema(description = "员工 ID")
    private Long employeeId;

    @Schema(description = "用户 ID（关联 sys_user）")
    private Long userId;

    @Schema(description = "员工状态 ACTIVE/PROBATION/LEAVE/TERMINATED")
    private String employeeStatus;

    @Schema(description = "用工类型 FULL_TIME/PART_TIME/INTERN/DISPATCH")
    private String employeeType;

    @Schema(description = "部门 ID")
    private Long deptId;

    @Schema(description = "岗位 ID")
    private Long positionId;

    @Schema(description = "职级 ID")
    private Long levelId;

    @Schema(description = "入职起始日期")
    private LocalDate hireStartDate;

    @Schema(description = "入职结束日期")
    private LocalDate hireEndDate;

    @Schema(description = "状态 通用过滤 例如紧急联系人/合同/证件状态")
    private String status;
}
