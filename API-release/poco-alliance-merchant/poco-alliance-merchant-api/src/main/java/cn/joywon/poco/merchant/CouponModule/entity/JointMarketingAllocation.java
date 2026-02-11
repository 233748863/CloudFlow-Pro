package cn.joywon.poco.merchant.CouponModule.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.experimental.Accessors;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 联合营销分润配置表
 */
@Data
@EqualsAndHashCode(callSuper = false)
@Accessors(chain = true)
@TableName("joint_marketing_allocations")
public class JointMarketingAllocation implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    /**
     * 关联规则ID
     */
    private Long ruleId;

    /**
     * 关联奖励ID(可选)
     */
    private Long rewardId;

    /**
     * 分润时机: COUPON_ISSUE-发券时; COUPON_VERIFY-核销时
     */
    private String triggerPhase;

    /**
     * 支付方商家ID
     */
    private Long payerMerchantId;

    /**
     * 接收方商家ID
     */
    private Long payeeMerchantId;

    /**
     * 接收方角色: MERCHANT-商家; PLATFORM-平台
     */
    private String payeeRole;

    /**
     * 分润类型: FIXED-固定金额; RATE-比例
     */
    private String allocationType;

    /**
     * 分润值
     */
    private BigDecimal allocationValue;

    /**
     * 费用说明
     */
    private String description;

    private Long createdBy;

    private LocalDateTime createdTime;

    private Long updatedBy;

    private LocalDateTime updatedTime;

    private Integer isDeleted;

    private LocalDateTime deletedTime;
}
