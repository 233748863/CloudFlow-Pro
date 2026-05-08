package com.cloudflow.crm.domain.vo;

import lombok.Data;

import java.math.BigDecimal;

@Data
public class RemoteContractLinkVO {
    private Long contractId;
    private String contractNo;
    private String contractName;
    private String status;
    private String riskLevel;
    private BigDecimal amount;
    private String invoiceStatus;
    private Long projectId;
    private String projectName;
}
