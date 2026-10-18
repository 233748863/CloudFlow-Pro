package com.cloudflow.auth.portal;

import com.cloudflow.auth.domain.SysPortalUser;
import com.cloudflow.auth.service.remote.RemoteCrmPortalService;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.security.portal.PortalContactSnapshot;
import feign.FeignException;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.function.Supplier;
import lombok.RequiredArgsConstructor;
import org.springframework.core.NestedExceptionUtils;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class PortalContacts {
    private final RemoteCrmPortalService crm;

    public List<Long> visibleIds() { return call(crm::visibleContactIds, false); }

    public PageResult<PortalContactSnapshot> candidates(String keyword, int pageNum, int pageSize) {
        return call(() -> crm.contacts(keyword, pageNum, pageSize), false);
    }

    public PortalContactSnapshot invitation(Long contactId, boolean requireActive) {
        PortalContactSnapshot contact = call(() -> crm.invitation(contactId, requireActive), false);
        if (contact == null || !Objects.equals(contact.getTenantId(), UserContext.getTenantId())
                || !Objects.equals(contact.getContactId(), contactId) || contact.getCustomerId() == null) {
            throw new ServiceException("联系人不存在或无权访问", 403);
        }
        if (requireActive) email(contact.getEmail());
        return contact;
    }

    public PortalContactSnapshot current(SysPortalUser user) {
        PortalContactSnapshot contact = call(() -> crm.identity(user.getRefBizId(), user.getCustomerId()), true);
        return contact != null && Objects.equals(contact.getTenantId(), user.getTenantId())
                && Objects.equals(contact.getContactId(), user.getRefBizId())
                && Objects.equals(contact.getCustomerId(), user.getCustomerId()) && contact.getVersion() != null
                && contact.getVersion() >= 0 && sameEmail(contact.getEmail(), user.getEmail()) ? contact : null;
    }

    public static String email(String value) {
        String normalized = value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
        if (normalized.length() > 254 || !cn.hutool.core.lang.Validator.isEmail(normalized)
                || normalized.indexOf('\r') >= 0 || normalized.indexOf('\n') >= 0) {
            throw new ServiceException("联系人尚未填写有效邮箱，请先补齐CRM资料", 409);
        }
        return normalized;
    }

    private static boolean sameEmail(String first, String second) {
        return first != null && second != null && first.trim().equalsIgnoreCase(second.trim());
    }

    private static <Result> Result call(Supplier<R<Result>> request, boolean nullable) {
        R<Result> response;
        try {
            response = request.get();
        } catch (RuntimeException unavailable) {
            Throwable cause = NestedExceptionUtils.getMostSpecificCause(unavailable);
            if (cause instanceof FeignException upstream) {
                if (upstream.status() == 403) throw new ServiceException("联系人不存在或无权访问", 403);
                if (upstream.status() == 409) throw new ServiceException("联系人或客户资料不可用于邀请，请先核对CRM资料", 409);
            }
            throw new ServiceException("CRM联系人验证暂不可用，请稍后重试", 503);
        }
        if (response == null || !response.isSuccess()) {
            if (response != null && Integer.valueOf(403).equals(response.getCode())) throw new ServiceException("联系人不存在或无权访问", 403);
            if (response != null && Integer.valueOf(409).equals(response.getCode())) throw new ServiceException("联系人或客户资料不可用于邀请，请先核对CRM资料", 409);
            throw new ServiceException("CRM联系人验证暂不可用，请稍后重试", 503);
        }
        if (!nullable && response.getData() == null) throw new ServiceException("CRM联系人验证暂不可用，请稍后重试", 503);
        return response.getData();
    }
}
