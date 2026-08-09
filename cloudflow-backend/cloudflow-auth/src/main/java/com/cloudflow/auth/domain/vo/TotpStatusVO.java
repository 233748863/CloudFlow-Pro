package com.cloudflow.auth.domain.vo;

import java.time.LocalDateTime;

public record TotpStatusVO(boolean featureEnabled, boolean enabled, LocalDateTime enabledAt) {
}
