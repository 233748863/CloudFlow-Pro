package com.cloudflow.crm.domain.dto.handover;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 离职交接任务转派入参。
 */
@Data
@Schema(name = "CrmHandoverReassignDTO", description = "CRM 离职交接任务转派入参")
public class CrmHandoverReassignDTO {

    @Schema(description = "新负责人 ID")
    @NotNull(message = "新负责人 ID 不能为空")
    private Long toOwnerId;

    @Schema(description = "新负责人姓名")
    @Size(max = 64)
    private String toOwnerName;

    @Schema(description = "备注")
    @Size(max = 500)
    private String remark;
}
