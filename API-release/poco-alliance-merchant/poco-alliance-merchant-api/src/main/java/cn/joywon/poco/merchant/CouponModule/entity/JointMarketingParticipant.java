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
 * 联合营销参与方表
 */
@Data
@EqualsAndHashCode(callSuper = false)
@Accessors(chain = true)
@TableName("joint_marketing_participant")
public class JointMarketingParticipant implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    /**
     * 计划ID
     */
    private Long planId;

    /**
     * 商家ID
     */
    private Long merchantId;

    /**
     * 角色: INITIATOR-发起者; PARTICIPANT-参与者
     */
    private String role;

    /**
     * 状态: PENDING-邀请中; ACCEPTED-已接受; REJECTED-已拒绝; QUIT-已退出
     */
    private String status;

    /**
     * 邀请过期时间
     */
    private LocalDateTime expiryTime;

    /**
     * 加入时间
     */
    private LocalDateTime joinTime;

    /**
     * 邀请/申请信息
     */
    private String info;

    private Long createdBy;

    private LocalDateTime createdTime;

    private Long updatedBy;

    private LocalDateTime updatedTime;

    private Integer isDeleted;

    private LocalDateTime deletedTime;
}
