package cn.joywon.poco.merchant.ReportModule.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 用户消费分析VO
 *
 * @author poco
 * @date 2025-01-04
 */
@Data
@Schema(description = "用户消费分析VO")
public class UserConsumptionVO implements Serializable {

    @Schema(description = "统计日期")
    private LocalDate statDate;

    @Schema(description = "商家ID")
    private Long merchantId;

    @Schema(description = "门店ID")
    private Long storeId;

    @Schema(description = "新用户数")
    private Integer newUserCount;

    @Schema(description = "活跃用户数")
    private Integer activeUserCount;

    @Schema(description = "复购用户数")
    private Integer repurchaseUserCount;

    @Schema(description = "复购率(%)")
    private BigDecimal repurchaseRate;

    @Schema(description = "消费0-50元用户数")
    private Integer amount0To50;

    @Schema(description = "消费50-100元用户数")
    private Integer amount50To100;

    @Schema(description = "消费100-200元用户数")
    private Integer amount100To200;

    @Schema(description = "消费200元以上用户数")
    private Integer amount200Plus;

    @Schema(description = "平均消费周期(天)")
    private BigDecimal avgPurchaseCycle;
}
