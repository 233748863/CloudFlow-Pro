package com.cloudflow.crm.service.impl;

import cn.hutool.crypto.digest.BCrypt;
import com.baomidou.mybatisplus.core.toolkit.IdWorker;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.PortalTicketRequest;
import com.cloudflow.common.core.domain.PortalTicketVO;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.security.portal.PortalIdentity;
import com.cloudflow.common.security.portal.PortalTokens;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.crm.domain.CrmContact;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmServiceTicket;
import com.cloudflow.crm.domain.dto.CrmPortalTicketCommands;
import com.cloudflow.crm.mapper.CrmContactMapper;
import com.cloudflow.crm.mapper.CrmPortalTicketMapper;
import com.cloudflow.crm.mapper.CrmServiceTicketMapper;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.springframework.transaction.support.TransactionTemplate;

import static com.cloudflow.crm.service.impl.CrmOperationsChecks.*;

final class CrmPortalTicketDatabaseChecks {
    private final CrmOperationsDatabaseChecks fixture;
    private final CrmPortalTicketService portal;
    private final CrmPortalTicketManagement management;
    private final CrmServiceTicketServiceImpl tickets;
    private final PortalTokens tokens;
    private final CrmPortalTicketMapper mapper;
    private final String prefix = "portal-db-" + UUID.randomUUID();
    private final Long salesUser;
    private final Long supportUser;
    private final Long employeeUser;
    private final CrmCustomer customer;
    private final Account first;
    private final Account colleague;
    private final Account foreign;

    private record Account(PortalIdentity identity, String token) { }

    private CrmPortalTicketDatabaseChecks(CrmOperationsDatabaseChecks fixture) {
        this.fixture = fixture; portal = fixture.bean(CrmPortalTicketService.class); management = fixture.bean(CrmPortalTicketManagement.class);
        tickets = fixture.bean(CrmServiceTicketServiceImpl.class); tokens = fixture.bean(PortalTokens.class); mapper = fixture.mapper(CrmPortalTicketMapper.class);
        salesUser = user(9); supportUser = user(11); employeeUser = user(5);
        customer = fixture.customer(prefix); first = account(customer); colleague = account(customer); foreign = account(fixture.customer(prefix + "-foreign"));
    }

    static void run(CrmOperationsDatabaseChecks fixture) throws Exception {
        int before = assertionCount(); identity(); CrmPortalTicketDatabaseChecks checks = new CrmPortalTicketDatabaseChecks(fixture);
        try { checks.creation(); checks.assignmentAndPublication(); checks.identityChanges(); checks.competition(); }
        finally { for (Account account : List.of(checks.first, checks.colleague, checks.foreign)) checks.tokens.end(account.token()); identity(); }
        System.out.println("PORTAL_TICKET_DATABASE_CHECKS: assertions=" + (assertionCount() - before)
                + "; failed=0; mysql=true; actual_row_locks=true; concurrency_groups=4; token_store=in_memory; file_bytes=false; interface_doubles=HR_OA_WORKFLOW; real_http=false; production_modified=false");
    }

    private Long user(int roleId) {
        Long userId = IdWorker.getId(); String name = "pt_" + UUID.randomUUID().toString().substring(0, 8);
        fixture.jdbc.update("INSERT INTO sys_user (user_id,tenant_id,dept_id,user_name,nick_name,status,deleted,create_by) VALUES (?,100000,100,?,?,'0',0,'portal-db-check')", userId, name, name);
        fixture.jdbc.update("INSERT INTO sys_user_role (user_id,role_id,tenant_id) VALUES (?,?,100000)", userId, roleId); return userId;
    }

    private Account account(CrmCustomer company) {
        CrmContact contact = new CrmContact(); contact.setCustomerId(company.getCustomerId()); contact.setContactName("portal check"); contact.setStatus("ACTIVE");
        CrmRecordSupport.create(contact, "contactId"); fixture.mapper(CrmContactMapper.class).insert(contact);
        Long id = IdWorker.getId(); String account = "portal-" + UUID.randomUUID();
        String passwordHash = BCrypt.hashpw(UUID.randomUUID().toString(), BCrypt.gensalt(12));
        fixture.jdbc.update("INSERT INTO sys_portal_user (portal_user_id,tenant_id,user_type,ref_biz_type,ref_biz_id,customer_id,login_account,email,password_hash,status,session_version,create_by) VALUES (?,100000,'CUSTOMER_CONTACT','CRM_CONTACT',?,?,?,?,?,'ACTIVE',0,'portal-db-check')", id, contact.getContactId(), company.getCustomerId(), account, account + "@example.test", passwordHash);
        PortalIdentity identity = new PortalIdentity(id, 100000L, company.getCustomerId(), contact.getContactId(), 0, contact.getVersion());
        return new Account(identity, tokens.create(identity));
    }

    private void asPortal(Account account) {
        identity(account.identity().tenantId(), null, 0); UserContext.setUserName("portal:" + account.identity().portalUserId());
    }

    private PortalTicketRequest request(String suffix, Long... files) {
        PortalTicketRequest input = new PortalTicketRequest(); input.setRequestKey(UUID.randomUUID().toString()); input.setTitle(prefix + "-" + suffix);
        input.setDescription("客户原始问题\n只读留存"); input.setFileIds(List.of(files)); return input;
    }

    private PortalTicketVO create(Account account, PortalTicketRequest request) { asPortal(account); return portal.create(account.token(), request); }
    private CrmServiceTicket current(Long ticketId) { return fixture.mapper(CrmServiceTicketMapper.class).selectById(ticketId); }
    private long count() { return fixture.scalar("SELECT COUNT(*) FROM crm_service_ticket WHERE tenant_id=100000 AND ticket_title LIKE ?", prefix + "%"); }
    private long audit(Long id, String action) { return fixture.scalar("SELECT COUNT(*) FROM sys_audit_log WHERE tenant_id=100000 AND audit_field=? AND audit_name=?", id.toString(), action); }

    private Long upload(Account owner) {
        Long id = IdWorker.getId();
        fixture.jdbc.update("INSERT INTO sys_file (file_id,tenant_id,file_name,file_size,file_type,access_type,biz_type,biz_id,portal_owner_id,create_by) VALUES (?,100000,'portal-check.txt',12,'txt','PRIVATE','PORTAL_TICKET_UPLOAD',?,?,?)", id, UUID.randomUUID().toString(), owner.identity().portalUserId(), "portal:" + owner.identity().portalUserId());
        return id;
    }

    private void creation() throws Exception {
        Long file = upload(first); PortalTicketRequest request = request("create", file); PortalTicketVO created = create(first, request);
        CrmServiceTicket row = current(created.getTicketId()); equal("PENDING_ASSIGNMENT", created.getStatus(), "portal submits to unassigned queue");
        equal(null, row.getOwnerId(), "portal account is never an internal handler"); equal(first.identity().contactId(), row.getPortalContactId(), "contact is server derived");
        equal("portal:" + first.identity().portalUserId(), row.getCreateBy(), "creator uses explicit portal domain"); equal("P4", row.getSeverity(), "new portal ticket uses existing priority");
        check(row.getFirstResponseDue() != null && row.getResolutionDue() != null, "existing SLA starts before assignment"); equal(null, row.getFirstResponseTime(), "creation does not fake staff response");
        equal(file, created.getAttachments().get(0).getFileId(), "file binding and response share the committed ticket");
        equal("CRM_PORTAL_TICKET", fixture.jdbc.queryForObject("SELECT biz_type FROM sys_file WHERE file_id=?", String.class, file), "file leaves temporary scope");
        equal(1L, audit(created.getTicketId(), "PORTAL_TICKET_CREATED"), "creation writes one actual audit entry");
        equal(created.getTicketId(), create(first, request).getTicketId(), "same request returns original ticket"); equal(1L, audit(created.getTicketId(), "PORTAL_TICKET_CREATED"), "retry does not duplicate audit");
        request.setDescription("different body"); reject(409, () -> create(first, request)); request.setDescription("客户原始问题\n只读留存");
        equal(created.getTicketId(), portal.submission(first.token(), request.getRequestKey()).getTicketId(), "submission reconciliation returns original");
        asPortal(colleague); equal(created.getTicketId(), portal.detail(colleague.token(), created.getTicketId()).getTicketId(), "same company sees ticket");
        equal(file, portal.file(colleague.token(), created.getTicketId(), file).attachment().getFileId(), "same company can authorize bound file");
        reject(404, () -> portal.submission(colleague.token(), request.getRequestKey()));
        asPortal(foreign); reject(404, () -> portal.detail(foreign.token(), created.getTicketId())); reject(404, () -> portal.file(foreign.token(), created.getTicketId(), file));
        equal(0L, portal.list(foreign.token(), prefix, "", 1, 10).getTotal(), "foreign customer list and total exclude ticket");
        asPortal(first); String exposed = fixture.json.writeValueAsString(portal.detail(first.token(), created.getTicketId()));
        for (String secret : List.of("tenantId", "ownerId", "portalContactId", "filePath", "attachmentUrl", "createBy", "portalOwnerId")) check(!exposed.contains("\"" + secret + "\""), "public projection excludes " + secret);
        long before = count(); Long ownUpload = upload(first); Long foreignUpload = upload(colleague);
        reject(409, () -> create(first, request("invalid-file", ownUpload, foreignUpload))); equal(before, count(), "illegal attachment rolls back whole ticket");
        equal("PORTAL_TICKET_UPLOAD", fixture.jdbc.queryForObject("SELECT biz_type FROM sys_file WHERE file_id=?", String.class, ownUpload), "valid preceding attachment remains unbound after rollback");
        reject(409, () -> create(first, request("reuse-bound-file", file))); equal(before, count(), "one file cannot attach to another ticket");
        identity(); CrmServiceTicket internal = fixture.ticket(customer, java.time.LocalDateTime.now()); internal.setDescription("INTERNAL_DESCRIPTION"); internal.setSolution("INTERNAL_SOLUTION"); internal.setAttachmentUrl("INTERNAL_STORAGE_PATH"); tickets.createTicket(internal);
        asPortal(first); PortalTicketVO internalView = portal.detail(first.token(), internal.getTicketId()); equal(null, internalView.getDescription(), "internal source description is not public"); equal(null, internalView.getSolution(), "internal handling solution is not auto published");
        check(!fixture.json.writeValueAsString(internalView).contains("INTERNAL_"), "legacy internal fields cannot escape the projection");
        reject(400, () -> portal.list(first.token(), prefix, "UNKNOWN", 1, 10)); reject(400, () -> portal.list(first.token(), prefix, "", 0, 10)); reject(400, () -> portal.list(first.token(), prefix, "", 1, 101));
        fixture.jdbc.update("UPDATE crm_service_ticket SET deleted=1 WHERE ticket_id=?", created.getTicketId());
        reject(404, () -> portal.detail(first.token(), created.getTicketId())); reject(409, () -> create(first, request));
        fixture.jdbc.update("UPDATE crm_service_ticket SET deleted=0 WHERE ticket_id=?", created.getTicketId());
    }

    private CrmPortalTicketCommands.Assignment assignment(Long ticketId, Long owner) {
        CrmPortalTicketCommands.Assignment input = new CrmPortalTicketCommands.Assignment(); input.setVersion(current(ticketId).getVersion()); input.setOwnerId(owner); return input;
    }
    private CrmPortalTicketCommands.Publication publication(Long ticketId, String text) {
        CrmPortalTicketCommands.Publication input = new CrmPortalTicketCommands.Publication(); input.setVersion(current(ticketId).getVersion()); input.setPublish(text != null); input.setSolution(text); return input;
    }

    private void assignmentAndPublication() {
        Long id = create(first, request("assign")).getTicketId(); identity();
        CrmServiceTicket update = new CrmServiceTicket(); update.setTicketId(id); update.setVersion(current(id).getVersion()); update.setOwnerId(1L);
        reject(409, () -> tickets.updateTicket(update)); reject(409, () -> tickets.respondTicket(id)); reject(409, () -> tickets.resolveTicket(id, "skip")); reject(409, () -> tickets.closeTicket(id));
        reject(409, () -> management.publish(id, publication(id, "skip")));
        PageResult<CrmPortalTicketMapper.Handler> handlers = management.handlers(id, "", 1, 100);
        check(handlers.getRows().stream().anyMatch(handler -> handler.getUserId().equals(salesUser)), "CRM account without HR profile can be assigned");
        check(handlers.getRows().stream().noneMatch(handler -> handler.getUserId().equals(employeeUser)), "employee not offered as a handler");
        equal(null, mapper.handler(100001L, salesUser), "other tenant cannot resolve the handler");
        identity(100000L, employeeUser, 0); reject(403, () -> management.assign(id, assignment(id, salesUser)));
        identity(100000L, salesUser, 0); reject(403, () -> management.assign(id, assignment(id, salesUser)));
        identity(); reject(400, () -> management.assign(id, assignment(id, employeeUser)));
        CrmPortalTicketCommands.Assignment selected = assignment(id, salesUser);
        CrmPortalTicketManagement.View assigned = management.assign(id, selected); equal(salesUser, assigned.ticket().getOwnerId(), "admin uses specialized assignment");
        equal(null, assigned.ticket().getFirstResponseTime(), "assignment does not count as a response"); reject(409, () -> management.assign(id, selected));
        reject(403, () -> management.publish(id, publication(id, "admin cannot publish another handler's ticket")));
        identity(100000L, salesUser, 4); equal(id, tickets.getAccessibleTicket(id).getTicketId(), "assigned user reads this ticket outside customer ownership");
        fails(IllegalArgumentException.class, () -> fixture.bean(CrmCustomerServiceImpl.class).getAccessibleCustomer(customer.getCustomerId()), "assignment does not grant customer profile access");
        PageQuery page = new PageQuery(); page.setPageNum(1); page.setPageSize(100); CrmServiceTicket query = new CrmServiceTicket(); query.setTicketTitle(prefix);
        PageResult<CrmServiceTicket> mine = tickets.queryPage(query, page); equal(1L, mine.getTotal(), "data-scope SQL and total reveal only assigned portal ticket");
        equal(id, mine.getRows().get(0).getTicketId(), "pagination returns assigned record");
        CrmServiceTicket edit = new CrmServiceTicket(); edit.setTicketId(id); edit.setVersion(current(id).getVersion()); edit.setSolution("STAFF_PRIVATE_NOTE"); tickets.updateTicket(edit);
        asPortal(first); equal(null, portal.detail(first.token(), id).getSolution(), "internal edit still cannot publish");
        identity(100000L, salesUser, 4); CrmPortalTicketCommands.Publication publish = publication(id, "明确对外方案");
        CrmPortalTicketManagement.View published = management.publish(id, publish); check(published.ticket().getPortalSolutionTime() != null, "publication persists explicit time");
        equal("OPEN", published.ticket().getStatus(), "publication does not automatically resolve"); equal("STAFF_PRIVATE_NOTE", published.ticket().getSolution(), "publication leaves internal note unchanged");
        check(published.ticket().getFirstResponseTime() != null, "publication records first staff response");
        reject(409, () -> management.publish(id, publish)); equal(1L, audit(id, "PORTAL_TICKET_SOLUTION_PUBLISHED"), "stale publication cannot duplicate audit");
        asPortal(colleague); equal("明确对外方案", portal.detail(colleague.token(), id).getSolution(), "public scheme visible to same company");
        identity(100000L, salesUser, 4); management.publish(id, publication(id, null));
        equal(null, current(id).getPortalSolution(), "withdraw clears persisted text"); equal(null, current(id).getPortalSolutionTime(), "withdraw clears persisted publication time");
        equal("STAFF_PRIVATE_NOTE", current(id).getSolution(), "withdraw preserves internal note"); equal(1L, audit(id, "PORTAL_TICKET_SOLUTION_WITHDRAWN"), "withdraw is audited");
        asPortal(first); equal(null, portal.detail(first.token(), id).getSolution(), "withdraw is reflected by next portal read");
        identity(100000L, supportUser, 0); management.assign(id, assignment(id, supportUser)); equal(supportUser, current(id).getOwnerId(), "customer support is a valid dispatcher");
        identity(100000L, salesUser, 0); reject(403, () -> tickets.respondTicket(id)); reject(403, () -> management.publish(id, publication(id, "old owner")));
        identity(); CrmServiceTicket queue = new CrmServiceTicket(); queue.setPortalQueue(true); queue.setTicketTitle(prefix);
        PageResult<CrmServiceTicket> pending = tickets.queryPage(queue, page); check(pending.getRows().stream().allMatch(CrmPortalTicketPolicy::pending), "queue filter executes on server");
        check(pending.getRows().stream().noneMatch(ticket -> ticket.getTicketId().equals(id)), "assigned ticket leaves pending list and total");
    }

    private void identityChanges() {
        Long id = create(first, request("identity")).getTicketId();
        fixture.jdbc.update("UPDATE sys_portal_user SET session_version=session_version+1 WHERE portal_user_id=?", first.identity().portalUserId());
        reject(401, () -> portal.detail(first.token(), id)); reject(401, () -> create(first, request("revoked")));
        fixture.jdbc.update("UPDATE sys_portal_user SET session_version=session_version-1 WHERE portal_user_id=?", first.identity().portalUserId());
        for (String state : List.of("DISABLED", "LOCKED", "PENDING")) {
            fixture.jdbc.update("UPDATE sys_portal_user SET status=? WHERE portal_user_id=?", state, first.identity().portalUserId());
            reject(401, () -> portal.detail(first.token(), id));
        }
        fixture.jdbc.update("UPDATE sys_portal_user SET status='ACTIVE' WHERE portal_user_id=?", first.identity().portalUserId());
        fixture.jdbc.update("UPDATE crm_contact SET version=version+1 WHERE contact_id=?", first.identity().contactId()); reject(401, () -> portal.detail(first.token(), id));
        fixture.jdbc.update("UPDATE crm_contact SET version=version-1 WHERE contact_id=?", first.identity().contactId());
        fixture.jdbc.update("UPDATE crm_customer SET status='INACTIVE' WHERE customer_id=?", customer.getCustomerId()); reject(401, () -> portal.detail(first.token(), id));
        fixture.jdbc.update("UPDATE crm_customer SET status='ACTIVE' WHERE customer_id=?", customer.getCustomerId());
        UserContext.setTenantId(100001L); TenantContext.setTenantId(100001L); reject(401, () -> portal.detail(first.token(), id));
        asPortal(first); equal(id, portal.detail(first.token(), id).getTicketId(), "restored isolated identity can read again");
    }

    private void competition() throws Exception {
        PortalTicketRequest duplicate = request("concurrent-request"); long before = count();
        int[] duplicates = fixture.parallel(() -> { create(first, duplicate); return 1; }, () -> { create(first, duplicate); return 1; });
        equal(2, duplicates[0] + duplicates[1], "both identical callers receive a successful original result"); equal(before + 1, count(), "same key creates only one physical ticket");
        Long file = upload(first); PortalTicketRequest firstRequest = request("concurrent-file-a", file); PortalTicketRequest secondRequest = request("concurrent-file-b", file); before = count();
        int[] binding = fixture.parallel(() -> outcome(() -> create(first, firstRequest)), () -> outcome(() -> create(first, secondRequest)));
        equal(1, binding[0] + binding[1], "competing file binds have one winner"); equal(before + 1, count(), "losing attachment transaction leaves no ticket");
        Long id = create(first, request("concurrent-publication")).getTicketId(); identity(); management.assign(id, assignment(id, salesUser));
        CrmPortalTicketCommands.Publication left = publication(id, "方案A"); CrmPortalTicketCommands.Publication right = publication(id, "方案B");
        int[] published = fixture.parallel(() -> { identity(100000L, salesUser, 4); return outcome(() -> management.publish(id, left)); }, () -> { identity(100000L, salesUser, 4); return outcome(() -> management.publish(id, right)); });
        equal(1, published[0] + published[1], "same-version publications have one winner"); equal(1L, audit(id, "PORTAL_TICKET_SOLUTION_PUBLISHED"), "one winning publication creates one audit");
        CountDownLatch locked = new CountDownLatch(1); CountDownLatch started = new CountDownLatch(1);
        int[] reassigned = fixture.parallel(() -> new TransactionTemplate(fixture.manager).execute(status -> {
            fixture.mapper(CrmServiceTicketMapper.class).lockById(id); locked.countDown(); await(started);
            management.assign(id, assignment(id, supportUser)); return 1;
        }), () -> { await(locked); identity(100000L, salesUser, 0); started.countDown(); reject(403, () -> tickets.respondTicket(id)); return 1; });
        equal(2, reassigned[0] + reassigned[1], "old owner waiting on row lock is denied after reassignment commits"); equal(supportUser, current(id).getOwnerId(), "reassignment cannot be overwritten by prior owner");
    }

    private static int outcome(Runnable operation) { try { operation.run(); return 1; } catch (ServiceException rejected) { if (!Objects.equals(409, rejected.getCode())) throw rejected; return 0; } }
    private static void await(CountDownLatch latch) { try { if (!latch.await(10, TimeUnit.SECONDS)) throw new AssertionError("row-lock fixture timed out"); } catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); throw new IllegalStateException(interrupted); } }
    private static void reject(int code, Runnable operation) {
        try { operation.run(); } catch (ServiceException rejected) { equal(code, rejected.getCode(), "explicit rejection " + code); return; }
        throw new AssertionError("Expected rejection " + code);
    }
}
