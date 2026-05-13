package com.cloudflow.crm.domain.dto;

import lombok.Data;

@Data
public class CrmCustomerAssignDTO {
    private Long customerId;
    private Long ownerId;
    private String ownerName;
    private Long deptId;
    private String deptName;
    private String reason;
}
