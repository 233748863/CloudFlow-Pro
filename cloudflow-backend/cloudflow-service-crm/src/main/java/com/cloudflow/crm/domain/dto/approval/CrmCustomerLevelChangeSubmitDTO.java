package com.cloudflow.crm.domain.dto.approval;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * CRM 客户分级变更审批入参。
 */
@Data
@Schema(name = "CrmCustomerLevelChangeSubmitDTO", description = "CRM 客户分级变更审批入参")
public class CrmCustomerLevelChangeSubmitDTO {

    @Schema(description = "客户 ID")
    @NotNull(message = "客户 ID 不能为空")
    private Long customerId;

    @Schema(description = "动作 UPGRADE/DOWNGRADE")
    @NotBlank(message = "动作不能为空")
    @Size(max = 32)
    private String action;

    @Schema(description = "目标分级 A/B/C/D")
    @Size(max = 16)
    private String targetLevel;

    @Schema(description = "备注")
    @Size(max = 500)
    private String remark;
}
