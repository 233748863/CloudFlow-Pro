package com.cloudflow.hr.domain.vo.compensation;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Map;

/**
 * HR 个税档案 VO（剔除 tenantId；threshold/taxConfig 为解密后明文按权限掩码）。
 */
@Data
@Schema(name = "HrTaxProfileVO", description = "HR 个税档案 VO")
public class HrTaxProfileVO {
    @Schema(description = "档案 ID") private Long id;
    @Schema(description = "员工 ID") private Long employeeId;
    @Schema(description = "纳税居住城市") private String taxResidenceCity;
    @Schema(description = "起征点（按权限掩码）") private BigDecimal threshold;
    @Schema(description = "税务配置（按权限掩码）") private Map<String, Object> taxConfig;
    @Schema(description = "状态") private String status;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
}
