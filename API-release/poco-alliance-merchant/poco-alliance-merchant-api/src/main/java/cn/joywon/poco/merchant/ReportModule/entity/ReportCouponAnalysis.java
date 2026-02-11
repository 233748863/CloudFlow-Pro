package cn.joywon.poco.merchant.ReportModule.entity;

import com.baomidou.mybatisplus.annotation.*;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 报表-优惠券使用分析
 * 分析优惠券发放、核销情况，评估营销活动效果
 *
 * @author poco
 * @date 2025-01-04
 */
@Data
@EqualsAndHashCode(callSuper = false)
@TableName("report_coupon_analysis")
@Schema(description = "报表-优惠券使用分析")
public class ReportCouponAnalysis {

    @TableId(value = "id", type = IdType.AUTO)
    @Schema(description = "主键ID")
    private Long id;

    @Schema(description = "统计日期")
    private LocalDate statDate;

    @Schema(description = "商家ID")
    private Long merchantId;

    @Schema(description = "门店ID")
    private Long storeId;

    @Schema(description = "优惠券类型: DISCOUNT-折扣券; AMOUNT-满减券")
    private String couponType;

    @Schema(description = "来源: SELF-自有; JOINT-联合营销")
    private String couponSource;

    @Schema(description = "发放数量")
    private Integer issuedCount;

    @Schema(description = "核销数量")
    private Integer usedCount;

    @Schema(description = "核销率(%)")
    private BigDecimal useRate;

    @Schema(description = "优惠金额")
    private BigDecimal discountAmount;

    @Schema(description = "带动销售额")
    private BigDecimal drivenSales;

    @Schema(description = "ROI(带动销售/优惠金额)")
    private BigDecimal roi;

    @TableField(value = "created_by", fill = FieldFill.INSERT)
    @Schema(description = "创建人")
    private Long createdBy;

    @TableField(value = "created_time", fill = FieldFill.INSERT)
    @Schema(description = "创建时间")
    private LocalDateTime createdTime;

    @TableField(value = "updated_by", fill = FieldFill.INSERT_UPDATE)
    @Schema(description = "修改人")
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
}
