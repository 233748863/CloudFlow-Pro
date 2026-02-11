package cn.joywon.poco.merchant.OrderModule.entity;

import com.baomidou.mybatisplus.annotation.*;
import cn.joywon.poco.common.core.util.TenantTable;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 订单地址快照实体（本地配送）
 */
@Data
@EqualsAndHashCode(callSuper = false)
@TenantTable
@TableName("order_address_snapshots")
@Schema(description = "订单地址快照表")
public class OrderAddressSnapshot {

    @TableId(value = "id", type = IdType.AUTO)
    @Schema(description = "主键ID")
    private Long id;

    @TableField("order_id")
    @Schema(description = "订单ID")
    private Long orderId;

    @TableField("user_id")
    @Schema(description = "用户ID")
    private Long userId;

    @TableField("merchant_id")
    @Schema(description = "商家ID")
    private Long merchantId;

    @TableField("store_id")
    @Schema(description = "门店ID")
    private Long storeId;

    @TableField("receiver_name")
    @Schema(description = "收货人姓名")
    private String receiverName;

    @TableField("receiver_phone")
    @Schema(description = "收货人手机号")
    private String receiverPhone;

    @TableField("province")
    @Schema(description = "省")
    private String province;

    @TableField("city")
    @Schema(description = "市")
    private String city;

    @TableField("district")
    @Schema(description = "区/县")
    private String district;

    @TableField("detail_address")
    @Schema(description = "详细地址")
    private String detailAddress;

    @TableField("latitude")
    @Schema(description = "纬度")
    private BigDecimal latitude;

    @TableField("longitude")
    @Schema(description = "经度")
    private BigDecimal longitude;

    @TableField("address_type")
    @Schema(description = "地址类型: RECEIVER(收货地址)")
    private String addressType;

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