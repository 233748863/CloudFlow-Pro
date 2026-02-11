package cn.joywon.poco.merchant.CouponModule.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.experimental.Accessors;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.Map;

/**
 * 联合营销执行记录表
 */
@Data
@EqualsAndHashCode(callSuper = false)
@Accessors(chain = true)
@TableName(value = "joint_marketing_logs", autoResultMap = true)
public class JointMarketingLog implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    private Long planId;

    private Long ruleId;

    /**
     * 触发订单ID
     */
    private Long triggerOrderId;

    private Long consumerUserId;

    /**
     * 发放的优惠券信息快照
     */
    @TableField(typeHandler = JacksonTypeHandler.class)
    private Map<String, Object> rewardsIssued;

    /**
     * 预计分润规则快照
     */
    @TableField(typeHandler = JacksonTypeHandler.class)
    private Map<String, Object> allocationsSnapshot;

    private LocalDateTime createdTime;
}
