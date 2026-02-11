package cn.joywon.poco.merchant.CouponModule.bo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.math.RoundingMode;

@Data
@Schema(description = "分润基础统计信息")
public class JointMarketingProfitBaseStat {

    @Schema(description = "总金额")
    private BigDecimal totalAmount;

    @Schema(description = "成功金额")
    private BigDecimal successAmount;

    @Schema(description = "失败金额")
    private BigDecimal failedAmount;

    @Schema(description = "总记录数")
    private Integer totalRecords;

    @Schema(description = "成功记录数")
    private Integer successRecords;

    @Schema(description = "失败记录数")
    private Integer failureRecords;

    @Schema(description = "成功率")
    private BigDecimal successRate;

    @Schema(description = "失败率")
    private BigDecimal failureRate;

    public JointMarketingProfitBaseStat() {
        this.totalAmount = BigDecimal.ZERO;
        this.successAmount = BigDecimal.ZERO;
        this.failedAmount = BigDecimal.ZERO;
        this.totalRecords = 0;
        this.successRecords = 0;
        this.failureRecords = 0;
        this.successRate = BigDecimal.ZERO;
        this.failureRate = BigDecimal.ZERO;
    }

    public void addSuccessRecord(BigDecimal amount) {
        this.successRecords++;
        this.totalRecords++;
        this.successAmount = this.successAmount.add(amount);
        this.totalAmount = this.totalAmount.add(amount);
        calculateRates();
    }

    public void addFailedRecord(BigDecimal amount) {
        this.failureRecords++;
        this.totalRecords++;
        this.failedAmount = this.failedAmount.add(amount);
        this.totalAmount = this.totalAmount.add(amount);
        calculateRates();
    }

    public void merge(JointMarketingProfitBaseStat other) {
        if (other == null) return;

        this.totalRecords += other.totalRecords;
        this.successRecords += other.successRecords;
        this.failureRecords += other.failureRecords;
        this.totalAmount = this.totalAmount.add(other.totalAmount);
        this.successAmount = this.successAmount.add(other.successAmount);
        this.failedAmount = this.failedAmount.add(other.failedAmount);
        calculateRates();
    }

    private void calculateRates() {
        if (totalRecords > 0) {
            this.successRate = BigDecimal.valueOf(successRecords)
                    .divide(BigDecimal.valueOf(totalRecords), 4, RoundingMode.HALF_UP)
                    .multiply(BigDecimal.valueOf(100));
            this.failureRate = BigDecimal.valueOf(failureRecords)
                    .divide(BigDecimal.valueOf(totalRecords), 4, RoundingMode.HALF_UP)
                    .multiply(BigDecimal.valueOf(100));
        }
    }

    public BigDecimal getAverageAmount() {
        if (totalRecords == 0) return BigDecimal.ZERO;
        return totalAmount.divide(BigDecimal.valueOf(totalRecords), 2, RoundingMode.HALF_UP);
    }

    public BigDecimal getAverageSuccessAmount() {
        if (successRecords == 0) return BigDecimal.ZERO;
        return successAmount.divide(BigDecimal.valueOf(successRecords), 2, RoundingMode.HALF_UP);
    }

    public boolean isEmpty() {
        return totalRecords == 0;
    }

}