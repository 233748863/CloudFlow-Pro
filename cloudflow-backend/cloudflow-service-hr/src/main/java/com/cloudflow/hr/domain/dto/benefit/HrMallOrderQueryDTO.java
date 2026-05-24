package com.cloudflow.hr.domain.dto.benefit;

import com.cloudflow.common.core.domain.PageQuery;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * 积分商城订单分页查询入参。
 */
@Data
@EqualsAndHashCode(callSuper = true)
@Schema(name = "HrMallOrderQueryDTO", description = "积分商城订单分页查询入参")
public class HrMallOrderQueryDTO extends PageQuery {

    @Schema(description = "订单编号")
    private String orderNo;

    @Schema(description = "员工 ID")
    private Long employeeId;

    @Schema(description = "状态：PENDING/PAID/SHIPPED/COMPLETED/CANCELLED")
    private String status;
}
