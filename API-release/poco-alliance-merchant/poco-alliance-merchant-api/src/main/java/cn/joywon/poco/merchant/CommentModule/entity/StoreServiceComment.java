package cn.joywon.poco.merchant.CommentModule.entity;

import com.baomidou.mybatisplus.annotation.*;
import cn.joywon.poco.common.core.util.TenantTable;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDateTime;

/**
 * 店铺服务评价表
 *
 * @author poco
 * @date 2025-12-03
 */
@Data
@TenantTable
@TableName("store_service_comment")
@EqualsAndHashCode(callSuper = false)
@Schema(description = "店铺服务评价表")
public class StoreServiceComment {

    /**
     * 主键ID
     */
    @TableId(value = "id", type = IdType.AUTO)
    @Schema(description = "主键ID")
    private Long id;

    /**
     * 订单ID
     */
    @TableField("order_id")
    @Schema(description = "订单ID")
    private Long orderId;

    /**
     * 商家ID (品牌/总店维度)
     */
    @TableField("merchant_id")
    @Schema(description = "商家ID")
    private Long merchantId;

    /**
     * 门店ID (履约/服务维度)
     */
    @TableField("store_id")
    @Schema(description = "门店ID")
    private Long storeId;

    /**
     * 消费者ID (对应 AppUser 表)
     */
    @TableField("app_user_id")
    @Schema(description = "消费者ID")
    private Long appUserId;

    /**
     * 物流评分 (1-5)
     */
    @TableField("delivery_star")
    @Schema(description = "物流评分")
    private Integer deliveryStar;

    /**
     * 服务态度评分 (1-5)
     */
    @TableField("service_star")
    @Schema(description = "服务态度评分")
    private Integer serviceStar;

    /**
     * 创建时间
     */
    @TableField(value = "created_time", fill = FieldFill.INSERT)
    @Schema(description = "创建时间")
    private LocalDateTime createdTime;

    /**
     * 所属租户
     */
    @Schema(description = "所属租户", hidden = true)
    private Long tenantId;
}
