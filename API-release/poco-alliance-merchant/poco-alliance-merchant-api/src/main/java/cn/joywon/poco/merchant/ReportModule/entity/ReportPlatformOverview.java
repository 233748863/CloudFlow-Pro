package cn.joywon.poco.merchant.ReportModule.entity;

import com.baomidou.mybatisplus.annotation.*;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 报表-平台运营概览
 * 平台级汇总数据，包含GMV、订单、商家、用户等核心指标
 * 仅平台管理员可访问
 *
 * @author poco
 * @date 2025-01-04
 */
@Data
@EqualsAndHashCode(callSuper = false)
@TableName("report_platform_overview")
@Schema(description = "报表-平台运营概览")
public class ReportPlatformOverview {

    @TableId(value = "id", type = IdType.AUTO)
    @Schema(description = "主键ID")
    private Long id;

    @Schema(description = "统计日期")
    private LocalDate statDate;

    @Schema(description = "总GMV")
    private BigDecimal totalGmv;

    @Schema(description = "总订单数")
    private Integer totalOrders;

    @Schema(description = "活跃商家数")
    private Integer activeMerchants;

    @Schema(description = "活跃用户数")
    private Integer activeUsers;

    @Schema(description = "平台佣金收入")
    private BigDecimal commissionIncome;

    @Schema(description = "分润支出")
    private BigDecimal shareExpenditure;

    @Schema(description = "净收入")
    private BigDecimal netIncome;

    @Schema(description = "GMV同比(%)")
    private BigDecimal gmvYoy;

    @Schema(description = "GMV环比(%)")
    private BigDecimal gmvMom;

    @Schema(description = "订单同比(%)")
    private BigDecimal ordersYoy;

    @Schema(description = "订单环比(%)")
    private BigDecimal ordersMom;

    @TableField(value = "created_time", fill = FieldFill.INSERT)
    @Schema(description = "创建时间")
    private LocalDateTime createdTime;

    @TableField(value = "updated_time", fill = FieldFill.INSERT_UPDATE)
    @Schema(description = "修改时间")
    private LocalDateTime updatedTime;
}
