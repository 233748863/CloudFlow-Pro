package cn.joywon.poco.merchant.ReportModule.entity;

import com.baomidou.mybatisplus.annotation.*;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 报表-积分流水
 * 统计积分发放、消耗、过期情况，分析积分成本
 *
 * @author poco
 * @date 2025-01-04
 */
@Data
@EqualsAndHashCode(callSuper = false)
@TableName("report_points_flow")
@Schema(description = "报表-积分流水")
public class ReportPointsFlow {

    @TableId(value = "id", type = IdType.AUTO)
    @Schema(description = "主键ID")
    private Long id;

    @Schema(description = "统计日期")
    private LocalDate statDate;

    @Schema(description = "商家ID")
    private Long merchantId;

    @Schema(description = "门店ID")
    private Long storeId;

    @Schema(description = "来源类型: CONSUME-消费得; SIGN_IN-签到; ACTIVITY-活动; ADJUST-系统调整")
    private String sourceType;

    @Schema(description = "发放积分")
    private Long earnedPoints;

    @Schema(description = "消耗积分")
    private Long consumedPoints;

    @Schema(description = "过期积分")
    private Long expiredPoints;

    @Schema(description = "净增积分")
    private Long netPoints;

    @Schema(description = "积分抵扣金额")
    private BigDecimal deductionAmount;

    @Schema(description = "等效成本")
    private BigDecimal equivalentCost;

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
