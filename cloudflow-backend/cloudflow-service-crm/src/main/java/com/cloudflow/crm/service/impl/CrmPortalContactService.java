package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.datascope.DataScopeUtils;
import com.cloudflow.common.security.portal.PortalContactSnapshot;
import com.cloudflow.crm.domain.CrmContact;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.mapper.CrmContactMapper;
import com.cloudflow.crm.mapper.CrmCustomerMapper;
import com.cloudflow.crm.mapper.CrmPortalContactMapper;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class CrmPortalContactService {
    private final CrmContactMapper contacts;
    private final CrmCustomerMapper customers;
    private final CrmPortalContactMapper scopes;

    public List<Long> visibleContactIds() {
        requireOperator(false);
        return scopes.visibleContactIds(tenantId(), DataScopeUtils.listScope("scope_dept_id", "scope_owner_id"));
    }

    public PageResult<PortalContactSnapshot> candidates(String keyword, PageQuery pageQuery) {
        requireOperator(true);
        Page<CrmContact> page = scopes.candidates(pageQuery.build(), tenantId(), keyword,
                DataScopeUtils.listScope("scope_dept_id", "scope_owner_id"));
        List<PortalContactSnapshot> rows = page.getRecords().stream()
                .map(contact -> snapshot(contact, customers.selectById(contact.getCustomerId()))).toList();
        return new PageResult<>(rows, page.getTotal(), page.getCurrent(), page.getSize());
    }

    public PortalContactSnapshot invitation(Long contactId, boolean requireActive) {
        requireOperator(true);
        CrmContact contact = contacts.selectById(contactId);
        if (contact == null || !Objects.equals(contact.getTenantId(), tenantId())) throw unavailable();
        CrmCustomer customer = customers.selectByIdWithDataScope(contact.getCustomerId(), DataScopeUtils.listScope("dept_id", "owner_id"));
        if (customer == null || !Objects.equals(customer.getTenantId(), tenantId())
                || !Integer.valueOf(0).equals(customer.getDeleted())) throw unavailable();
        if (requireActive && !active(contact, customer)) throw new ServiceException("联系人或客户已停用，请先核对CRM资料", 409);
        return snapshot(contact, customer);
    }

    public PortalContactSnapshot identity(Long contactId, Long customerId) {
        CrmContact contact = contacts.selectById(contactId);
        if (contact == null || !Objects.equals(contact.getTenantId(), tenantId())
                || !Objects.equals(contact.getCustomerId(), customerId)) return null;
        CrmCustomer customer = customers.selectById(customerId);
        if (customer == null || !Objects.equals(customer.getTenantId(), tenantId()) || !active(contact, customer)) return null;
        return snapshot(contact, customer);
    }

    private static PortalContactSnapshot snapshot(CrmContact contact, CrmCustomer customer) {
        PortalContactSnapshot value = new PortalContactSnapshot();
        value.setTenantId(contact.getTenantId());
        value.setContactId(contact.getContactId());
        value.setCustomerId(contact.getCustomerId());
        value.setContactName(contact.getContactName());
        value.setCustomerName(customer == null ? null : customer.getCustomerName());
        value.setEmail(contact.getEmail());
        value.setPhone(contact.getPhone());
        value.setVersion(contact.getVersion());
        return value;
    }

    private static boolean active(CrmContact contact, CrmCustomer customer) {
        return Integer.valueOf(0).equals(contact.getDeleted()) && "ACTIVE".equals(contact.getStatus())
                && Integer.valueOf(0).equals(customer.getDeleted()) && "ACTIVE".equals(customer.getStatus());
    }

    private static void requireOperator(boolean manage) {
        Set<String> permissions = UserContext.getPermissions();
        if (UserContext.getUserId() == null || UserContext.getAuthToken() == null
                || !(permissions.contains("*:*:*") || permissions.contains("system:portal:user:manage")
                || !manage && permissions.contains("system:portal:user:list"))) {
            throw new ServiceException("无权管理客户门户账号", 403);
        }
    }

    private static Long tenantId() {
        Long tenantId = UserContext.getTenantId();
        if (tenantId == null || tenantId <= 0) throw new ServiceException("缺少可信租户", 403);
        return tenantId;
    }

    private static ServiceException unavailable() { return new ServiceException("联系人不存在或无权访问", 403); }
}
