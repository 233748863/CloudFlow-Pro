package com.cloudflow.hr.domain.vo.compensation;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;

/**
 * HR 薪酬模拟明细项 VO（不持久化）。
 *
 * <p>红线：B3 收敛 Service 出参 List&lt;Map&lt;String,Object&gt;&gt; 为类型化 VO。
 */
@Data
@Schema(name = "HrCompensationSimulateBreakdownItemVO", description = "HR 薪酬模拟明细项 VO")
public class HrCompensationSimulateBreakdownItemVO {

    @Schema(description = "薪酬项 ID")
    private Long componentId;

    @Schema(description = "薪酬项代码")
    private String componentCode;

    @Schema(description = "薪酬项名称")
    private String componentName;

    @Schema(description = "薪酬项类型 BASE/ALLOWANCE/BONUS/DEDUCTION")
    private String componentType;

    @Schema(description = "金额（DEDUCTION 视作减项）")
    private BigDecimal amount;

    @Schema(description = "是否应税 1=是 0=否")
    private Integer taxable;
}
