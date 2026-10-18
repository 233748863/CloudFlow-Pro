package com.cloudflow.common.core.domain;

import java.time.LocalDateTime;
import lombok.Data;

/** Persistence projection; never returned from a customer-facing endpoint. */
@Data
public class PortalFinanceState {
    private Long id;
    private Long tenantId;
    private Long customerId;
    private String customerName;
    private String customerStatus;
    private Integer version;
    private Integer publicVersion;
    private Long publishedBy;
    private LocalDateTime publishedTime;
    private String fileIdsJson;
    private PortalFinanceVO record;
}
