package cn.joywon.poco.merchant.ReportModule.entity;

import com.baomidou.mybatisplus.annotation.*;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 报表-退款分析
 * 分析退款原因、退款率，帮助商家优化服务和商品质量
 *
 * @author poco
 * @date 2025-12-27
 */
@Data
@EqualsAndHashCode(callSuper = false)
@TableName("report_refund_analysis")
@Schema(description = "报表-退款分析")
public class ReportRefundAnalysis {

    @TableId(value = "id", type = IdType.AUTO)
    @Schema(description = "主键ID")
    private Long id;

    @Schema(description = "统计日期")
    private LocalDate statDate;

    @Schema(description = "商家ID")
    private Long merchantId;

    @Schema(description = "门店ID")
    private Long storeId;

    @Schema(description = "退款订单数")
    private Integer refundOrderCount;

    @Schema(description = "退款金额")
    private BigDecimal refundAmount;

    @Schema(description = "退款率(百分比)")
    private BigDecimal refundRate;

    @Schema(description = "用户主动取消数")
    private Integer userCancelCount;

    @Schema(description = "商家取消数")
    private Integer merchantCancelCount;

    @Schema(description = "超时自动取消数")
    private Integer timeoutCancelCount;

    @Schema(description = "售后退款数")
    private Integer afterSaleRefundCount;

    @Schema(description = "平均退款处理时长(小时)")
    private BigDecimal avgRefundHours;

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
