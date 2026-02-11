package cn.joywon.poco.merchant.PointsModule.entity;

import cn.joywon.poco.merchant.PointsModule.definition.PointsEnum;
import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 积分变动表实体
 */
@Data
@TableName("points_flow")
public class PointsFlow {

    /**
     * 变动记录ID
     */
    @TableId(type = IdType.AUTO)
    private Long id;

    /**
     * 关联的批次ID
     */
    private Long batchId;

    /**
     * 用户/商家ID
     */
    private Long ownerId;

    /**
     * 变动账号类型
     * MERCHANT-平台商家; USER-平台用户
     */
    private PointsEnum ownerType;

    /**
     * 积分变动数量
     */
    private Integer changePoints;

    /**
     * 积分变动类型
     * ORDER_EARN-消费得; ORDER_SPEND-下单抵扣; MALL_REDEEM-商城兑换; SIGN_IN_REWARD-签到; SYSTEM_ADJUST-系统调整; EXPIRED_DEDUCT-过期扣除
     */
    private PointsEnum changeType;

    /**
     * 关联业务ID
     */
    private Long bizId;

    /**
     * 批次中获得积分日期
     */
    private LocalDate batchGainDate;

    /**
     * 变动备注
     */
    private String remark;

    /**
     * 创建人ID
     */
    @TableField(fill = FieldFill.INSERT)
    private Long createdBy;

    /**
     * 创建时间
     */
    private LocalDateTime createdTime;

    /**
     * 修改人ID
     */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private Long updatedBy;

    /**
     * 修改时间
     */
    private LocalDateTime updatedTime;

    /**
     * 删除标识
     */
    @TableField("is_deleted")
    @TableLogic(value = "true", delval = "true")
    private Boolean deleted;

    /**
     * 删除时间
     */
    private LocalDateTime deletedTime;

}