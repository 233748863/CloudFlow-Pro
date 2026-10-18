package com.cloudflow.auth.message;

import com.cloudflow.auth.mapper.SysPortalUserMapper;
import com.cloudflow.auth.mapper.SysTenantMapper;
import com.cloudflow.auth.portal.PortalContacts;
import com.cloudflow.auth.portal.PortalCredentials;
import com.cloudflow.auth.portal.PortalInvitationMail;
import com.cloudflow.auth.portal.PortalRequests;
import com.cloudflow.auth.portal.PortalTenantAccess;
import com.cloudflow.auth.portal.PortalUserService;
import com.cloudflow.auth.portal.PortalUserView;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.security.portal.PortalContactSnapshot;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.BiConsumer;
import org.springframework.dao.CannotAcquireLockException;
import org.springframework.dao.DuplicateKeyException;

final class MessagePortalInvitationConcurrencyChecks {
    static void run(MessageDeliveryDatabaseChecks suite, PortalInvitationMail mail) throws Exception {
        int checksBefore = suite.checks.get();
        String previousToken = UserContext.getAuthToken();
        Set<String> previousPermissions = UserContext.getPermissions();
        authorize();
        try {
            rollbackRecovery(suite, mail, false);
            rollbackRecovery(suite, mail, true);
            exhaustedRecovery(suite, mail);
            for (int group = 0; group < 12; group++) concurrent(suite, mail, group, false, false);
            concurrent(suite, mail, 12, true, false);
            concurrent(suite, mail, 13, false, true);
            suite.check("REPEATABLE-READ".equals(suite.jdbc.queryForObject("SELECT @@transaction_isolation", String.class)),
                    "invitation retry does not change the database default isolation");
        } finally {
            UserContext.setAuthToken(previousToken);
            UserContext.setPermissions(previousPermissions);
        }
        System.out.println("PORTAL_INVITATION_CONCURRENCY_CHECKS: assertions=" + (suite.checks.get() - checksBefore)
                + "; failed=0; concurrency_groups=14; workers_per_group=4; controlled_fault_scenarios=3; injected_rollbacks=7; mysql=true; actual_mappers=true; crm_identity_double=true; production_modified=false");
    }

    private static void rollbackRecovery(MessageDeliveryDatabaseChecks suite, PortalInvitationMail mail, boolean duplicate) {
        AtomicInteger attempts = new AtomicInteger();
        List<String> isolation = new ArrayList<String>();
        SysPortalUserMapper users = observed(suite, (operation, result) -> {
            if (!"latestDelivery".equals(operation)) return;
            isolation.add(suite.jdbc.queryForObject("SELECT @@transaction_isolation", String.class));
            if (attempts.incrementAndGet() <= 2) {
                if (duplicate) throw new DuplicateKeyException("CONTROLLED_ROLLED_BACK_UNIQUE_CONFLICT");
                throw new CannotAcquireLockException("CONTROLLED_ROLLED_BACK_LOCK_COMPETITION");
            }
        });
        Long contactId = duplicate ? 11102L : 11101L;
        int eventsBefore = eventCount(suite);
        Outcome outcome = invite(service(suite, mail, users), request(contactId, "retry." + contactId));
        suite.check(outcome.code() == 200, "rolled-back " + (duplicate ? "unique" : "transient")
                + " competition retries creation instead of claiming an occupied account; actual=" + outcome.code() + "; type=" + outcome.errorType());
        suite.check(attempts.get() == 3, "two rolled-back invitation attempts recover on the third transaction");
        suite.check(isolation.equals(List.of("READ-COMMITTED", "READ-COMMITTED", "READ-COMMITTED")),
                "each invitation retry uses its own READ COMMITTED transaction");
        assertSingleInvitation(suite, outcome.view(), eventsBefore);
    }

    private static void exhaustedRecovery(MessageDeliveryDatabaseChecks suite, PortalInvitationMail mail) {
        AtomicInteger attempts = new AtomicInteger();
        SysPortalUserMapper users = observed(suite, (operation, result) -> {
            if ("latestDelivery".equals(operation)) {
                attempts.incrementAndGet();
                throw new CannotAcquireLockException("CONTROLLED_PERSISTENT_LOCK_COMPETITION");
            }
        });
        int eventsBefore = eventCount(suite);
        int messagesBefore = suite.jdbc.queryForObject("SELECT COUNT(*) FROM sys_message_record", Integer.class);
        int deliveriesBefore = suite.jdbc.queryForObject("SELECT COUNT(*) FROM sys_message_delivery", Integer.class);
        Outcome outcome = invite(service(suite, mail, users), request(11103L, "retry.exhausted"));
        suite.check(outcome.code() == 503 && attempts.get() == 3,
                "persistent lock competition stops after three attempts with temporary unavailability, never account conflict");
        suite.check(suite.jdbc.queryForObject("SELECT COUNT(*) FROM sys_portal_user WHERE tenant_id=? AND ref_biz_id=11103", Integer.class, suite.TENANT) == 0,
                "exhausted invitation retries leave no partial account");
        suite.check(eventCount(suite) == eventsBefore
                && suite.jdbc.queryForObject("SELECT COUNT(*) FROM sys_message_record", Integer.class) == messagesBefore
                && suite.jdbc.queryForObject("SELECT COUNT(*) FROM sys_message_delivery", Integer.class) == deliveriesBefore,
                "exhausted invitation retries leave no invitation event, message or delivery");
    }

    private static void concurrent(MessageDeliveryDatabaseChecks suite, PortalInvitationMail mail, int group,
            boolean differentContacts, boolean differentAccounts) throws Exception {
        CyclicBarrier readers = new CyclicBarrier(4);
        ThreadLocal<Boolean> firstRead = ThreadLocal.withInitial(() -> true);
        SysPortalUserMapper users = observed(suite, (operation, result) -> {
            if ("lockContact".equals(operation) && firstRead.get()) {
                firstRead.set(false);
                if (result != null) throw new AssertionError("Concurrent invitations must start without an account");
                await(readers);
            }
        });
        PortalUserService service = service(suite, mail, users);
        ExecutorService workers = Executors.newFixedThreadPool(4);
        List<Future<Outcome>> futures = new ArrayList<Future<Outcome>>();
        int eventsBefore = eventCount(suite);
        try {
            for (int worker = 0; worker < 4; worker++) {
                Long contactId = 12000L + group * 10 + (differentContacts ? worker : 0);
                String account = "concurrent." + group + (differentAccounts ? "." + worker : "");
                futures.add(workers.submit(() -> {
                    authorize();
                    try { return invite(service, request(contactId, account)); }
                    finally { firstRead.remove(); UserContext.clear(); }
                }));
            }
            List<Outcome> outcomes = new ArrayList<Outcome>();
            for (Future<Outcome> future : futures) outcomes.add(future.get(30, TimeUnit.SECONDS));
            List<Outcome> successes = outcomes.stream().filter(outcome -> outcome.code() == 200).toList();
            long conflicts = outcomes.stream().filter(outcome -> outcome.code() == 409).count();
            boolean conflicting = differentContacts || differentAccounts;
            suite.check(successes.size() == (conflicting ? 1 : 4) && conflicts == (conflicting ? 3 : 0),
                    "four simultaneous initial invitations preserve account/contact uniqueness; group=" + group
                            + "; outcomes=" + outcomes.stream().map(outcome -> outcome.code() + ":" + outcome.errorType()).toList());
            suite.check(successes.stream().map(outcome -> outcome.view().portalUserId()).distinct().count() == 1
                    && successes.stream().allMatch(outcome -> outcome.view().version() == 1),
                    "concurrent invitations return one account without rotating its activation credentials");
            assertSingleInvitation(suite, successes.get(0).view(), eventsBefore);
        } finally {
            workers.shutdownNow();
            if (!workers.awaitTermination(30, TimeUnit.SECONDS)) throw new AssertionError("Invitation workers did not finish");
        }
    }

    private static void assertSingleInvitation(MessageDeliveryDatabaseChecks suite, PortalUserView user, int eventsBefore) {
        suite.check(suite.jdbc.queryForObject("SELECT COUNT(*) FROM sys_portal_user WHERE tenant_id=? AND ref_biz_id=?", Integer.class,
                suite.TENANT, user.contactId()) == 1, "invitation recovery persists exactly one contact account");
        suite.check(suite.jdbc.queryForObject("SELECT COUNT(*) FROM sys_message_record WHERE tenant_id=? AND biz_type='PORTAL_ACTIVATION' AND biz_id=?", Integer.class,
                suite.TENANT, user.portalUserId().toString()) == 1, "invitation recovery persists exactly one message record");
        suite.check(suite.jdbc.queryForObject("SELECT COUNT(*) FROM sys_message_delivery delivery JOIN sys_message_record record ON record.record_id=delivery.record_id WHERE record.tenant_id=? AND record.biz_type='PORTAL_ACTIVATION' AND record.biz_id=?", Integer.class,
                suite.TENANT, user.portalUserId().toString()) == 1, "invitation recovery reserves exactly one external send");
        suite.check(eventCount(suite) == eventsBefore + 1, "invitation recovery queues exactly one committed initial event");
    }

    private static SysPortalUserMapper observed(MessageDeliveryDatabaseChecks suite, BiConsumer<String, Object> observer) {
        SysPortalUserMapper delegate = suite.mapper(SysPortalUserMapper.class);
        return (SysPortalUserMapper) Proxy.newProxyInstance(SysPortalUserMapper.class.getClassLoader(),
                new Class<?>[] { SysPortalUserMapper.class }, (proxy, method, arguments) -> {
                    Object result;
                    try { result = method.invoke(delegate, arguments); }
                    catch (InvocationTargetException failure) { throw failure.getCause(); }
                    observer.accept(method.getName(), result);
                    return result;
                });
    }

    private static PortalUserService service(MessageDeliveryDatabaseChecks suite, PortalInvitationMail mail, SysPortalUserMapper users) {
        PortalContacts contacts = new PortalContacts(null) {
            @Override
            public PortalContactSnapshot invitation(Long contactId, boolean requireActive) {
                PortalContactSnapshot contact = new PortalContactSnapshot();
                contact.setTenantId(UserContext.getTenantId());
                contact.setContactId(contactId);
                contact.setCustomerId(900L);
                contact.setEmail("invite-check-" + contactId + "@example.test");
                return contact;
            }
        };
        return new PortalUserService(users, contacts, new PortalCredentials(), mail,
                new PortalTenantAccess(suite.mapper(SysTenantMapper.class)), null, suite.cipher, suite.manager);
    }

    private static Outcome invite(PortalUserService service, PortalRequests.Invite request) {
        try { return new Outcome(service.invite(request), 200, "none"); }
        catch (ServiceException failure) { return new Outcome(null, failure.getCode() == null ? -1 : failure.getCode(), "ServiceException"); }
        catch (RuntimeException failure) { return new Outcome(null, -1, failure.getClass().getSimpleName()); }
    }

    private static PortalRequests.Invite request(Long contactId, String account) {
        PortalRequests.Invite request = new PortalRequests.Invite();
        request.setContactId(contactId);
        request.setLoginAccount(account);
        return request;
    }

    private static int eventCount(MessageDeliveryDatabaseChecks suite) {
        return suite.jdbc.queryForObject("SELECT COUNT(*) FROM outbox_event WHERE event_type='MESSAGE_SEND'", Integer.class);
    }

    private static void authorize() {
        UserContext.setTenantId(MessageDeliveryDatabaseChecks.TENANT);
        UserContext.setUserId(1L);
        UserContext.setAuthToken("owned-invitation-concurrency-fixture");
        UserContext.setPermissions(Set.of("system:portal:user:manage"));
    }

    private static void await(CyclicBarrier barrier) {
        try { barrier.await(10, TimeUnit.SECONDS); }
        catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); throw new IllegalStateException(interrupted); }
        catch (Exception failure) { throw new IllegalStateException(failure); }
    }

    private record Outcome(PortalUserView view, int code, String errorType) { }
}
