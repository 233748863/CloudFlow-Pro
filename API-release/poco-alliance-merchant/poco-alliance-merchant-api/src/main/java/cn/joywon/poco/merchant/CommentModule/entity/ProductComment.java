package cn.joywon.poco.merchant.CommentModule.entity;

import com.baomidou.mybatisplus.annotation.*;
import cn.joywon.poco.common.core.util.TenantTable;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDateTime;

/**
 * 商品评价表
 *
 * @author poco
 * @date 2025-12-03
 */
@Data
@TenantTable
@TableName("product_comment")
@EqualsAndHashCode(callSuper = false)
@Schema(description = "商品评价表")
public class ProductComment {

    /**
     * 主键ID
     */
    @TableId(value = "id", type = IdType.AUTO)
    @Schema(description = "主键ID")
    private Long id;

    /**
     * 消费者ID (对应 AppUser 表)
     */
    @TableField("app_user_id")
    @Schema(description = "消费者ID")
    private Long appUserId;

    /**
     * 用户昵称 (冗余)
     */
    @TableField("user_nick_name")
    @Schema(description = "用户昵称")
    private String userNickName;

    /**
     * 用户头像 (冗余)
     */
    @TableField("user_avatar")
    @Schema(description = "用户头像")
    private String userAvatar;

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
     * 订单ID
     */
    @TableField("order_id")
    @Schema(description = "订单ID")
    private Long orderId;

    /**
     * 订单项ID
     */
    @TableField("order_item_id")
    @Schema(description = "订单项ID")
    private Long orderItemId;

    /**
     * 商品ID
     */
    @TableField("product_id")
    @Schema(description = "商品ID")
    private Long productId;

    /**
     * 商品名称 (冗余)
     */
    @TableField("product_name")
    @Schema(description = "商品名称")
    private String productName;

    /**
     * SKU ID
     */
    @TableField("sku_id")
    @Schema(description = "SKU ID")
    private Long skuId;

    /**
     * 规格描述
     */
    @TableField("sku_spec")
    @Schema(description = "规格描述")
    private String skuSpec;

    /**
     * 商品评分 (1-5星)
     */
    @TableField("star")
    @Schema(description = "商品评分")
    private Integer star;

    /**
     * 评价内容
     */
    @TableField("content")
    @Schema(description = "评价内容")
    private String content;

    /**
     * 评价图片 (JSON数组)
     */
    @TableField("images")
    @Schema(description = "评价图片")
    private String images;

    /**
     * 是否匿名 (0-否 1-是)
     */
    @TableField("is_anonymous")
    @Schema(description = "是否匿名")
    private Integer isAnonymous;

    /**
     * 是否显示 (1-显示 0-隐藏)
     */
    @TableField("is_show")
    @Schema(description = "是否显示")
    private Integer isShow;

    /**
     * 商家回复内容
     */
    @TableField("reply_content")
    @Schema(description = "商家回复内容")
    private String replyContent;

    /**
     * 商家回复时间
     */
    @TableField("reply_time")
    @Schema(description = "商家回复时间")
    private LocalDateTime replyTime;

    /**
     * 回复人ID (对应 User 表)
     */
    @TableField("reply_user_id")
    @Schema(description = "回复人ID")
    private Long replyUserId;

    /**
     * 创建时间
     */
    @TableField(value = "created_time", fill = FieldFill.INSERT)
    @Schema(description = "创建时间")
    private LocalDateTime createdTime;

    /**
     * 创建人
     */
    @TableField(value = "created_by", fill = FieldFill.INSERT)
    @Schema(description = "创建人")
    private Long createdBy;

    /**
     * 修改时间
     */
    @TableField(value = "updated_time", fill = FieldFill.INSERT_UPDATE)
    @Schema(description = "修改时间")
    private LocalDateTime updatedTime;

    /**
     * 修改人
     */
    @TableField(value = "updated_by", fill = FieldFill.INSERT_UPDATE)
    @Schema(description = "修改人")
    private Long updatedBy;

    /**
     * 是否删除
     */
    @TableLogic
    @TableField(value = "is_deleted", fill = FieldFill.INSERT)
    @Schema(description = "是否删除")
    private Integer isDeleted;

    /**
     * 删除时间
     */
    @TableField("deleted_time")
    @Schema(description = "删除时间")
    private LocalDateTime deletedTime;

    /**
     * 所属租户
     */
    @Schema(description = "所属租户", hidden = true)
    private Long tenantId;
}
