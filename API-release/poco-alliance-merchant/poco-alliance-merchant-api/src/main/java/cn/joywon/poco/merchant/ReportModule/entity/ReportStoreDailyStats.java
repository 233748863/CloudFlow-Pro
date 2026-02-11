package cn.joywon.poco.merchant.ReportModule.entity;

import com.baomidou.mybatisplus.annotation.*;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 报表-门店经营日报
 *
 * @author poco
 * @date 2025-12-25
 */
@Data
@TableName("report_store_daily_stats")
@EqualsAndHashCode(callSuper = false)
@Schema(description = "报表-门店经营日报")
public class ReportStoreDailyStats {

    @TableId(value = "id", type = IdType.AUTO)
    @Schema(description = "主键ID")
    private Long id;

    @Schema(description = "统计日期")
    private LocalDate statDate;

    @Schema(description = "商家ID")
    private Long merchantId;

    @Schema(description = "门店ID")
    private Long storeId;

    @Schema(description = "门店名称快照")
    private String storeName;

    @Schema(description = "总订单数(下单)")
    private Integer totalOrderCount;

    @Schema(description = "支付订单数")
    private Integer paidOrderCount;

    @Schema(description = "总交易额(GMV)")
    private BigDecimal totalSalesAmount;

    @Schema(description = "实付金额")
    private BigDecimal realPayAmount;

    @Schema(description = "退款订单数")
    private Integer refundOrderCount;

    @Schema(description = "退款金额")
    private BigDecimal refundAmount;

    @Schema(description = "访客数(UV)")
    private Integer visitorCount;

    @Schema(description = "浏览量(PV)")
    private Integer pageViewCount;

    @Schema(description = "客单价")
    private BigDecimal avgOrderValue;

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
