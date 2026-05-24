package com.cloudflow.hr.domain.dto.talent;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 人才池创建/更新入参。
 *
 * <p>剔除系统字段（id/tenantId/deleted/audit）。
 */
@Data
@Schema(name = "HrTalentPoolDTO", description = "人才池创建/更新入参")
public class HrTalentPoolDTO {

    @Schema(description = "池编号；不传由后端生成")
    @Size(max = 64)
    private String poolNo;

    @Schema(description = "池名称")
    @NotBlank(message = "池名称不能为空")
    @Size(max = 128)
    private String poolName;

    @Schema(description = "池类型：HIPO/SUCCESSOR/SPECIAL 等")
    @Size(max = 32)
    private String poolType;

    @Schema(description = "池说明")
    @Size(max = 1024)
    private String description;

    @Schema(description = "池责任人员工 ID")
    private Long ownerId;

    @Schema(description = "状态：ACTIVE/CLOSED；不传默认 ACTIVE")
    @Size(max = 32)
    private String status;
}
