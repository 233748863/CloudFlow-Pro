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

    @Schema(description = "动作 DOWNGRADE/CLOSE_LOST")
    @NotBlank(message = "动作不能为空")
    @Size(max = 32)
    private String action;

    @Schema(description = "目标阶段 PROSPECT/QUALIFY/PROPOSAL/CLOSED_WON/CLOSED_LOST")
    @Size(max = 32)
    private String targetStage;

    @Schema(description = "丢单原因")
    @Size(max = 500)
    private String lostReason;
}
