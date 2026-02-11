package cn.joywon.poco.merchant.OrderModule.entity;

import com.baomidou.mybatisplus.annotation.*;
import cn.joywon.poco.common.core.util.TenantTable;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDateTime;

/**
 * 订单配送记录实体（本地/同城配送）
 */
@Data
@EqualsAndHashCode(callSuper = false)
@TenantTable
@TableName("order_delivery_records")
@Schema(description = "订单配送记录表")
public class OrderDeliveryRecord {

    @TableId(value = "id", type = IdType.AUTO)
    @Schema(description = "主键ID")
    private Long id;

    @TableField("order_id")
    @Schema(description = "订单ID")
    private Long orderId;

    @TableField("address_snapshot_id")
    @Schema(description = "地址快照ID")
    private Long addressSnapshotId;

    @TableField("channel")
    @Schema(description = "配送渠道: LOCAL/THIRD_PARTY")
    private String channel;

    @TableField("provider")
    @Schema(description = "第三方服务商编码/名称")
    private String provider;

    @TableField("tracking_no")
    @Schema(description = "运单号/配送单号")
    private String trackingNo;

    @TableField("status")
    @Schema(description = "配送状态")
    private String status;

    @TableField("delivery_person_name")
    @Schema(description = "配送员姓名")
    private String deliveryPersonName;

    @TableField("delivery_person_phone")
    @Schema(description = "配送员联系方式")
    private String deliveryPersonPhone;

    @TableField("estimate_pick_time")
    @Schema(description = "预计取件时间")
    private LocalDateTime estimatePickTime;

    @TableField("estimate_arrival_time")
    @Schema(description = "预计送达时间")
    private LocalDateTime estimateArrivalTime;

    @TableField("actual_pick_time")
    @Schema(description = "实际取件时间")
    private LocalDateTime actualPickTime;

    @TableField("delivered_time")
    @Schema(description = "送达完成时间")
    private LocalDateTime deliveredTime;

    @TableField("fail_reason")
    @Schema(description = "失败原因")
    private String failReason;

    @TableField("cancel_reason")
    @Schema(description = "取消原因")
    private String cancelReason;

    @TableField("remark")
    @Schema(description = "备注")
    private String remark;

    @TableField(value = "created_by", fill = FieldFill.INSERT)
    @Schema(description = "创建人ID")
    private Long createdBy;

    @TableField(value = "created_time", fill = FieldFill.INSERT)
    @Schema(description = "创建时间")
    private LocalDateTime createdTime;

    @TableField(value = "updated_by", fill = FieldFill.INSERT_UPDATE)
    @Schema(description = "修改人ID")
    private Long updatedBy;

    @TableField(value = "updated_time", fill = FieldFill.INSERT_UPDATE)
    @Schema(description = "修改时间")
    private LocalDateTime updatedTime;

    @TableLogic
    @TableField("is_deleted")
    @Schema(description = "是否已删除")
    private Integer isDeleted;

    @TableField("deleted_time")
    @Schema(description = "删除时间")
    private LocalDateTime deletedTime;

    /**
     * 所属租户
     */
    @Schema(description = "所属租户", hidden = true)
    private Long tenantId;
}