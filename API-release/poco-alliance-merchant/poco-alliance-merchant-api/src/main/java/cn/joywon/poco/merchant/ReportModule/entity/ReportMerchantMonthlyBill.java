package cn.joywon.poco.merchant.ReportModule.entity;

import com.baomidou.mybatisplus.annotation.*;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 报表-商家月度账单
 *
 * @author poco
 * @date 2025-12-25
 */
@Data
@EqualsAndHashCode(callSuper = false)
@TableName("report_merchant_monthly_bill")
@Schema(description = "报表-商家月度账单")
public class ReportMerchantMonthlyBill {

    @TableId(value = "id", type = IdType.AUTO)
    @Schema(description = "主键ID")
    private Long id;

    @Schema(description = "统计月份(YYYY-MM)")
    private String statMonth;

    @Schema(description = "商家ID")
    private Long merchantId;

    @Schema(description = "商家名称快照")
    private String merchantName;

    @Schema(description = "本月总收入")
    private BigDecimal totalIncome;

    @Schema(description = "本月总支出(退款+佣金+营销)")
    private BigDecimal totalExpenditure;

    @Schema(description = "本月应结净额")
    private BigDecimal finalSettleAmount;

    @Schema(description = "月结状态")
    private String settleStatus;

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
