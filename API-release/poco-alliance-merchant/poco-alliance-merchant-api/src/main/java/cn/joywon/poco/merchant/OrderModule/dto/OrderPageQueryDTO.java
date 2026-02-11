package cn.joywon.poco.merchant.OrderModule.dto;

import cn.joywon.poco.merchant.Common.page.PageQueryDTO;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Schema(description = "订单分页条件查询参数")
public class OrderPageQueryDTO extends PageQueryDTO {

    @Schema(description = "订单状态(字符串枚举)")
    private String status;

    @Schema(description = "门店ID")
    private Long storeId;

    @Schema(description = "用户ID")
    private Long userId;

    @Schema(description = "订单号")
    private String orderNo;

    @Schema(description = "创建开始时间")
    private LocalDateTime createdStart;

    @Schema(description = "创建结束时间")
    private LocalDateTime createdEnd;
}