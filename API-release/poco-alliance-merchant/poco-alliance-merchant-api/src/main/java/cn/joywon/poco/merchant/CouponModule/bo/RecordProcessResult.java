package cn.joywon.poco.merchant.CouponModule.bo;

import lombok.Data;

import java.math.BigDecimal;

@Data
public class RecordProcessResult {

    private boolean success = false;
    private BigDecimal amount = BigDecimal.ZERO;
    private String errorMessage;
    private Long recordId;

    public RecordProcessResult() {}

    public RecordProcessResult(boolean success, BigDecimal amount, String errorMessage) {
        this.success = success;
        this.amount = amount;
        this.errorMessage = errorMessage;
    }

}