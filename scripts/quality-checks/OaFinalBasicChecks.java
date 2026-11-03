package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.statemachine.config.StateMachineProperties;
import com.cloudflow.common.statemachine.core.StateMachineRegistry;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.oa.config.OaStateMachineConfig;
import com.cloudflow.oa.config.properties.OaProperties;
import com.cloudflow.oa.domain.BizExpenseClaim;
import com.cloudflow.oa.domain.BusinessTrip;
import com.cloudflow.oa.domain.OaMeetingAttendance;
import com.cloudflow.oa.domain.SysScheduleEvent;
import com.cloudflow.oa.domain.dto.MeetingCommands;
import com.cloudflow.oa.domain.vo.OaIdentityReference;
import com.cloudflow.oa.mapper.BizExpenseClaimMapper;
import com.cloudflow.oa.mapper.OaIdentityReferenceMapper;
import com.cloudflow.oa.mapper.OaMeetingAttendanceMapper;
import com.cloudflow.oa.mapper.OaMeetingMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.InputStream;
import java.io.Serializable;
import java.lang.reflect.Field;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicInteger;
import org.apache.ibatis.builder.xml.XMLMapperBuilder;
import org.apache.ibatis.mapping.BoundSql;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Only OC10 and OC12. Real service methods, controlled data/transaction resources. */
public final class OaFinalBasicChecks {
    private static int checks;

    public static void main(String[] args) throws Exception {
        UserContext.setUserId(1L);
        UserContext.setUserName("current-user");
        UserContext.setDeptId(999L);
        UserContext.setDeptName("current-department");
        UserContext.setTenantId(100L);
        TenantContext.setTenantId(100L);
        try {
            String scope = args.length > 1 ? args[1] : "all";
            if (!scope.equals("meeting")) {
                historicalApplicants();
                System.out.println("PASS: OC10 applicant checks=" + checks);
            }
            if (!scope.equals("applicant")) {
                meetingStages();
                mapperBoundary(Path.of(args[0]));
            }
            System.out.println("PASS: OA final basic checks=" + checks
                    + "; scope=" + scope + "; real_services=true; real_database=false");
        } finally {
            UserContext.clear();
            TenantContext.clear();
            TransactionSynchronizationManager.clear();
        }
    }

    private static void historicalApplicants() throws Exception {
        BusinessTrip trip = new BusinessTrip();
        trip.setId(7L); trip.setTenantId(100L); trip.setStatus("DRAFT");
        AtomicInteger tripWrites = new AtomicInteger();
        BusinessTripServiceImpl trips = new BusinessTripServiceImpl() {
            @Override public BusinessTrip getById(Serializable id) { return trip; }
            @Override public boolean updateById(BusinessTrip row) { tripWrites.incrementAndGet(); return false; }
        };
        forbidden(() -> trips.submitTrip(7L), "trip missing original applicant");
        equal(null, trip.getUserId(), "trip missing applicant is not replaced");
        equal("DRAFT", trip.getStatus(), "trip ownership rejection precedes transition");
        equal(0, tripWrites.get(), "trip missing applicant does not write");
        trip.setUserId(2L);
        forbidden(() -> trips.submitTrip(7L), "trip another applicant");
        equal(2L, trip.getUserId(), "trip other applicant remains unchanged");

        StateMachineRegistry registry = new StateMachineRegistry(null, new StateMachineProperties());
        new OaStateMachineConfig(registry).run();
        inject(trips, "stateMachineRegistry", registry);
        trip.setUserId(1L);
        equal(false, trips.submitTrip(7L), "owned trip reaches controlled write result");
        equal(1, tripWrites.get(), "owned trip takes normal write path once");
        equal(null, trip.getUserName(), "trip old missing name is not overwritten");
        equal(null, trip.getDeptId(), "trip old missing department is not overwritten");
        equal(null, trip.getDeptName(), "trip old missing department name is not overwritten");

        BizExpenseClaim claim = new BizExpenseClaim();
        claim.setId(8L); claim.setTenantId(100L); claim.setStatus("DRAFT");
        AtomicInteger identityLocks = new AtomicInteger();
        BizExpenseClaimMapper claims = proxy(BizExpenseClaimMapper.class, (target, method, values) -> {
            if (!method.getName().equals("lockClaim")) throw new AssertionError("Unexpected claim access: " + method.getName());
            equal(8L, values[0], "claim locked by requested ID");
            equal(100L, values[1], "claim lock uses trusted tenant");
            return claim;
        });
        ExpenseClaimServiceImpl expenses = new ExpenseClaimServiceImpl();
        inject(expenses, "baseMapper", claims);
        inject(expenses, "stateMachineRegistry", registry);
        inject(expenses, "identities", proxy(OaIdentityReferenceMapper.class, (target, method, values) -> {
            if (!method.getName().equals("userForUpdate")) throw new AssertionError("Unexpected applicant read");
            identityLocks.incrementAndGet();
            equal(1L, values[0], "owned claim locks original applicant");
            equal(100L, values[1], "applicant lock remains tenant scoped");
            return null;
        }));
        forbidden(() -> expenses.submitClaim(8L), "claim missing original applicant");
        equal(null, claim.getUserId(), "claim applicant not substituted");
        equal(0, identityLocks.get(), "missing applicant rejected before locking account");
        equal("DRAFT", claim.getStatus(), "missing applicant keeps draft state");
        claim.setUserId(2L);
        forbidden(() -> expenses.submitClaim(8L), "claim another applicant");
        equal(2L, claim.getUserId(), "foreign applicant unchanged");
        claim.setUserId(1L);
        rejected(() -> expenses.submitClaim(8L), IllegalArgumentException.class, "报销申请人不存在", "deleted original applicant rejected");
        equal(1, identityLocks.get(), "valid owner reaches original account check exactly once");
        equal(null, claim.getUserName(), "claim old missing name is not overwritten");
        equal(null, claim.getDeptId(), "claim old missing department is not overwritten");
        equal(null, claim.getDeptName(), "claim old missing department name is not overwritten");
        equal("DRAFT", claim.getStatus(), "invalid account does not submit claim");
    }

    private static void meetingStages() {
        Map<Long, OaIdentityReference> activeUsers = new LinkedHashMap<>();
        activeUsers.put(1L, person(1L, "Owner"));
        activeUsers.put(2L, person(2L, "Second"));
        activeUsers.put(3L, person(3L, "Third"));
        AtomicInteger batches = new AtomicInteger();
        List<Boolean> inTransaction = new ArrayList<>();
        OaIdentityReferenceMapper identities = proxy(OaIdentityReferenceMapper.class, (target, method, values) -> {
            if (!method.getName().equals("users")) throw new AssertionError("Per-user identity query is forbidden");
            batches.incrementAndGet();
            inTransaction.add(TransactionSynchronizationManager.isActualTransactionActive());
            equal(100L, values[1], "batch uses meeting tenant");
            List<?> ids = (List<?>) values[0];
            List<OaIdentityReference> found = new ArrayList<>();
            for (int index = ids.size() - 1; index >= 0; index--) {
                OaIdentityReference user = activeUsers.get(ids.get(index));
                if (user != null) found.add(user);
            }
            return found;
        });
        AtomicInteger attendeeReads = new AtomicInteger();
        List<OaMeetingAttendance> pending = new ArrayList<>();
        List<OaMeetingAttendance> committed = new ArrayList<>();
        OaMeetingMapper meetings = proxy(OaMeetingMapper.class, (target, method, values) -> {
            if (!method.getName().equals("attendees")) throw new AssertionError("Unexpected meeting query: " + method.getName());
            attendeeReads.incrementAndGet();
            equal(100L, values[0], "attendance read is tenant scoped");
            equal(77L, values[1], "attendance read uses actual event");
            return List.of();
        });
        OaMeetingAttendanceMapper attendance = proxy(OaMeetingAttendanceMapper.class, (target, method, values) -> {
            if (!method.getName().equals("insert")) throw new AssertionError("Unexpected attendance write");
            truth(TransactionSynchronizationManager.isActualTransactionActive(), "invitation write occurs inside transaction");
            pending.add((OaMeetingAttendance) values[0]);
            return 1;
        });
        ObjectMapper json = new ObjectMapper();
        OaMeetingInvitationService invitations = new OaMeetingInvitationService(meetings, attendance, identities, json);
        OaMeetingBookingService booking = new OaMeetingBookingService(null, null, null, invitations,
                null, null, null, identities, null, null, null, null, new OaProperties(), json);
        MeetingCommands.Booking command = command(List.of(3L, 2L));
        SysScheduleEvent event = booking.prepared(command, "PERSONAL", false);
        event.setEventId(77L); event.setScheduleVersion(4);
        equal(1, batches.get(), "preparation uses one batch for every participant");
        equal("[1,2,3]", event.getAttendees(), "preparation adds owner and sorts IDs");
        equal(List.of(3L, 2L), command.getAttendeeIds(), "caller participant list remains untouched");
        equal(3, event.getExpectedAttendees(), "expected count includes owner");
        equal(List.of(false), inTransaction, "preparation query is its own phase");
        rejected(() -> invitations.synchronize(event, List.of(1L, 2L, 3L)), IllegalStateException.class,
                "会议写入必须在数据库事务内执行", "invitation write requires transaction");
        equal(1, batches.get(), "missing transaction rejects before new reads");

        MemoryTransactions transactions = new MemoryTransactions(pending, committed);
        TransactionTemplate template = new TransactionTemplate(transactions);
        template.execute(status -> { invitations.synchronize(event, List.of(1L, 2L, 3L)); return null; });
        equal(2, batches.get(), "invitation phase performs a fresh single batch");
        equal(List.of(false, true), inTransaction, "both lifecycle phases retain separate validity checks");
        equal(1, attendeeReads.get(), "existing invitations fetched once");
        equal(3, committed.size(), "all participants saved by controlled resource");
        equal(List.of("Owner", "Second", "Third"), committed.stream().map(OaMeetingAttendance::getUserName).toList(),
                "unordered batch rows mapped to each correct participant");
        truth(committed.stream().allMatch(row -> Long.valueOf(100L).equals(row.getTenantId())
                && Long.valueOf(77L).equals(row.getScheduleEventId()) && Integer.valueOf(4).equals(row.getInvitationVersion())),
                "invitations retain tenant event and version");

        committed.clear();
        booking.prepared(command, "PERSONAL", false);
        activeUsers.remove(2L);
        rejected(() -> template.execute(status -> { invitations.synchronize(event, List.of(1L, 2L, 3L)); return null; }),
                IllegalArgumentException.class, "参会人不存在或已停用", "user disabled between phases rejected on second read");
        equal(4, batches.get(), "changed-user scenario still one batch in each phase");
        equal(1, transactions.rollbacks, "failed second phase rolls back controlled transaction");
        equal(0, committed.size(), "controlled transaction resource does not commit partial invitations");
        equal(0, pending.size(), "rollback clears staged attendance writes");
        rejected(() -> booking.prepared(command, "PERSONAL", false), ServiceException.class,
                "MEETING_ATTENDEES_INVALID", "missing/disabled participant rejected during preparation");
        equal(5, batches.get(), "invalid preparation needs one batch");
        int before = batches.get();
        rejected(() -> booking.prepared(command(List.of(2L, 2L)), "PERSONAL", false), ServiceException.class,
                "MEETING_ATTENDEES_INVALID", "duplicate participant refused before lookup");
        equal(before, batches.get(), "duplicate does not query identities");
        UserContext.setUserId(null);
        rejected(() -> booking.prepared(command(List.of(3L)), "PERSONAL", false), ServiceException.class,
                "登录上下文缺失", "meeting preparation requires logged-in owner");
        equal(before, batches.get(), "missing user context does not query identities");
        UserContext.setUserId(1L);
    }

    private static void mapperBoundary(Path source) throws Exception {
        MybatisConfiguration configuration = new MybatisConfiguration();
        try (InputStream stream = Files.newInputStream(source)) {
            new XMLMapperBuilder(stream, configuration, source.toString(), configuration.getSqlFragments()).parse();
        }
        BoundSql bound = configuration.getMappedStatement(OaIdentityReferenceMapper.class.getName() + ".users")
                .getBoundSql(Map.of("ids", List.of(1L, 2L, 3L), "tenantId", 100L));
        String sql = bound.getSql().replaceAll("\\s+", " ");
        truth(sql.contains("WHERE tenant_id = ? AND deleted = 0 AND status = '0'"),
                "actual batch SQL excludes foreign deleted and disabled users");
        truth(sql.matches(".*user_id IN \\( \\? , \\? , \\? \\)"), "actual batch SQL binds all selected IDs");
        equal(4, bound.getParameterMappings().size(), "actual batch query binds tenant plus three IDs");
    }

    private static MeetingCommands.Booking command(List<Long> ids) {
        MeetingCommands.Booking command = new MeetingCommands.Booking();
        command.setTitle("Final basic verification");
        command.setStartTime(LocalDateTime.now().plusDays(1).withNano(0));
        command.setEndTime(command.getStartTime().plusHours(1));
        command.setAttendeeIds(ids);
        return command;
    }

    private static OaIdentityReference person(Long id, String name) {
        OaIdentityReference row = new OaIdentityReference();
        row.setId(id); row.setUserId(id); row.setTenantId(100L); row.setName(name); return row;
    }

    private static final class MemoryTransactions extends AbstractPlatformTransactionManager {
        private final List<OaMeetingAttendance> pending;
        private final List<OaMeetingAttendance> committed;
        private int rollbacks;
        private MemoryTransactions(List<OaMeetingAttendance> pending, List<OaMeetingAttendance> committed) {
            this.pending = pending; this.committed = committed;
        }
        @Override protected Object doGetTransaction() { return new Object(); }
        @Override protected void doBegin(Object transaction, TransactionDefinition definition) { pending.clear(); }
        @Override protected void doCommit(DefaultTransactionStatus status) { committed.addAll(pending); pending.clear(); }
        @Override protected void doRollback(DefaultTransactionStatus status) { pending.clear(); rollbacks++; }
    }

    private static void inject(Object target, String name, Object value) throws Exception {
        for (Class<?> type = target.getClass(); type != null; type = type.getSuperclass()) {
            try { Field field = type.getDeclaredField(name); field.setAccessible(true); field.set(target, value); return; }
            catch (NoSuchFieldException ignored) { }
        }
        throw new NoSuchFieldException(name);
    }

    private static void forbidden(Runnable action, String label) {
        try { action.run(); }
        catch (ServiceException failure) { equal(403, failure.getCode(), label); return; }
        throw new AssertionError(label + ": expected ownership rejection");
    }

    private static void rejected(Runnable action, Class<? extends RuntimeException> type, String message, String label) {
        try { action.run(); }
        catch (RuntimeException failure) {
            if (!type.isInstance(failure) || failure.getMessage() == null || !failure.getMessage().contains(message)) {
                throw new AssertionError(label + ": unexpected failure", failure);
            }
            checks++; return;
        }
        throw new AssertionError(label + ": expected rejection");
    }

    private static <T> T proxy(Class<T> type, InvocationHandler handler) {
        return type.cast(Proxy.newProxyInstance(type.getClassLoader(), new Class<?>[]{type}, handler));
    }
    private static void truth(boolean result, String label) { checks++; if (!result) throw new AssertionError(label); }
    private static void equal(Object expected, Object actual, String label) {
        checks++; if (!Objects.equals(expected, actual)) throw new AssertionError(label + ": expected=" + expected + ", actual=" + actual);
    }
}
