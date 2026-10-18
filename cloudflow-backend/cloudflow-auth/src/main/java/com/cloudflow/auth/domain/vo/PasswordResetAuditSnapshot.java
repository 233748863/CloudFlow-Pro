package com.cloudflow.auth.domain.vo;

/** 密码重置审计仅保留用户身份、改密要求和已持久化事件标识。 */
public record PasswordResetAuditSnapshot(Long userId, Long tenantId, boolean forceChangeRequired,
                                         String resetEventId) {
}
