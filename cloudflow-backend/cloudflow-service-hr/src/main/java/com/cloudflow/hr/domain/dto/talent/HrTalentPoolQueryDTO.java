package com.cloudflow.hr.domain.dto.talent;

import com.cloudflow.common.core.domain.PageQuery;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * 人才池分页查询条件。
 */
@Data
@EqualsAndHashCode(callSuper = true)
@Schema(name = "HrTalentPoolQueryDTO", description = "人才池分页查询条件")
public class HrTalentPoolQueryDTO extends PageQuery {

    @Schema(description = "关键字（按池编号 / 名称模糊匹配）")
    private String keyword;

    @Schema(description = "池类型")
    private String poolType;

    @Schema(description = "池状态")
    private String status;

    @Schema(description = "池责任人员工 ID")
    private Long ownerId;
}
