package cn.joywon.poco.merchant.CouponModule.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Schema(description = "联合营销计划邀请记录返回数据")
public class JointMarketingInviteRecordVO {

    @Schema(description = "联合营销计划ID")
    private Long planId;

    @Schema(description = "联合营销计划名称")
    private String planName;

    @Schema(description = "联合营销计划状态")
    private String planStatus;

    @Schema(description = "联合营销计划开始时间")
    private LocalDateTime planStartTime;

    @Schema(description = "联合营销计划结束时间")
    private LocalDateTime planEndTime;

    @Schema(description = "邀请记录ID")
    private Long participantId;

    @Schema(description = "邀请记录状态")
    private String participantStatus;

    @Schema(description = "邀请记录失效时间")
    private LocalDateTime participantExpiryTime;

    @Schema(description = "接收邀请加入联合营销时间")
    private LocalDateTime participantJoinTime;

    @Schema(description = "收到邀请时间")
    private LocalDateTime inviteTime;

    @Schema(description = "发送邀请的商家ID")
    private String merchantId;

    @Schema(description = "发送邀请的商家名称")
    private String merchantName;

}