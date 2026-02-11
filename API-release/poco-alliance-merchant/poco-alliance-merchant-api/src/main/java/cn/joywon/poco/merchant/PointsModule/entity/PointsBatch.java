package cn.joywon.poco.merchant.PointsModule.entity;

import cn.joywon.poco.merchant.PointsModule.definition.PointsEnum;
import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 积分批次表实体
 */
@Data
@TableName("points_batch")
public class PointsBatch {

    /**
     * 主键ID
     */
    @TableId(type = IdType.AUTO)
    private Long id;

    /**
     * 用户/商家ID
     */
    private Long ownerId;

    /**
     * 账号类型(USER/MERCHANT)
     */
    private PointsEnum ownerType;

    /**
     * 积分来源类型
     * ORDER_EARN-消费得; SIGN_IN_REWARD-签到; INVITE_USER-邀请用户; JOIN_ACTIVITY-活动; SYSTEM_ADJUST-系统调整; OTHERS-其他
     */
    private PointsEnum sourceType;

    /**
     * 该批次积分总数
     */
    private Integer batchPoints;

    /**
     * 该批次已使用积分数量
     */
    private Integer usedPoints;

    /**
     * 该批次剩余积分数量
     */
    private Integer remainingPoints;

    /**
     * 该批次积分最早过期时间
     */
    private LocalDateTime firstExpireDate;

    /**
     * 该批次积分详情(JSON格式)
     * 积分来源/数量/生效时间/过期时间等
     * [{
     * "date":"2025-11-21",
     * "points":5,
     * "expireDate":"2026-11-21",
     * "remaining":5
     * }]
     */
    private String batchDetail;

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