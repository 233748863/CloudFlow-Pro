package cn.joywon.poco.merchant.ReportModule.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 趋势数据点VO
 * 用于表示时间序列中的单个数据点
 *
 * @author poco
 * @date 2025-01-06
 */
@Data
@Schema(description = "趋势数据点VO")
public class DailyTrendPoint implements Serializable {

    @Schema(description = "日期")
    private LocalDate date;

    @Schema(description = "数值")
    private BigDecimal value;
}
