package cn.joywon.poco.merchant.ReportModule.entity;

import com.baomidou.mybatisplus.annotation.*;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 报表-商品销售日报
 *
 * @author poco
 * @date 2025-12-25
 */
@Data
@EqualsAndHashCode(callSuper = false)
@TableName("report_goods_sales_daily")
@Schema(description = "报表-商品销售日报")
public class ReportGoodsSalesDaily {

    @TableId(value = "id", type = IdType.AUTO)
    @Schema(description = "主键ID")
    private Long id;

    @Schema(description = "统计日期")
    private LocalDate statDate;

    @Schema(description = "商家ID")
    private Long merchantId;

    @Schema(description = "门店ID")
    private Long storeId;

    @Schema(description = "商品SKU ID")
    private Long skuId;

    @Schema(description = "商品名称快照")
    private String productName;

    @Schema(description = "规格名称快照")
    private String skuSpec;

    @Schema(description = "销售数量")
    private Integer salesCount;

    @Schema(description = "销售金额")
    private BigDecimal salesAmount;

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
