package cn.joywon.poco.merchant.CouponModule.bo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;

@Data
@Schema(description = "结算批次处理结果")
public class SettlementBatchResult {

    @Schema(description = "成功记录数")
    private Integer successCount = 0;

    @Schema(description = "失败记录数")
    private Integer failureCount = 0;

    @Schema(description = "成功金额")
    private BigDecimal successAmount = BigDecimal.ZERO;

    @Schema(description = "失败金额")
    private BigDecimal failureAmount = BigDecimal.ZERO;

    @Schema(description = "批次处理耗时(毫秒)")
    private Long processTime = 0L;

    @Schema(description = "错误信息")
    private String errorMessage;

    /**
     * 添加成功记录
     */
    public void addSuccess(BigDecimal amount) {
        successCount++;
        successAmount = successAmount.add(amount);
    }

    /**
     * 添加失败记录
     */
    public void addFailure(BigDecimal amount, String error) {
        failureCount++;
        failureAmount = failureAmount.add(amount);
        if (errorMessage == null) {
            errorMessage = error;
        } else {
            errorMessage += "; " + error;
        }
    }

    /**
     * 获取总记录数
     */
    public Integer getTotalCount() {
        return successCount + failureCount;
    }

    /**
     * 获取总金额
     */
    public BigDecimal getTotalAmount() {
        return successAmount.add(failureAmount);
    }

    /**
     * 获取成功率
     */
    public BigDecimal getSuccessRate() {
        if (getTotalCount() == 0) {
            return BigDecimal.ZERO;
        }
        return BigDecimal.valueOf(successCount)
                .divide(BigDecimal.valueOf(getTotalCount()), 4, BigDecimal.ROUND_HALF_UP)
                .multiply(BigDecimal.valueOf(100));
    }

}