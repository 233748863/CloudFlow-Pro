package com.cloudflow.hr.domain.dto.benefit;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * 福利申领创建/修改入参。
 */
@Data
@Schema(name = "HrBenefitRequestDTO", description = "福利申领创建/修改入参")
public class HrBenefitRequestDTO {

    @Schema(description = "申领编号；不传由后端生成")
    @Size(max = 64)
    private String requestNo;

    @Schema(description = "申领员工 ID（一般由当前登录人自动注入）")
    private Long employeeId;

    @Schema(description = "福利方案 ID")
    @NotNull(message = "福利方案不能为空")
    private Long schemeId;

    @Schema(description = "申领类型：REIMBURSE/POINT/SERVICE")
    @NotBlank(message = "申领类型不能为空")
    @Size(max = 32)
    private String requestType;

    @Schema(description = "金额（报销类）")
    private BigDecimal amount;

    @Schema(description = "积分（积分类）")
    private Integer pointAmount;

    @Schema(description = "申领原因")
    @Size(max = 512)
    private String reason;

    @Schema(description = "附件列表")
    private List<Map<String, Object>> attachments;
}
