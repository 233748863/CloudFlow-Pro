package cn.joywon.poco.merchant.ReportModule.entity;

import com.baomidou.mybatisplus.annotation.*;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 报表-应收账款
 * 统计待结算金额和账龄，便于财务管理和现金流预测
 *
 * @author poco
 * @date 2025-12-27
 */
@Data
@EqualsAndHashCode(callSuper = false)
@TableName("report_receivable")
@Schema(description = "报表-应收账款")
public class ReportReceivable {

    @TableId(value = "id", type = IdType.AUTO)
    @Schema(description = "主键ID")
    private Long id;

    @Schema(description = "统计日期")
    private LocalDate statDate;

    @Schema(description = "商家ID")
    private Long merchantId;

    @Schema(description = "商家名称快照")
    private String merchantName;

    @Schema(description = "待结算总金额")
    private BigDecimal totalReceivable;

    @Schema(description = "0-7天账龄金额")
    private BigDecimal aging0To7;

    @Schema(description = "8-15天账龄金额")
    private BigDecimal aging8To15;

    @Schema(description = "16-30天账龄金额")
    private BigDecimal aging16To30;

    @Schema(description = "30天以上账龄金额")
    private BigDecimal agingOver30;

    @Schema(description = "待结算订单数")
    private Integer pendingOrderCount;

    @Schema(description = "预计结算日期")
    private LocalDate expectedSettleDate;

    @Schema(description = "上期已结算金额")
    private BigDecimal lastSettledAmount;

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
