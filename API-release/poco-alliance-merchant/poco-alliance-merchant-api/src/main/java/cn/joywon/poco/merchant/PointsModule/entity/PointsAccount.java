package cn.joywon.poco.merchant.PointsModule.entity;

import cn.joywon.poco.merchant.PointsModule.definition.PointsEnum;
import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 积分账户表实体
 */
@Data
@TableName("points_account")
public class PointsAccount {

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
     * 账户类型(USER/MERCHANT)
     */
    private PointsEnum ownerType;

    /**
     * 累计获得积分
     */
    private Integer totalEarnedPoints;

    /**
     * 当前可用积分
     */
    private Integer availablePoints;

    /**
     * 当前冻结积分
     */
    private Integer frozenPoints;

    /**
     * 最近一次获得积分时间
     */
    private LocalDateTime lastGainTime;

    /**
     * 最近一次扣除积分时间
     */
    private LocalDateTime lastDeductTime;

    /**
     * 积分账户是否启用
     */
    @TableField("is_enable")
    private Boolean enable;

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