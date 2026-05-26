package com.cloudflow.hr.domain.vo.compensation;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Map;

/**
 * HR 员工薪酬 VO（剔除 deleted/tenantId；总薪资为解密后明文按权限掩码）。
 */
@Data
@Schema(name = "HrEmployeeCompVO", description = "HR 员工薪酬 VO")
public class HrEmployeeCompVO {
    @Schema(description = "记录 ID") private Long id;
    @Schema(description = "员工 ID") private Long employeeId;
    @Schema(description = "薪酬结构 ID") private Long structureId;
    @Schema(description = "薪级 ID") private Long gradeId;
    @Schema(description = "薪酬项明细（按权限掩码）") private Map<String, Object> componentValues;
    @Schema(description = "总薪资（按权限掩码）") private BigDecimal totalSalary;
    @Schema(description = "生效日期") private LocalDate effectiveDate;
    @Schema(description = "状态") private String status;
    @Schema(description = "创建人") private String createBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @Schema(description = "更新人") private String updateBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
}
