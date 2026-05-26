package com.cloudflow.oa.domain.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;

/**
 * 报销超标明细 VO。
 */
@Data
@Schema(name = "OaExpenseExceedDetailVO", description = "报销超标明细")
public class OaExpenseExceedDetailVO {

    @Schema(description = "报销项 ID") private Long itemId;
    @Schema(description = "费用类型") private String expenseType;
    @Schema(description = "命中标准 ID") private Long standardId;
    @Schema(description = "标准上限") private BigDecimal standardLimit;
    @Schema(description = "实际金额") private BigDecimal actualAmount;
    @Schema(description = "超标金额") private BigDecimal exceededAmount;
    @Schema(description = "城市") private String city;
    @Schema(description = "限制类型") private String limitType;
}
