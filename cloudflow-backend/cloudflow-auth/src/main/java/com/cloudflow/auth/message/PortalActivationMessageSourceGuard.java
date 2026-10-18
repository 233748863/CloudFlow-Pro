package com.cloudflow.auth.message;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.auth.domain.SysPortalUser;
import com.cloudflow.auth.mapper.SysPortalUserMapper;
import com.cloudflow.auth.portal.PortalAccountRules;
import com.cloudflow.auth.portal.PortalContacts;
import com.cloudflow.auth.portal.PortalInvitationMail;
import com.cloudflow.auth.portal.PortalTenantAccess;
import com.cloudflow.common.security.portal.PortalAccessPolicy;
import com.cloudflow.common.tenant.TenantBroker;
import java.time.LocalDateTime;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class PortalActivationMessageSourceGuard implements MessageDeliverySourceGuard {
    private final SysPortalUserMapper users;
    private final PortalContacts contacts;
    private final PortalTenantAccess tenants;
    private final PortalAccessPolicy access;

    @Override
    public boolean supports(String sourceModule, String businessType) {
        return "cloudflow-auth".equals(sourceModule) && PortalInvitationMail.BUSINESS_TYPE.equals(businessType);
    }

    @Override
    public boolean verifyAtSendBoundary() { return true; }

    @Override
    public String rejectionCode(MessageDeliveryPayload payload) {
        if (access.unavailableReason() != null || tenants.byId(payload.tenantId()) == null) return "PORTAL_DISABLED";
        String businessId = payload.request().getBizId();
        if (businessId == null || !businessId.matches("[0-9]{1,18}")) return "SOURCE_INVALID";
        return TenantBroker.applyAs(payload.tenantId(), ignored -> {
            SysPortalUser user = users.selectOne(new LambdaQueryWrapper<SysPortalUser>()
                    .eq(SysPortalUser::getTenantId, payload.tenantId()).eq(SysPortalUser::getPortalUserId, Long.valueOf(businessId)));
            Object activationHash = payload.request().safeParams().get("activationHash");
            if (!(activationHash instanceof String hash) || !PortalAccountRules.canActivate(user, hash, LocalDateTime.now())
                    || payload.request().safeReceivers().size() != 1
                    || !Objects.equals(user.getEmail(), payload.request().safeReceivers().get(0).getReceiverAddress())
                    || contacts.current(user) == null) return "PORTAL_INVITATION_INVALID";
            return null;
        });
    }
}
