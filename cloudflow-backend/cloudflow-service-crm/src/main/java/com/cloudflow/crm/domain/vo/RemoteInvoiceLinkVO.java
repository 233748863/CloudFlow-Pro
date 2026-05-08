package com.cloudflow.crm.domain.vo;

import lombok.Data;

import java.math.BigDecimal;

@Data
public class RemoteInvoiceLinkVO {
    private Long invoiceId;
    private String invoiceDirection;
    private String invoiceCode;
    private String invoiceNo;
    private String invoiceType;
    private BigDecimal grossAmount;
    private String status;
    private Long receivableId;
    private Long contractId;
    private String contractNo;
    private String externalLinkUrl;
}
