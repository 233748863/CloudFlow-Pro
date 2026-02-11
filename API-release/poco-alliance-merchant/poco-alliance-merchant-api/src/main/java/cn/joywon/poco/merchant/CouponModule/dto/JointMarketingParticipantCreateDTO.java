package cn.joywon.poco.merchant.CouponModule.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.io.Serializable;

@Data
@Schema(description = "邀请联合营销参与者DTO")
public class JointMarketingParticipantCreateDTO implements Serializable {
    
    @Schema(description = "计划ID")
    @NotNull(message = "计划ID不能为空")
    private Long planId;

    @Schema(description = "商家ID")
    @NotNull(message = "商家ID不能为空")
    private Long merchantId;

    @Schema(description = "邀请信息")
    @Size(max = 50, message = "邀请信息请在50个字以内")
    private String info;

}