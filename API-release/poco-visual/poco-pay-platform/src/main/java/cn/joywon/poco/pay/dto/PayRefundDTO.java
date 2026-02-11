package cn.joywon.poco.pay.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;

/**
 * 支付退款DTO
 *
 * @author poco
 * @date 2025-12-27
 */
@Data
@Schema(description = "支付退款DTO")
public class PayRefundDTO {

    /**
     * 订单号
     */
    @Schema(description = "订单号")
    private String orderNo;

    /**
     * 退款单号
     */
    @Schema(description = "退款单号")
    private String refundNo;

    /**
     * 退款金额（元）
     */
    @Schema(description = "退款金额")
    private BigDecimal refundAmount;

    /**
     * 退款原因
     */
    @Schema(description = "退款原因")
    private String refundReason;
}
