package com.cloudflow.auth.portal;

import com.fasterxml.jackson.annotation.JsonFormat;
import java.time.LocalDateTime;

public record PortalUserView(Long portalUserId, Long contactId, Long customerId, String loginAccount,
        String emailMask, String status, int version, String deliveryStatus, String pendingReason,
        @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime activateExpireTime,
        @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime lockedUntil,
        @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime lastLoginTime) { }
