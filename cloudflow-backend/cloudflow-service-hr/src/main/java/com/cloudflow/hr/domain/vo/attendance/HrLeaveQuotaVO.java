package com.cloudflow.hr.domain.vo.attendance;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * HR 假期额度 VO（剔除 tenantId）。
 */
@Data
@Schema(name = "HrLeaveQuotaVO", description = "HR 假期额度 VO")
public class HrLeaveQuotaVO {
    @Schema(description = "额度 ID") private Long id;
    @Schema(description = "员工 ID") private Long employeeId;
    @Schema(description = "假期类型 ID") private Long leaveTypeId;
    @Schema(description = "年度") private Integer year;
    @Schema(description = "总额度") private BigDecimal totalQuota;
    @Schema(description = "已用额度") private BigDecimal usedQuota;
    @Schema(description = "冻结额度") private BigDecimal frozenQuota;
    @Schema(description = "可用额度") private BigDecimal availableQuota;
    @Schema(description = "失效日期") private LocalDate expiryDate;
    @Schema(description = "创建人") private String createBy;
    @Schema(description = "更新人") private String updateBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
}
