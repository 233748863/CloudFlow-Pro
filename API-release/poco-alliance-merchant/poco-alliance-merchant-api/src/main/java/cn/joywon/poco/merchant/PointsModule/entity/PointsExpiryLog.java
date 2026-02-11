package cn.joywon.poco.merchant.PointsModule.entity;

import cn.joywon.poco.merchant.PointsModule.definition.PointsEnum;
import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 积分过期日志表实体
 */
@Data
@TableName("point_expiry_logs")
public class PointsExpiryLog {

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
     * 积分来源ID
     */
    private Long sourceId;

    /**
     * 积分批次ID
     */
    private Long batchId;

    /**
     * 过期积分数量
     */
    private Integer expiryPoints;

    /**
     * 过期日期
     */
    private LocalDate expiryDate;

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