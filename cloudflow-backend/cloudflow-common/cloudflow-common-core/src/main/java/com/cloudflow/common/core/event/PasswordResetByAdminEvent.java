package com.cloudflow.common.core.event;

import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
public class PasswordResetByAdminEvent implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long userId;
    private String userName;
    private Long tenantId;
    private Long operatorId;
    private String operatorName;
    private String operatorIp;
    private LocalDateTime resetAt;
}
