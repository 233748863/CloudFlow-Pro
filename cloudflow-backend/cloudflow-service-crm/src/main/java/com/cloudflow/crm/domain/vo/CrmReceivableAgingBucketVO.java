package com.cloudflow.crm.domain.vo;

import lombok.Data;

import java.math.BigDecimal;

@Data
public class CrmReceivableAgingBucketVO {
    private String bucketCode;
    private String bucketName;
    private Integer customerCount;
    private Integer receivableCount;
    private BigDecimal outstandingAmount;
}
