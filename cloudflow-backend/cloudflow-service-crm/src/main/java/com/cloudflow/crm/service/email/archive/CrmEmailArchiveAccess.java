package com.cloudflow.crm.service.email.archive;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.datascope.DataScope;
import com.cloudflow.crm.domain.CrmContact;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmEmailRecord;
import com.cloudflow.crm.domain.CrmOpportunity;
import com.cloudflow.crm.domain.CrmQuote;
import com.cloudflow.crm.domain.CrmServiceTicket;
import com.cloudflow.crm.exception.CrmBusinessException;
import com.cloudflow.crm.mapper.CrmContactMapper;
import com.cloudflow.crm.mapper.CrmCustomerMapper;
import com.cloudflow.crm.mapper.CrmEmailRecordMapper;
import com.cloudflow.crm.mapper.CrmOpportunityMapper;
import com.cloudflow.crm.mapper.CrmQuoteMapper;
import com.cloudflow.crm.mapper.CrmServiceTicketMapper;
import com.cloudflow.crm.service.email.CrmEmailAccessService;
import com.cloudflow.crm.service.impl.CrmRecordSupport;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class CrmEmailArchiveAccess {
    private static final Map<String, String> BUSINESS_PERMISSIONS = Map.of("CUSTOMER", "crm:customer:list",
            "OPPORTUNITY", "crm:opportunity:list", "QUOTE", "crm:quote:list", "TICKET", "crm:ticket:list");
    private final CrmEmailAccessService identities;
    private final CrmEmailRecordMapper records;
    private final CrmCustomerMapper customers;
    private final CrmOpportunityMapper opportunities;
    private final CrmQuoteMapper quotes;
    private final CrmServiceTicketMapper tickets;
    private final CrmContactMapper contacts;

    public record Actor(CrmEmailAccessService.Actor identity, Set<String> permissions) {
        public Actor { permissions = Set.copyOf(permissions); }
        public void require(String permission) {
            if (!permissions.contains(permission)) throw denied();
        }
        public List<String> businessTypes() {
            return BUSINESS_PERMISSIONS.entrySet().stream().filter(entry -> permissions.contains(entry.getValue())).map(Map.Entry::getKey).sorted().toList();
        }
    }
    public record Business(String type, Long id, CrmCustomer customer, String name) { }

    public Actor current(String permission) { return resolve(UserContext.getUserId(), permission); }

    public Actor resolve(Long userId, String permission) {
        CrmEmailAccessService.Actor identity = identities.resolve(userId);
        CrmEmailArchiveAccess.Actor actor = new Actor(identity, Set.copyOf(records.permissions(CrmRecordSupport.tenantId(), userId)));
        actor.require(permission);
        return actor;
    }

    public Business business(Actor actor, String type, Long id) {
        if (id == null || id <= 0 || !BUSINESS_PERMISSIONS.containsKey(type == null ? "" : type)) throw denied();
        actor.require(BUSINESS_PERMISSIONS.get(type));
        DataScope scope = actor.identity().scope("scope_dept_id", "scope_owner_id");
        Long customerId;
        String name;
        switch (type) {
            case "CUSTOMER" -> { customerId = id; name = null; }
            case "OPPORTUNITY" -> {
                CrmOpportunity business = opportunities.selectByIdWithDataScope(id, scope);
                if (business == null) throw denied();
                customerId = business.getCustomerId(); name = business.getOpportunityName();
            }
            case "QUOTE" -> {
                CrmQuote business = quotes.selectByIdWithDataScope(id, scope);
                if (business == null) throw denied();
                customerId = business.getCustomerId(); name = business.getQuoteName();
            }
            case "TICKET" -> {
                CrmServiceTicket business = tickets.selectByIdWithDataScope(id, scope);
                if (business == null) throw denied();
                customerId = business.getCustomerId(); name = business.getTicketTitle();
            }
            default -> throw denied();
        }
        CrmCustomer customer = customers.selectByIdWithDataScope(customerId, actor.identity().scope("dept_id", "owner_id"));
        if (customer == null || !Objects.equals(CrmRecordSupport.tenantId(), customer.getTenantId())) throw denied();
        return new Business(type, id, customer, name == null ? customer.getCustomerName() : name);
    }

    public CrmContact contact(Business business, Long contactId, boolean required) {
        if (contactId == null) {
            if (required) throw new CrmBusinessException("请选择客户联系人后发送邮件");
            return null;
        }
        CrmContact contact = contacts.selectById(contactId);
        if (contact == null || !Objects.equals(contact.getTenantId(), CrmRecordSupport.tenantId())
                || !Objects.equals(contact.getCustomerId(), business.customer().getCustomerId())
                || !Integer.valueOf(0).equals(contact.getDeleted()) || !"ACTIVE".equals(contact.getStatus())) throw denied();
        return contact;
    }

    public CrmEmailRecord record(Actor actor, Long emailId) {
        CrmEmailRecord record = records.accessible(CrmRecordSupport.tenantId(), emailId, actor.businessTypes(), actor.identity().scope("scope_dept_id", "scope_owner_id"));
        if (record == null) throw denied();
        return record;
    }

    private static CrmBusinessException denied() { return new CrmBusinessException("MAIL_FORBIDDEN: 邮件或所属业务不存在、已停用或无权访问"); }
}
