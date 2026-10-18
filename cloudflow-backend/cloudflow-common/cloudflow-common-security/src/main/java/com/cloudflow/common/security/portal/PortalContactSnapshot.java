package com.cloudflow.common.security.portal;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class PortalContactSnapshot {
    private Long tenantId;
    private Long contactId;
    private Long customerId;
    private String contactName;
    private String customerName;
    private String email;
    private String phone;
    private Integer version;
}
