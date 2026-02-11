package cn.joywon.poco.merchant.ReportModule.entity;

import com.baomidou.mybatisplus.annotation.*;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 报表-联合营销效果
 * 统计联合营销活动的触发、发券、核销、分润情况
 *
 * @author poco
 * @date 2025-01-04
 */
@Data
@EqualsAndHashCode(callSuper = false)
@TableName("report_joint_marketing")
@Schema(description = "报表-联合营销效果")
public class ReportJointMarketing {

    @TableId(value = "id", type = IdType.AUTO)
    @Schema(description = "主键ID")
    private Long id;

    @Schema(description = "统计日期")
    private LocalDate statDate;

    @Schema(description = "商家ID")
    private Long merchantId;

    @Schema(description = "角色: INITIATOR-发起方; PARTICIPANT-参与方")
    private String roleType;

    @Schema(description = "活动触发次数")
    private Integer triggerCount;

    @Schema(description = "发券数量")
    private Integer couponIssued;

    @Schema(description = "核销数量")
    private Integer couponUsed;

    @Schema(description = "分润金额")
    private BigDecimal shareAmount;

    @Schema(description = "新客户数(引流)")
    private Integer newCustomerCount;

    @Schema(description = "跨商家订单数")
    private Integer crossMerchantOrders;

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
