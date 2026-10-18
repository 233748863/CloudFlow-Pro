package com.cloudflow.oa.domain.dto;

import lombok.Data;
import java.util.Map;

@Data
public class OaApprovalRequest {
    private Long tenantId;
    private String businessType;
    private Long businessId;
    private String businessNo;
    private String reservation;
    private String processKey;
    private Long startUserId;
    private String startUserName;
    private Map<String, Object> variables;
}
