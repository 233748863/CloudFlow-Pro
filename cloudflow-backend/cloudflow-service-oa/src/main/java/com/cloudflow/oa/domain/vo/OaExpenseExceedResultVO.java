package com.cloudflow.oa.domain.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

/**
 * 报销超标校验结果 VO。
 */
@Data
@Schema(name = "OaExpenseExceedResultVO", description = "报销超标校验结果")
public class OaExpenseExceedResultVO {

    @Schema(description = "是否存在超标项") private boolean exceeded;
    @Schema(description = "累计超标金额") private BigDecimal totalExceededAmount;
    @Schema(description = "超标明细") private List<OaExpenseExceedDetailVO> details;
}
