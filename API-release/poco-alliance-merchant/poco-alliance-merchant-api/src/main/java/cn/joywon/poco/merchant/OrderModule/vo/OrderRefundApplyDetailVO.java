package cn.joywon.poco.merchant.OrderModule.vo;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 退款申请详情VO
 *
 * @author poco
 * @date 2025-12-30
 */
@Data
@Schema(description = "退款申请详情VO")
public class OrderRefundApplyDetailVO {

    @Schema(description = "退款申请ID")
    private Long id;

    @Schema(description = "订单ID")
    private Long orderId;

    @Schema(description = "订单号")
    private String orderNo;

    @Schema(description = "退款单号")
    private String refundNo;

    @Schema(description = "退款类型: FULL-全额退款, PARTIAL-部分退款")
    private String refundType;

    @Schema(description = "退款类型描述")
    private String refundTypeDesc;

    @Schema(description = "申请退款金额")
    private BigDecimal refundAmount;

    @Schema(description = "订单实付金额")
    private BigDecimal orderPaidAmount;

    @Schema(description = "退款原因")
    private String refundReason;

    @Schema(description = "状态: PENDING-待审核, APPROVED-已通过, REJECTED-已拒绝, REFUNDED-已退款")
    private String status;

    @Schema(description = "状态描述")
    private String statusDesc;

    @Schema(description = "申请人ID")
    private Long applicantId;

    @Schema(description = "申请人名称")
    private String applicantName;

    @Schema(description = "申请人手机号")
    private String applicantPhone;

    @Schema(description = "审核人ID")
    private Long reviewerId;

    @Schema(description = "审核人名称")
    private String reviewerName;

    @Schema(description = "审核备注")
    private String reviewRemark;

    @Schema(description = "审核时间")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime reviewTime;

    @Schema(description = "退款时间")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime refundTime;

    @Schema(description = "申请时间")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createdTime;

    @Schema(description = "退款商品明细")
    private List<OrderRefundItemVO> refundItems;

    @Schema(description = "订单商品列表(用于对比)")
    private List<OrderItemVO> orderItems;
}
