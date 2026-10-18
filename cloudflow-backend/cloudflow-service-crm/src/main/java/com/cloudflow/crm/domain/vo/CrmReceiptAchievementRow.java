package com.cloudflow.crm.domain.vo;

import java.math.BigDecimal;
import lombok.Data;

@Data
public class CrmReceiptAchievementRow {
    private Long ownerId;
    private Long deptId;
    private BigDecimal receivedAmount;
    private BigDecimal baselineAmount;
}
