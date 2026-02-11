package cn.joywon.poco.merchant.CouponModule.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@TableName("joint_marketing_rebate_record")
@Schema(description = "联合营销返利记录")
public class JointMarketingRebateRecord {

    @TableId(type = IdType.ASSIGN_ID)
    @Schema(description = "ID")
    private Long id;

    @Schema(description = "计划ID")
    private Long planId;

    @Schema(description = "规则ID")
    private Long ruleId;

    @Schema(description = "分润配置ID")
    private Long allocationId;

    @Schema(description = "优惠券ID")
    private Long couponId;

    @Schema(description = "触发订单ID")
    private Long triggerOrderId;

    @Schema(description = "付款方商家ID")
    private Long payerMerchantId;

    @Schema(description = "收款方商家ID")
    private Long payeeMerchantId;

    @Schema(description = "收款方角色")
    private String payeeRole;

    @Schema(description = "返利金额")
    private BigDecimal amount;

    @Schema(description = "状态: WAITING_VERIFY-待核销, PENDING_SETTLEMENT-待结算, SETTLED-已结算, CANCELLED-已取消")
    private String status;

    @Schema(description = "结算时间")
    private LocalDateTime settledTime;

    @Schema(description = "创建时间")
    private LocalDateTime createdTime;

    @Schema(description = "更新时间")
    private LocalDateTime updatedTime;

    @Schema(description = "失败原因")
    private String failureReason;

    @Schema(description = "重试次数")
    private Integer retryCount;
}
