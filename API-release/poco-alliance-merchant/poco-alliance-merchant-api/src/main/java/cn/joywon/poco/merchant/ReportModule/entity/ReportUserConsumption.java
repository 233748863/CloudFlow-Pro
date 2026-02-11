package cn.joywon.poco.merchant.ReportModule.entity;

import com.baomidou.mybatisplus.annotation.*;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 报表-用户消费分析
 * 分析用户消费行为、复购率、消费金额分布
 *
 * @author poco
 * @date 2025-01-04
 */
@Data
@EqualsAndHashCode(callSuper = false)
@TableName("report_user_consumption")
@Schema(description = "报表-用户消费分析")
public class ReportUserConsumption {

    @TableId(value = "id", type = IdType.AUTO)
    @Schema(description = "主键ID")
    private Long id;

    @Schema(description = "统计日期")
    private LocalDate statDate;

    @Schema(description = "商家ID")
    private Long merchantId;

    @Schema(description = "门店ID")
    private Long storeId;

    @Schema(description = "新用户数")
    private Integer newUserCount;

    @Schema(description = "活跃用户数")
    private Integer activeUserCount;

    @Schema(description = "复购用户数")
    private Integer repurchaseUserCount;

    @Schema(description = "复购率(%)")
    private BigDecimal repurchaseRate;

    @Schema(description = "消费0-50元用户数")
    private Integer amount0To50;

    @Schema(description = "消费50-100元用户数")
    private Integer amount50To100;

    @Schema(description = "消费100-200元用户数")
    private Integer amount100To200;

    @Schema(description = "消费200元以上用户数")
    private Integer amount200Plus;

    @Schema(description = "平均消费周期(天)")
    private BigDecimal avgPurchaseCycle;

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
