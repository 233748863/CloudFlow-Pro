package cn.joywon.poco.merchant.ReportModule.entity;

import com.baomidou.mybatisplus.annotation.*;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 报表-支付渠道对账
 * 按支付渠道统计交易情况，便于财务对账和渠道成本分析
 *
 * @author poco
 * @date 2025-12-27
 */
@Data
@EqualsAndHashCode(callSuper = false)
@TableName("report_pay_channel_reconcile")
@Schema(description = "报表-支付渠道对账")
public class ReportPayChannelReconcile {

    @TableId(value = "id", type = IdType.AUTO)
    @Schema(description = "主键ID")
    private Long id;

    @Schema(description = "统计日期")
    private LocalDate statDate;

    @Schema(description = "商家ID")
    private Long merchantId;

    @Schema(description = "支付渠道: WECHAT_MINI-微信小程序; WECHAT_MP-微信公众号; BALANCE-余额支付")
    private String payChannel;

    @Schema(description = "交易笔数")
    private Integer transactionCount;

    @Schema(description = "交易金额")
    private BigDecimal transactionAmount;

    @Schema(description = "退款笔数")
    private Integer refundCount;

    @Schema(description = "退款金额")
    private BigDecimal refundAmount;

    @Schema(description = "净交易金额(交易-退款)")
    private BigDecimal netAmount;

    @Schema(description = "渠道手续费")
    private BigDecimal channelFee;

    @Schema(description = "手续费率")
    private BigDecimal feeRate;

    @Schema(description = "对账状态: PENDING-待对账; MATCHED-已对账; MISMATCH-差异")
    private String reconcileStatus;

    @Schema(description = "差异金额")
    private BigDecimal diffAmount;

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
