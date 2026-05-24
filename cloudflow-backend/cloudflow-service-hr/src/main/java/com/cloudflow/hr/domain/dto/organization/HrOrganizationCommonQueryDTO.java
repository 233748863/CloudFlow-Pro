package com.cloudflow.hr.domain.dto.organization;

import com.cloudflow.common.core.domain.PageQuery;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * 组织域共用分页查询入参（职族 / 职级 / 岗位 / 编制 列表使用）。
 *
 * <p>组织域过滤维度统一收敛：关键字、状态、部门、职族、职级、岗位、序列类型，避免每张表单建独立 QueryDTO。
 */
@Data
@EqualsAndHashCode(callSuper = true)
@Schema(name = "HrOrganizationCommonQueryDTO", description = "组织域共用分页查询入参")
public class HrOrganizationCommonQueryDTO extends PageQuery {

    @Schema(description = "关键字 模糊匹配 名称/编码")
    private String keyword;

    @Schema(description = "状态")
    private String status;

    @Schema(description = "部门 ID")
    private Long deptId;

    @Schema(description = "职族 ID")
    private Long familyId;

    @Schema(description = "职级 ID")
    private Long levelId;

    @Schema(description = "岗位 ID")
    private Long positionId;

    @Schema(description = "岗位序列类型 P/M/S/E")
    private String sequenceType;

    @Schema(description = "编制年度")
    private Integer fiscalYear;
}
