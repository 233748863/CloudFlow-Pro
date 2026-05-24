package com.cloudflow.hr.domain.dto.benefit;

import com.cloudflow.common.core.domain.PageQuery;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDateTime;

/**
 * 积分流水分页查询入参。
 */
@Data
@EqualsAndHashCode(callSuper = true)
@Schema(name = "HrPointTransactionQueryDTO", description = "积分流水分页查询入参")
public class HrPointTransactionQueryDTO extends PageQuery {

    @Schema(description = "方向：IN/OUT/ADJUST")
    private String direction;

    @Schema(description = "业务类型")
    private String bizType;

    @Schema(description = "时间起")
    private LocalDateTime occurredFrom;

    @Schema(description = "时间止")
    private LocalDateTime occurredTo;
}
