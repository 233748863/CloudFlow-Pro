package com.cloudflow.hr.domain.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;

@Data
public class PerformanceResultUpdateDTO {

    @NotNull(message = "分配节点ID不能为空")
    private Long assignmentId;

    @NotNull(message = "实际完成值不能为空")
    @DecimalMin(value = "0.00", message = "实际完成值不能为负数")
    private BigDecimal actualAmount;
}
