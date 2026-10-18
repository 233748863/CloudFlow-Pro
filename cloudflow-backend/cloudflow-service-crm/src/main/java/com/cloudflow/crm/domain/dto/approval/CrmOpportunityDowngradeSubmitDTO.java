package com.cloudflow.crm.domain.dto.approval;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * CRM 商机降级/关闭审批入参。
 */
@Data
@Schema(name = "CrmOpportunityDowngradeSubmitDTO", description = "CRM 商机降级/关闭审批入参")
public class CrmOpportunityDowngradeSubmitDTO {

    @Schema(description = "商机 ID")
    @NotNull(message = "商机 ID 不能为空")
    private Long opportunityId;

    @NotNull(message = "商机版本不能为空")
    @jakarta.validation.constraints.Min(0)
    private Integer version;

    @Schema(description = "动作 DOWNGRADE/CLOSE")
    @NotBlank(message = "动作不能为空")
    @Size(max = 32)
    private String action;

    @Schema(description = "目标阶段的启用编码；关闭时使用LOST")
    @Size(max = 32)
    private String targetStage;

    @Schema(description = "丢单原因")
    @Size(max = 500)
    private String lostReason;

    @jakarta.validation.Valid
    @Size(max = 20)
    private java.util.List<com.cloudflow.crm.domain.dto.CrmOpportunityLossDTO.Reason> reasons;
}
