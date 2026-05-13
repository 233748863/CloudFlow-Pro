package com.cloudflow.crm.domain.dto;

import lombok.Data;

@Data
public class CrmLeadConvertDTO {
    private Long leadId;
    private String customerName;
    private String customerType;
    private String industry;
    private String source;
    private String customerTags;
    private Long ownerId;
    private String ownerName;
    private String phone;
    private String email;
    private String website;
    private String province;
    private String city;
    private String address;
    private String creditCode;
    private String remark;
}
