package cn.joywon.poco.merchant.ReportModule.entity;

import com.baomidou.mybatisplus.annotation.*;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 报表-商品分类销售汇总
 * 按分类维度统计销售情况，便于品类分析和选品决策
 *
 * @author poco
 * @date 2025-12-27
 */
@Data
@EqualsAndHashCode(callSuper = false)
@TableName("report_category_sales_summary")
@Schema(description = "报表-商品分类销售汇总")
public class ReportCategorySalesSummary {

    @TableId(value = "id", type = IdType.AUTO)
    @Schema(description = "主键ID")
    private Long id;

    @Schema(description = "统计日期")
    private LocalDate statDate;

    @Schema(description = "商家ID")
    private Long merchantId;

    @Schema(description = "门店ID")
    private Long storeId;

    @Schema(description = "商品分类ID")
    private Long categoryId;

    @Schema(description = "分类名称快照")
    private String categoryName;

    @Schema(description = "销售数量")
    private Integer salesCount;

    @Schema(description = "销售金额")
    private BigDecimal salesAmount;

    @Schema(description = "销售占比(百分比)")
    private BigDecimal salesRatio;

    @Schema(description = "订单数")
    private Integer orderCount;

    @Schema(description = "SKU数量(该分类下有销售的SKU数)")
    private Integer skuCount;

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
