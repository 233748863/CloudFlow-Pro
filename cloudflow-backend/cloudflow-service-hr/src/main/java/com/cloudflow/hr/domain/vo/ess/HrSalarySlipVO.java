package com.cloudflow.hr.domain.vo.ess;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * HR 工资条 VO（剔除 deleted/tenantId；金额由 HrTypedCrudService.maskRow 按权限自动脱敏）。
 */
@Data
@Schema(name = "HrSalarySlipVO", description = "HR 工资条 VO")
public class HrSalarySlipVO {
    @Schema(description = "工资条 ID") private Long id;
    @Schema(description = "员工 ID") private Long employeeId;
    @Schema(description = "工资月份 yyyy-MM") private String periodMonth;
    @Schema(description = "应发合计（按权限脱敏）") private Object grossTotal;
    @Schema(description = "扣除合计（按权限脱敏）") private Object deductionTotal;
    @Schema(description = "实发合计（按权限脱敏）") private Object netTotal;
    @Schema(description = "个税（按权限脱敏）") private Object taxAmount;
    @Schema(description = "社保公积金（按权限脱敏）") private Object benefitAmount;
    @Schema(description = "构成明细行") private List<Map<String, Object>> components;
    @Schema(description = "发放日期") private LocalDate payDate;
    @Schema(description = "状态") private String status;
    @Schema(description = "是否员工已确认") private Boolean employeeConfirmed;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime confirmedTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
    @Schema(description = "创建人") private String createBy;
    @Schema(description = "更新人") private String updateBy;
}
