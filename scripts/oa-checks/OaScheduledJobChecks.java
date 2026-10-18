package com.cloudflow.oa.job;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.job.model.JobResult;
import com.cloudflow.common.redis.core.SysConfigHelper;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.common.tenant.support.TenantIterator;
import com.cloudflow.oa.domain.OaContract;
import com.cloudflow.oa.domain.OaSealApplication;
import com.cloudflow.oa.mapper.OaContractMapper;
import com.cloudflow.oa.mapper.OaSealApplicationMapper;
import com.cloudflow.oa.service.IOaLicenseBorrowService;
import com.cloudflow.oa.service.IOaLicenseService;
import com.cloudflow.oa.service.IOaRiskAlertService;
import com.cloudflow.oa.service.IOaRiskScanService;
import com.cloudflow.oa.service.IOaSealApplicationService;
import com.cloudflow.oa.service.IOaSealService;
import com.cloudflow.oa.service.impl.OaRiskScanServiceImpl;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicInteger;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/** 真实任务循环、风险扫描和Spring事务拦截；业务查询、写入及事务资源为受控输入。 */
public final class OaScheduledJobChecks {
    private static int checks;
    public static void main(String[] args) {
        UserContext.setTenantId(9001L); TenantContext.setTenantId(9002L);
        try {
            for (int mode = 0; mode < 3; mode++) verifyJob(mode);
            verifyRiskTransaction();
            check(Objects.equals(UserContext.getTenantId(), 9001L) && Objects.equals(TenantContext.getTenantId(), 9002L), "caller tenant contexts retained");
            System.out.println("OA_SCHEDULED_JOB_CHECKS: checks=" + checks + "; failed=0; real_jobs_and_risk_scan=true; real_spring_transaction_interceptor=true; controlled_business_and_transaction_resources=true; actual_database=false");
        } finally { UserContext.clear(); TenantContext.clear(); }
    }
    private static void verifyJob(int mode) {
        List<String> calls = new ArrayList<>();
        boolean[] fail = { false };
        RuntimeException original = new IllegalStateException("controlled business failure");
        InvocationHandler operation = (proxy, method, arguments) -> {
            Long tenantId = TenantContext.getTenantId();
            if (!Objects.equals(tenantId, UserContext.getTenantId())) throw new AssertionError("tenant contexts disagree");
            String name = proxy.getClass().getInterfaces()[0].getSimpleName();
            calls.add(tenantId + ":" + name);
            if (fail[0] && tenantId == 10L && (name.equals("IOaSealApplicationService") || name.equals("IOaSealService") || name.equals("IOaRiskScanService"))) throw original;
            return tenantId == 10L ? 2 : 3;
        };
        TenantIterator tenants = new TenantIterator(null) { @Override public List<Long> listActiveTenantIds() { return List.of(10L, 20L); } };
        OaBorrowOverdueJob job = new OaBorrowOverdueJob(proxy(IOaSealApplicationService.class, operation), proxy(IOaSealService.class, operation),
                proxy(IOaLicenseBorrowService.class, operation), proxy(IOaLicenseService.class, operation), proxy(IOaRiskScanService.class, operation), tenants);
        JobResult result = invoke(job, mode);
        int expected = mode == 2 ? 5 : 10;
        check("SUCCESS".equals(result.getExecuteStatus()) && result.getAffectedRows() == expected, "actual sum is returned for mode " + mode);
        String summary = mode == 0 ? "借用逾期扫描完成：用印5份，证照借用5份" : mode == 1 ? "印章证照到期扫描完成：印章5条，证照5条提醒" : "合同风险扫描完成：新增5条风险";
        check(summary.equals(result.getResultMsg()), "business units and summary are accurate for mode " + mode);
        check(calls.size() == (mode == 2 ? 2 : 4), "every tenant and branch called for mode " + mode);
        calls.clear(); fail[0] = true; RuntimeException failure = null;
        try { invoke(job, mode); } catch (RuntimeException exception) { failure = exception; }
        check(failure != null && failure.getSuppressed().length == 1 && failure.getSuppressed()[0].getCause() == original, "original tenant exception escapes after aggregation for mode " + mode);
        check(calls.size() == (mode == 2 ? 2 : 4), "later branch and tenant still run after failure for mode " + mode);
        check(failure.getSuppressed()[0].getMessage().contains("10"), "failed tenant identified for mode " + mode);
        fail[0] = false; calls.clear();
        check(invoke(job, mode).getAffectedRows() == expected, "recovery recomputes count for mode " + mode);
        TenantIterator empty = new TenantIterator(null) { @Override public List<Long> listActiveTenantIds() { return List.of(); } };
        OaBorrowOverdueJob emptyJob = new OaBorrowOverdueJob(null, null, null, null, null, empty);
        check(invoke(emptyJob, mode).getAffectedRows() == 0, "no tenants means no invented result for mode " + mode);
    }
    private static JobResult invoke(OaBorrowOverdueJob job, int mode) {
        return switch (mode) { case 0 -> job.scanOverdueBorrows(); case 1 -> job.scanExpiringLicenses(); default -> job.scanContractRisks(); };
    }
    private static void verifyRiskTransaction() {
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), "oa-risk-checks"), OaContract.class);
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), "oa-seal-checks"), OaSealApplication.class);
        OaContract contract = new OaContract(); contract.setContractId(11L); contract.setTenantId(10L); contract.setOwnerId(12L);
        contract.setContractNo("controlled-risk"); contract.setContractName("controlled-risk"); contract.setEndDate(LocalDate.now().plusDays(20));
        AtomicInteger query = new AtomicInteger();
        OaContractMapper contracts = proxy(OaContractMapper.class, (proxy, method, arguments) -> {
            if (!method.getName().equals("selectList")) throw new AssertionError("unexpected contract query");
            return query.getAndIncrement() == 0 ? List.of(contract) : List.of();
        });
        OaSealApplicationMapper seals = proxy(OaSealApplicationMapper.class, (proxy, method, arguments) -> List.of());
        RecordingTransactions transactions = new RecordingTransactions();
        IOaRiskAlertService risks = proxy(IOaRiskAlertService.class, (proxy, method, arguments) -> {
            if (!method.getName().equals("createRuleRiskIfAbsent")) throw new AssertionError("unexpected risk operation");
            check(TransactionSynchronizationManager.isActualTransactionActive(), "risk record joins the scan transaction");
            transactions.pendingRisk++; return true;
        });
        SysConfigHelper config = new SysConfigHelper() { @Override public String getConfigValue(String key, String fallback) { return fallback; } };
        boolean[] reject = { true }; RuntimeException original = new IllegalStateException("controlled message registration failure");
        OaRiskScanServiceImpl target = new OaRiskScanServiceImpl(contracts, seals, risks, request -> {
            check(TransactionSynchronizationManager.isActualTransactionActive(), "message registration shares the risk transaction");
            if (reject[0]) throw original;
            transactions.pendingMessage++;
        }, null, config);
        ProxyFactory factory = new ProxyFactory(target); factory.setProxyTargetClass(true);
        factory.addAdvice(new TransactionInterceptor(transactions, new AnnotationTransactionAttributeSource()));
        IOaRiskScanService service = (IOaRiskScanService) factory.getProxy();
        RuntimeException failure = null;
        try { service.scanContractRisks(); } catch (RuntimeException exception) { failure = exception; }
        check(failure == original && transactions.rollbacks == 1 && transactions.commits == 0, "message registration failure triggers rollback and retains original cause");
        check(transactions.committedRisk == 0 && transactions.committedMessage == 0 && !TransactionSynchronizationManager.isActualTransactionActive(), "failed scan leaves no committed resource and releases transaction context");
        reject[0] = false; query.set(0);
        check(service.scanContractRisks() == 1 && transactions.commits == 1, "corrected scan retries and returns one risk");
        check(transactions.committedRisk == 1 && transactions.committedMessage == 1, "risk and message commit together");
    }
    private static final class RecordingTransactions extends AbstractPlatformTransactionManager {
        private int pendingRisk, pendingMessage, committedRisk, committedMessage, commits, rollbacks;
        @Override protected Object doGetTransaction() { return new Object(); }
        @Override protected void doBegin(Object transaction, TransactionDefinition definition) { pendingRisk = 0; pendingMessage = 0; }
        @Override protected void doCommit(DefaultTransactionStatus status) { committedRisk += pendingRisk; committedMessage += pendingMessage; commits++; }
        @Override protected void doRollback(DefaultTransactionStatus status) { pendingRisk = 0; pendingMessage = 0; rollbacks++; }
    }
    private static <T> T proxy(Class<T> type, InvocationHandler handler) { return type.cast(Proxy.newProxyInstance(type.getClassLoader(), new Class<?>[]{type}, handler)); }
    private static void check(boolean value, String label) { if (!value) throw new AssertionError(label); checks++; }
}
