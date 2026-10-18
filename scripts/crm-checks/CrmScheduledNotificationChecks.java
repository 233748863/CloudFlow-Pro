package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.job.model.JobResult;
import com.cloudflow.common.message.api.MessageSendRequest;
import com.cloudflow.common.message.api.MessageSender;
import com.cloudflow.common.redis.config.RuntimeSysConfigService;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.common.tenant.support.TenantIterator;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmOpportunity;
import com.cloudflow.crm.domain.CrmReceivable;
import com.cloudflow.crm.domain.CrmServiceTicket;
import com.cloudflow.crm.domain.CrmSlaPolicy;
import com.cloudflow.crm.job.CrmCustomerOperationsJobs;
import com.cloudflow.crm.mapper.CrmCustomerMapper;
import com.cloudflow.crm.mapper.CrmOpportunityMapper;
import com.cloudflow.crm.mapper.CrmReceivableMapper;
import com.cloudflow.crm.mapper.CrmServiceTicketMapper;
import com.cloudflow.crm.mapper.CrmSlaPolicyMapper;
import com.cloudflow.crm.mapper.CrmStaffMapper;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

/** 真实任务、逐工单扫描及Spring事务模板；查询、消息和事务资源受控，非实际数据库验收。 */
public final class CrmScheduledNotificationChecks {
    private static int checks;
    private static final RuntimeSysConfigService CONFIG = new RuntimeSysConfigService(null) {
        @Override public int getInt(String key, int fallback) { return fallback; }
    };
    private static TenantIterator tenants() {
        return new TenantIterator(null) { @Override public List<Long> listActiveTenantIds() { return List.of(10L, 20L); } };
    }
    public static void main(String[] args) {
        for (Class<?> type : List.of(CrmCustomer.class, CrmReceivable.class, CrmOpportunity.class, CrmServiceTicket.class)) {
            TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), "crm-notification-checks"), type);
        }
        UserContext.setTenantId(9001L); TenantContext.setTenantId(9002L);
        try {
            daily(); wrappers(); sla(false); sla(true); boundaries();
            check(Objects.equals(UserContext.getTenantId(), 9001L) && Objects.equals(TenantContext.getTenantId(), 9002L), "caller contexts restored");
            System.out.println("CRM_SCHEDULED_NOTIFICATION_CHECKS: checks=" + checks + "; failed=0; real_jobs_and_scan=true; real_spring_transaction_template=true; controlled_business_and_transaction_resources=true; actual_database=false");
        } finally { UserContext.clear(); TenantContext.clear(); }
    }
    private static void daily() {
        List<String> calls = new ArrayList<>(); List<MessageSendRequest> messages = new ArrayList<>();
        boolean[] reject = { false }; RuntimeException original = new IllegalStateException("controlled registration failure");
        CrmCustomerMapper customers = proxy(CrmCustomerMapper.class, (proxy, method, values) -> {
            calls.add(TenantContext.getTenantId() + ":followup");
            CrmCustomer row = new CrmCustomer(); row.setTenantId(TenantContext.getTenantId()); row.setOwnerId(11L); row.setCustomerName("followup");
            return List.of(row);
        });
        CrmReceivableMapper receivables = proxy(CrmReceivableMapper.class, (proxy, method, values) -> {
            calls.add(TenantContext.getTenantId() + ":receivable");
            CrmReceivable row = new CrmReceivable(); row.setTenantId(TenantContext.getTenantId()); row.setOwnerId(11L);
            row.setDueDate(LocalDate.now()); row.setOutstandingAmount(BigDecimal.TEN); return List.of(row);
        });
        CrmOpportunityMapper opportunities = proxy(CrmOpportunityMapper.class, (proxy, method, values) -> {
            calls.add(TenantContext.getTenantId() + ":opportunity");
            CrmOpportunity owned = new CrmOpportunity(); owned.setTenantId(TenantContext.getTenantId()); owned.setOwnerId(11L);
            return List.of(owned, new CrmOpportunity());
        });
        MessageSender sender = request -> {
            if (reject[0] && TenantContext.getTenantId() == 10L && request.getTitle().contains("跟进逾期")) throw original;
            messages.add(request);
        };
        CrmNotificationServiceImpl service = new CrmNotificationServiceImpl(customers, receivables, opportunities, null, null, tenants(), sender, CONFIG, null);
        JobResult result = service.scheduledDispatch();
        check(result.getAffectedRows() == 6 && messages.size() == 6, "counts actual registrations and skips missing owners");
        check("CRM每日提醒完成：已提交6条提醒请求".equals(result.getResultMsg()), "daily summary counts requests");
        calls.clear(); messages.clear(); reject[0] = true;
        RuntimeException failure = caught(service::scheduledDispatch);
        check(failure.getSuppressed().length == 1 && failure.getSuppressed()[0].getCause() == original, "daily original registration error propagated");
        check(calls.equals(List.of("10:followup", "10:receivable", "10:opportunity", "20:followup", "20:receivable", "20:opportunity")), "later branch and tenant continue");
        check(messages.size() == 5 && failure.getSuppressed()[0].getMessage().contains("10"), "partial success retained with failed tenant");
        reject[0] = false;
        check(service.scheduledDispatch().getAffectedRows() == 6, "daily recovers after correction");
        TenantIterator empty = new TenantIterator(null) { @Override public List<Long> listActiveTenantIds() { return List.of(); } };
        check(new CrmNotificationServiceImpl(null,null,null,null,null,empty,null,null,null).scheduledDispatch().getAffectedRows() == 0, "no tenants means zero requests");
    }
    private static void wrappers() {
        for (boolean breach : List.of(false, true)) {
            List<Long> called = new ArrayList<>(); boolean[] reject = { false };
            RuntimeException original = new IllegalStateException("controlled tenant failure");
            CrmSlaService sla = new CrmSlaService(null,null,null,null,null,null,null,null,null) {
                private int operation() {
                    Long tenant = TenantContext.getTenantId(); called.add(tenant);
                    if (reject[0] && tenant == 10L) throw original;
                    return tenant == 10L ? 2 : 3;
                }
                @Override public int dispatchDue() { return operation(); }
                @Override public int scanBreaches() { return operation(); }
            };
            CrmNotificationServiceImpl notification = new CrmNotificationServiceImpl(null,null,null,null,null,tenants(),null,null,sla);
            CrmCustomerOperationsJobs operations = new CrmCustomerOperationsJobs(tenants(),null,sla,null,null,null);
            java.util.function.Supplier<JobResult> run = breach ? operations::slaBreachScan : notification::scheduledTicketSlaDispatch;
            JobResult result = run.get();
            check(result.getAffectedRows() == 5 && "SUCCESS".equals(result.getExecuteStatus()), "sum across tenants, breach=" + breach);
            check(result.getResultMsg().equals(breach ? "工单违约扫描完成：已更新5张工单" : "工单时限提醒完成：已提交5条提醒请求"), "correct business units, breach=" + breach);
            reject[0] = true; called.clear(); RuntimeException failure = caught(run::get);
            check(failure.getSuppressed().length == 1 && failure.getSuppressed()[0].getCause() == original, "tenant exception escapes, breach=" + breach);
            check(called.equals(List.of(10L,20L)), "other tenant continues, breach=" + breach);
            reject[0] = false; check(run.get().getAffectedRows() == 5, "tenant recovery, breach=" + breach);
        }
    }
    private static void sla(boolean breach) {
        RecordingTransactions transactions = new RecordingTransactions(); List<Long> visited = new ArrayList<>();
        boolean[] reject = { true }; RuntimeException original = new IllegalStateException("controlled ticket registration failure");
        CrmServiceTicketMapper mapper = proxy(CrmServiceTicketMapper.class, (proxy, method, values) -> {
            if (method.getName().equals("selectList")) return List.of(ticket(1L), ticket(2L), ticket(3L));
            if (method.getName().equals("lockById")) {
                check(TransactionSynchronizationManager.isActualTransactionActive(), "row lock is transactional");
                Long id = (Long) values[0]; visited.add(id); return ticket(id);
            }
            if (method.getName().equals("updateById")) { transactions.pendingUpdates++; return 1; }
            throw new AssertionError(method.getName());
        });
        CrmSlaService service = service(mapper, request -> {
            check(TransactionSynchronizationManager.isActualTransactionActive(), "message registration is transactional");
            if (reject[0] && request.getBizId().startsWith("1:")) throw original;
            transactions.pendingMessages++;
        }, transactions);
        RuntimeException failure = caught(() -> { if (breach) service.scanBreaches(); else service.dispatchDue(); });
        check(failure.getSuppressed().length == 1 && failure.getSuppressed()[0].getCause() == original, "original ticket cause retained");
        check(visited.equals(List.of(1L,2L,3L)) && failure.getSuppressed()[0].getMessage().contains("1"), "all later tickets continue");
        check(transactions.rollbacks == 1 && transactions.commits == 2, "only failed ticket rolls back");
        check(transactions.committedMessages == 2 && transactions.committedUpdates == (breach ? 2 : 0), "failed ticket updates and registration do not commit");
        reject[0] = false; visited.clear();
        check((breach ? service.scanBreaches() : service.dispatchDue()) == 3, "corrected three tickets return actual count");
        check(!TransactionSynchronizationManager.isActualTransactionActive(), "transaction context released");
    }
    private static void boundaries() {
        List<MessageSendRequest> requests = new ArrayList<>(); List<CrmServiceTicket> tickets = new ArrayList<>();
        CrmServiceTicket noOwner = ticket(10L); noOwner.setOwnerId(null); tickets.add(noOwner);
        CrmServiceTicket paused = ticket(11L); paused.setPauseStartTime(LocalDateTime.now().minusMinutes(20)); tickets.add(paused);
        CrmServiceTicket fulfilled = ticket(12L); fulfilled.setResolutionMinutes(60); fulfilled.setSlaStatus("FULFILLED"); tickets.add(fulfilled);
        CrmServiceTicket early = ticket(13L); early.setFirstResponseDue(LocalDateTime.now().plusDays(1)); tickets.add(early);
        CrmServiceTicket approaching = ticket(14L); approaching.setFirstResponseDue(LocalDateTime.now().plusMinutes(10)); tickets.add(approaching);
        CrmServiceTicket due = ticket(15L); tickets.add(due);
        CrmServiceTicketMapper mapper = proxy(CrmServiceTicketMapper.class, (proxy, method, values) -> method.getName().equals("selectList") ? tickets : tickets.stream().filter(row -> row.getTicketId().equals(values[0])).findFirst().orElseThrow());
        CrmSlaService service = service(mapper, requests::add, new RecordingTransactions());
        check(service.dispatchDue() == 2 && requests.size() == 2, "skip no-owner paused fulfilled and pre-threshold tickets");
        check(requests.stream().anyMatch(row -> "14:RESPONSE_APPROACHING".equals(row.getBizId())) && requests.stream().anyMatch(row -> "15:RESPONSE_DUE".equals(row.getBizId())), "approaching and due keep distinct business identity");
        check(requests.stream().allMatch(row -> "CRM_SLA_NOTICE".equals(row.getTemplateCode()) && row.getDeduplicationKey().equals("sla:" + row.getBizId())), "stable template and deduplication keys preserved");
        check(service.dispatchDue() == 2 && requests.size() == 4, "rescan counts registrations rather than inventing delivered message count");
    }
    private static CrmServiceTicket ticket(Long id) {
        CrmServiceTicket row = new CrmServiceTicket(); row.setTicketId(id); row.setTenantId(10L); row.setOwnerId(11L);
        row.setTicketTitle("controlled"); row.setSlaPolicyId(1L); row.setOpenedTime(LocalDateTime.now().truncatedTo(ChronoUnit.MINUTES).minusMinutes(100));
        row.setFirstResponseDue(LocalDateTime.now().truncatedTo(ChronoUnit.MINUTES).minusMinutes(10));
        row.setSlaPausedMinutes(0); row.setSlaStatus("ONGOING"); row.setResponseBreachedFlag(0); row.setResolutionBreachedFlag(0); return row;
    }
    private static CrmSlaService service(CrmServiceTicketMapper mapper, MessageSender sender, RecordingTransactions transactions) {
        CrmSlaPolicy policy = new CrmSlaPolicy(); policy.setPolicyId(1L); policy.setRoundTheClockFlag(1);
        return new CrmSlaService(new CrmSlaClock(null), null, proxy(CrmSlaPolicyMapper.class,(proxy,method,values) -> policy), mapper,
                proxy(CrmStaffMapper.class,(proxy,method,values) -> null), sender, null, CONFIG, new TransactionTemplate(transactions));
    }
    private static final class RecordingTransactions extends AbstractPlatformTransactionManager {
        private int pendingMessages, pendingUpdates, committedMessages, committedUpdates, commits, rollbacks;
        @Override protected Object doGetTransaction() { return new Object(); }
        @Override protected void doBegin(Object transaction, TransactionDefinition definition) { pendingMessages=0; pendingUpdates=0; }
        @Override protected void doCommit(DefaultTransactionStatus status) { committedMessages+=pendingMessages; committedUpdates+=pendingUpdates; commits++; }
        @Override protected void doRollback(DefaultTransactionStatus status) { pendingMessages=0; pendingUpdates=0; rollbacks++; }
    }
    private static RuntimeException caught(Runnable operation) { try { operation.run(); } catch(RuntimeException failure) { return failure; } throw new AssertionError("expected failure"); }
    private static <T> T proxy(Class<T> type, InvocationHandler handler) { return type.cast(Proxy.newProxyInstance(type.getClassLoader(),new Class<?>[]{type},handler)); }
    private static void check(boolean value, String label) { if(!value) throw new AssertionError(label); checks++; }
}
