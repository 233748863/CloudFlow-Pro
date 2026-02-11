package cn.joywon.poco.merchant.ReportModule.entity;

import com.baomidou.mybatisplus.annotation.*;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 报表-时段销售趋势
 * 按小时统计销售数据，用于分析销售高峰和低谷时段
 *
 * @author poco
 * @date 2025-01-04
 */
@Data
@EqualsAndHashCode(callSuper = false)
@TableName("report_hourly_sales")
@Schema(description = "报表-时段销售趋势")
public class ReportHourlySales {

    @TableId(value = "id", type = IdType.AUTO)
    @Schema(description = "主键ID")
    private Long id;

    @Schema(description = "统计日期")
    private LocalDate statDate;

    @Schema(description = "商家ID")
    private Long merchantId;

    @Schema(description = "门店ID")
    private Long storeId;

    @Schema(description = "小时(0-23)")
    private Integer hourOfDay;

    @Schema(description = "订单数")
    private Integer orderCount;

    @Schema(description = "销售额")
    private BigDecimal salesAmount;

    @Schema(description = "客单价")
    private BigDecimal avgOrderValue;

    @Schema(description = "是否高峰时段")
    private Boolean isPeak;

    @Schema(description = "是否低谷时段")
    private Boolean isValley;

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
