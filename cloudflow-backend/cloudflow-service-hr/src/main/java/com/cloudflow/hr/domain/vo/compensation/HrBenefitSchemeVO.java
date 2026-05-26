package com.cloudflow.hr.domain.vo.compensation;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.databind.JsonNode;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * HR 福利方案 VO（剔除 tenantId 内部字段）。
 */
@Data
@Schema(name = "HrBenefitSchemeVO", description = "HR 福利方案 VO")
public class HrBenefitSchemeVO {
    @Schema(description = "方案 ID") private Long id;
    @Schema(description = "方案编码") private String schemeCode;
    @Schema(description = "方案名称") private String schemeName;
    @Schema(description = "城市") private String city;
    @Schema(description = "生效日期") private LocalDate effectiveDate;
    @Schema(description = "状态") private Integer status;
    @Schema(description = "福利配置 JSON") private JsonNode benefitConfig;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
}
