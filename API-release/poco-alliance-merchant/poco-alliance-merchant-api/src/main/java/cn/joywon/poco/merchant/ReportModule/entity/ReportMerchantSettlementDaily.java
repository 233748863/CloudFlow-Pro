package cn.joywon.poco.merchant.ReportModule.entity;

import com.baomidou.mybatisplus.annotation.*;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 报表-商家每日结算单
 *
 * @author poco
 * @date 2025-12-25
 */
@Data
@EqualsAndHashCode(callSuper = false)
@TableName("report_merchant_settlement_daily")
@Schema(description = "报表-商家每日结算单")
public class ReportMerchantSettlementDaily {

    @TableId(value = "id", type = IdType.AUTO)
    @Schema(description = "主键ID")
    private Long id;

    @Schema(description = "统计日期")
    private LocalDate statDate;

    @Schema(description = "商家ID")
    private Long merchantId;

    @Schema(description = "商家名称快照")
    private String merchantName;

    @Schema(description = "总营业额")
    private BigDecimal totalTurnover;

    @Schema(description = "微信支付金额")
    private BigDecimal wechatPayAmount;

    @Schema(description = "余额支付金额")
    private BigDecimal balancePayAmount;

    @Schema(description = "营销分润收入")
    private BigDecimal marketingIncome;

    @Schema(description = "退款金额")
    private BigDecimal refundAmount;

    @Schema(description = "平台抽成/手续费")
    private BigDecimal platformCommission;

    @Schema(description = "营销分润支出")
    private BigDecimal marketingExpenditure;

    @Schema(description = "应结基数")
    private BigDecimal settleBaseAmount;

    @Schema(description = "实结金额")
    private BigDecimal realSettleAmount;

    @Schema(description = "结算状态: UNSETTLED-未结算, SETTLED-已结算")
    private String settleStatus;

    @Schema(description = "结算时间")
    private LocalDateTime settledTime;

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
