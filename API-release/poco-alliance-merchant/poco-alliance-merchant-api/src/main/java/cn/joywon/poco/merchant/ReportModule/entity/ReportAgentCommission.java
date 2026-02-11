package cn.joywon.poco.merchant.ReportModule.entity;

import com.baomidou.mybatisplus.annotation.*;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 报表-区域代理佣金
 * 统计代理佣金、结算、提现情况，用于代理绩效管理
 * 仅平台管理员可访问
 *
 * @author poco
 * @date 2025-01-04
 */
@Data
@EqualsAndHashCode(callSuper = false)
@TableName("report_agent_commission")
@Schema(description = "报表-区域代理佣金")
public class ReportAgentCommission {

    @TableId(value = "id", type = IdType.AUTO)
    @Schema(description = "主键ID")
    private Long id;

    @Schema(description = "统计日期")
    private LocalDate statDate;

    @Schema(description = "代理ID")
    private Long agentId;

    @Schema(description = "代理名称")
    private String agentName;

    @Schema(description = "区域编码")
    private String regionCode;

    @Schema(description = "区域名称")
    private String regionName;

    @Schema(description = "佣金总额")
    private BigDecimal totalCommission;

    @Schema(description = "已结算金额")
    private BigDecimal settledAmount;

    @Schema(description = "待结算金额")
    private BigDecimal pendingAmount;

    @Schema(description = "已提现金额")
    private BigDecimal withdrawnAmount;

    @Schema(description = "订单数量")
    private Integer orderCount;

    @Schema(description = "商家数量")
    private Integer merchantCount;

    @Schema(description = "佣金排名")
    private Integer rankByCommission;

    @Schema(description = "订单排名")
    private Integer rankByOrders;

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
