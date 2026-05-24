package com.cloudflow.auth.domain.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

/**
 * 租户运营状态 VO（网关侧 TenantStatusChecker 解析使用）。
 *
 * <p>对应 {@code GET /inner/auth/tenant/status/{tenantId}} 内部接口出参。
 */
@Data
@Schema(name = "SysTenantStatusVO", description = "租户运营状态 VO")
public class SysTenantStatusVO {

    @Schema(description = "是否可用")
    private Boolean available;

    @Schema(description = "原因 OK/NOT_FOUND/DISABLED/EXPIRED")
    private String reason;

    public static SysTenantStatusVO of(Boolean available, String reason) {
        SysTenantStatusVO vo = new SysTenantStatusVO();
        vo.setAvailable(available);
        vo.setReason(reason);
        return vo;
    }
}
