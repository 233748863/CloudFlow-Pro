package com.cloudflow.hr.domain.vo.benefit;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * HR 积分商城订单明细 VO（剔除 deleted/tenantId）。
 */
@Data
@Schema(name = "HrMallOrderItemVO", description = "HR 积分商城订单明细 VO")
public class HrMallOrderItemVO {
    @Schema(description = "明细 ID") private Long id;
    @Schema(description = "订单 ID") private Long orderId;
    @Schema(description = "商品 ID") private Long itemId;
    @Schema(description = "商品名称") private String itemName;
    @Schema(description = "积分售价") private Integer pointPrice;
    @Schema(description = "数量") private Integer quantity;
    @Schema(description = "小计积分") private Integer subtotal;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
}
