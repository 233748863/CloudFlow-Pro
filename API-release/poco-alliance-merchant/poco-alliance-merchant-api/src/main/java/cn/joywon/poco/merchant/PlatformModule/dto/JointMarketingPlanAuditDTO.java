package cn.joywon.poco.merchant.PlatformModule.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
@Schema(description = "联合营销计划审核参数")
public class JointMarketingPlanAuditDTO {

    @NotBlank(message = "联合营销计划ID不能为空")
    @Schema(description = "联合营销计划ID")
    private String planId;

    @NotNull(message = "是否审核通过不能为空")
    @Schema(description = "是否审核通过")
    private Boolean approve;

    @Schema(description = "审核处理原因")
    private String reason;

}