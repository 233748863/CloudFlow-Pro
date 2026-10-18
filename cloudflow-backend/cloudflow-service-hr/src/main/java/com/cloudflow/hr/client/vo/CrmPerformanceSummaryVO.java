package com.cloudflow.hr.client.vo;

import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;
import java.math.BigDecimal;
import lombok.Data;

@Data
public class CrmPerformanceSummaryVO {
    private String dimension;
    private Long targetId;
    private String targetName;
    private String calculationBasis;
    private String currency;
    private long wonOpportunityCount;
    @JsonSerialize(using = ToStringSerializer.class)
    private BigDecimal allocatedWonCount;
    @JsonSerialize(using = ToStringSerializer.class)
    private BigDecimal wonAmount;
    @JsonSerialize(using = ToStringSerializer.class)
    private BigDecimal contractAmount;
    @JsonSerialize(using = ToStringSerializer.class)
    private BigDecimal receivedAmount;
    @JsonSerialize(using = ToStringSerializer.class)
    private BigDecimal outstandingAmount;
    @JsonSerialize(using = ToStringSerializer.class)
    private BigDecimal baselineWonAmount;
    @JsonSerialize(using = ToStringSerializer.class)
    private BigDecimal baselineContractAmount;
    @JsonSerialize(using = ToStringSerializer.class)
    private BigDecimal baselineReceivedAmount;
    private long followUpCount;
    private long customerCount;
}
