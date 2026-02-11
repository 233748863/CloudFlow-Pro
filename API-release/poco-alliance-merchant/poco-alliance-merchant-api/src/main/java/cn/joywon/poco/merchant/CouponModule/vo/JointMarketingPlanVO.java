package cn.joywon.poco.merchant.CouponModule.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Schema(description = "联合营销计划VO")
public class JointMarketingPlanVO {

    @Schema(description = "计划ID")
    private Long id;

    @Schema(description = "计划名称")
    private String name;

    @Schema(description = "计划描述")
    private String description;

    @Schema(description = "开始时间")
    private LocalDateTime startTime;

    @Schema(description = "结束时间")
    private LocalDateTime endTime;

    @Schema(description = "发起商家ID")
    private Long initiatorMerchantId;

    @Schema(description = "发起商家名称")
    private String initiatorMerchantName;

    @Schema(description = "发起商家logo")
    private String initiatorMerchantLogo;

    @Schema(description = "计划状态")
    private String status;

    @Schema(description = "创建时间")
    private LocalDateTime createdTime;

    @Schema(description = "加入合作时间")
    private LocalDateTime jointTime;

    @Schema(description = "计划中角色: INITIATOR-发起者; PARTICIPANT-参与者")
    private String planRole;

    @Schema(description = "是否可以申请加入")
    private Boolean canJoin;

}