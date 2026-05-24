package com.cloudflow.crm.domain.dto.handover;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 离职交接任务关闭入参。
 */
@Data
@Schema(name = "CrmHandoverCloseDTO", description = "CRM 离职交接任务关闭入参")
public class CrmHandoverCloseDTO {

    @Schema(description = "备注")
    @Size(max = 500)
    private String remark;
}
