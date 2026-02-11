package cn.joywon.poco.merchant.CouponModule.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.experimental.Accessors;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 联合营销奖励表
 */
@Data
@EqualsAndHashCode(callSuper = false)
@Accessors(chain = true)
@TableName("joint_marketing_rewards")
public class JointMarketingReward implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    /**
     * 关联规则ID
     */
    private Long ruleId;

    /**
     * 券提供方商家ID
     */
    private Long providerMerchantId;

    /**
     * 奖励类型: COUPON-优惠券
     */
    private String rewardType;

    /**
     * 奖励内容ID(如优惠券模板ID)
     */
    private Long rewardContentId;

    /**
     * 发放数量
     */
    private Integer rewardQuantity;

    /**
     * 奖励库存限制(-1不限)
     */
    private Integer stockLimit;

    /**
     * 已发放数量
     */
    private Integer issuedCount;

    private Long createdBy;

    private LocalDateTime createdTime;

    private Long updatedBy;

    private LocalDateTime updatedTime;

    private Integer isDeleted;

    private LocalDateTime deletedTime;
}
