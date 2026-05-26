package com.cloudflow.hr.domain.vo.compensation;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * HR 薪级 VO（剔除 tenantId 内部字段；薪资字段为解密后明文按权限掩码）。
 */
@Data
@Schema(name = "HrCompGradeVO", description = "HR 薪级 VO")
public class HrCompGradeVO {
    @Schema(description = "薪级 ID") private Long id;
    @Schema(description = "薪级编码") private String gradeCode;
    @Schema(description = "薪级名称") private String gradeName;
    @Schema(description = "职级 ID") private Long levelId;
    @Schema(description = "最低薪资（按权限掩码）") private BigDecimal minSalary;
    @Schema(description = "中位薪资（按权限掩码）") private BigDecimal midSalary;
    @Schema(description = "最高薪资（按权限掩码）") private BigDecimal maxSalary;
    @Schema(description = "币种") private String currency;
    @Schema(description = "状态") private Integer status;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
}
