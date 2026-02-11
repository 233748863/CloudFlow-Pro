package cn.joywon.poco.merchant.OrderModule.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Map;

@Data
@Schema(description = "订单支付记录VO")
public class OrderPayRecordVO implements Serializable {

    private static final long serialVersionUID = 1L;

    @Schema(description = "主键ID")
    private Long id;

    @Schema(description = "订单ID")
    private Long orderId;

    @Schema(description = "订单号")
    private String orderNo;

    @Schema(description = "支付通道")
    private String paymentChannel;

    @Schema(description = "第三方支付单号")
    private String thirdPartyTradeNo;

    @Schema(description = "请求支付金额")
    private BigDecimal requestAmount;

    @Schema(description = "支付状态：INIT-初始化，PAYING-支付中，SUCCESS-支付成功，FAILED-支付失败，CANCELLED-已取消")
    private String status;

    @Schema(description = "状态描述")
    private String statusDescription;

    @Schema(description = "回调/响应报文")
    private Map<String, Object> callbackData;

    @Schema(description = "创建时间")
    private LocalDateTime createdTime;

    @Schema(description = "更新时间")
    private LocalDateTime updatedTime;
}