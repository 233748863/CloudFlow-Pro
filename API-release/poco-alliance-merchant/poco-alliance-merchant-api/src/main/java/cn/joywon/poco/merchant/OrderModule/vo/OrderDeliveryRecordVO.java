package cn.joywon.poco.merchant.OrderModule.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Schema(description = "订单配送记录VO")
public class OrderDeliveryRecordVO {

    @Schema(description = "配送记录ID")
    private Long id;

    @Schema(description = "配送渠道")
    private String channel;

    @Schema(description = "服务商编码/名称")
    private String provider;

    @Schema(description = "运单号/配送单号")
    private String trackingNo;

    @Schema(description = "配送状态：CREATED-待配送创建，ASSIGNED-已分配，PICKED-已取件，DELIVERING-配送中，DELIVERED-已送达，FAILED-配送失败，CANCELLED-已取消")
    private String status;

    @Schema(description = "配送状态描述")
    private String statusDesc;

    @Schema(description = "配送员姓名")
    private String deliveryPersonName;

    @Schema(description = "配送员联系方式")
    private String deliveryPersonPhone;

    @Schema(description = "预计取件时间")
    private LocalDateTime estimatePickTime;

    @Schema(description = "预计送达时间")
    private LocalDateTime estimateArrivalTime;

    @Schema(description = "实际取件时间")
    private LocalDateTime actualPickTime;

    @Schema(description = "送达完成时间")
    private LocalDateTime deliveredTime;

    @Schema(description = "备注")
    private String remark;
}