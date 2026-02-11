package cn.joywon.poco.merchant.MerchantModule.dto;

import cn.joywon.poco.merchant.MerchantModule.definition.AuditStatusEnum;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

@Data
@Schema(description = "门店审核参数")
public class AuditResultDTO {

    @NotNull(message = "审核记录ID不能为空")
    @Schema(description = "审核记录ID")
    private Long auditId;

    @NotBlank(message = "审核结果不能为空")
    @Pattern(regexp = AuditStatusEnum.AUDIT_RESULT_REGEX_PATTERN, message = "无效的审核结果")
    @Schema(description = "审核结果: APPROVED-通过; REJECTED-拒绝")
    private String auditResult;

    @Schema(description = "审核备注")
    private String auditRemark;

}