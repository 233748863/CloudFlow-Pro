package cn.joywon.poco.merchant.CouponModule.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("joint_marketing_plan")
public class JointMarketingPlan {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String name;

    private String description;

    private LocalDateTime startTime;

    private LocalDateTime endTime;

    private Long initiatorMerchantId;

    private String status;

    private String auditStatus;

    private String auditReason;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedTime;

    @TableLogic
    private Integer isDeleted;
}
