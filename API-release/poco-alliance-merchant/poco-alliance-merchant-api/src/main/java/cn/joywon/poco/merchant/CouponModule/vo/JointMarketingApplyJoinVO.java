package cn.joywon.poco.merchant.CouponModule.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

@Data
public class JointMarketingApplyJoinVO {

    @Schema(description = "参与记录ID")
    private Long participantId;

    @Schema(description = "申请状态")
    private String status;

    @Schema(description = "申请时间")
    private LocalDateTime applyTime;

    @Schema(description = "邀请/申请信息")
    private String info;

    @Schema(description = "商家ID")
    private Long merchantId;

    @Schema(description = "商家名称")
    private String merchantName;

    @Schema(description = "商家logo")
    private String merchantLogo;

}