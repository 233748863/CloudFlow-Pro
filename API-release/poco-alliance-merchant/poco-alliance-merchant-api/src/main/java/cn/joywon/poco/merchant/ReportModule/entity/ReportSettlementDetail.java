package cn.joywon.poco.merchant.ReportModule.entity;

import com.baomidou.mybatisplus.annotation.*;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 报表-商家结算资金明细
 *
 * @author poco
 * @date 2025-12-25
 */
@Data
@EqualsAndHashCode(callSuper = false)
@TableName("report_settlement_detail")
@Schema(description = "报表-商家结算资金明细")
public class ReportSettlementDetail {

    @TableId(value = "id", type = IdType.AUTO)
    @Schema(description = "主键ID")
    private Long id;

    @Schema(description = "归属日期")
    private LocalDate statDate;

    @Schema(description = "商家ID")
    private Long merchantId;

    @Schema(description = "业务类型: ORDER-订单收款; REFUND-订单退款; MARKETING_INCOME-分润收入; MARKETING_PAY-分润支出")
    private String bizType;

    @Schema(description = "业务单号(订单号/流水号)")
    private String bizNo;

    @Schema(description = "关联ID(如order_id/record_id)")
    private Long relatedId;

    @Schema(description = "交易金额(正负表示方向)")
    private BigDecimal tradeAmount;

    @Schema(description = "费率(如0.006)")
    private BigDecimal commissionRate;

    @Schema(description = "手续费/佣金")
    private BigDecimal commissionAmount;

    @Schema(description = "结算入账金额(交易金额-佣金)")
    private BigDecimal settleAmount;

    @Schema(description = "摘要/备注")
    private String remark;

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
