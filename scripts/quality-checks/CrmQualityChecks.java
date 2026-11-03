package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.holiday.api.HolidayCalendarService;
import com.cloudflow.common.redis.core.SysDictHelper;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.crm.domain.*;
import com.cloudflow.crm.domain.vo.*;
import com.cloudflow.crm.exception.CrmBusinessException;
import com.cloudflow.crm.mapper.*;
import com.cloudflow.crm.service.ICrmCustomerService;
import com.cloudflow.crm.service.remote.RemoteOaService;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.apache.ibatis.builder.MapperBuilderAssistant;

/** 调用真实计算器及聚合服务；Mapper/远程输入受控，不连接数据库。 */
public final class CrmQualityChecks {
    private static int checks;
    public static void main(String[] args) {
        for (Class<?> entity : List.of(CrmCustomer.class, CrmContact.class, CrmFollowUp.class, CrmOpportunity.class,
                CrmQuote.class, CrmReceivable.class, CrmRenewal.class, CrmServiceTicket.class)) {
            TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), "crm-quality"), entity);
        }
        UserContext.setTenantId(100L); UserContext.setUserId(1L); UserContext.setUserName("quality");
        UserContext.setDsType(0); TenantContext.setTenantId(100L);
        try {
            health(); aging(); calendarFailure(); workspaceReuse();
            System.out.println("PASS: CRM quality checks=" + checks + "; actual_database=false");
        } finally { UserContext.clear(); TenantContext.clear(); }
    }

    private static void health() {
        LocalDateTime now = LocalDateTime.of(2026, 11, 3, 12, 0);
        CrmFollowUp follow = new CrmFollowUp(); follow.setFollowUpTime(now.minusDays(2)); follow.setNextFollowUpTime(now.plusDays(2));
        CrmHealthCalculator.HealthSnapshot healthy = CrmHealthCalculator.calculate(1L, List.of(follow), List.of(), List.of(), List.of(), now);
        equal("GREEN", healthy.level(), "recent followup without risks is healthy");
        equal("NORMAL", healthy.reasons().get(0).getCode(), "normal reason preserved");
        CrmRenewal renewal = new CrmRenewal(); renewal.setStatus("WON"); renewal.setCurrentExpireDate(now.toLocalDate().minusDays(5)); renewal.setNextExpireDate(now.toLocalDate().plusDays(60));
        CrmReceivable debt = receivable(31, "80", 1L, now.toLocalDate());
        CrmServiceTicket ticket = new CrmServiceTicket(); ticket.setStatus("OPEN"); ticket.setSeverity("P1"); ticket.setDueTime(now.minusHours(1));
        CrmHealthCalculator.HealthSnapshot risky = CrmHealthCalculator.calculate(1L, List.of(follow), List.of(renewal), List.of(debt), List.of(ticket), now);
        equal("RED", risky.level(), "red risks dominate the renewal warning");
        equal(4, risky.reasons().size(), "all independent reasons preserved");
        equal(false, risky.summary().contains("90天"), "summary contains dominant severity only");
        equal(now.toLocalDate().plusDays(60), CrmHealthCalculator.resolveRenewalDate(renewal), "won renewal uses next term");
        renewal.setStatus("LOST"); debt.setOutstandingAmount(BigDecimal.ZERO); ticket.setStatus("CLOSED");
        equal("GREEN", CrmHealthCalculator.calculate(1L, List.of(follow), List.of(renewal), List.of(debt), List.of(ticket), now).level(), "closed and settled facts release risks");
        follow.setFollowUpTime(now.minusDays(30));
        equal("YELLOW", CrmHealthCalculator.calculate(1L, List.of(follow), List.of(), List.of(), List.of(), now).level(), "thirty-day followup boundary preserved");
    }

    private static void aging() {
        LocalDate today = LocalDate.of(2026, 11, 3);
        int[] dictionaryReads = {0};
        SysDictHelper dictionaries = new SysDictHelper() { @Override public List<DictItem> getDictData(String type) { dictionaryReads[0]++; return List.of(); } };
        List<CrmReceivableAging.Tier> tiers = CrmReceivableAging.loadTiers(dictionaries);
        List<CrmReceivable> rows = List.of(receivable(0, "3", 1L, today), receivable(30, "5", 1L, today),
                receivable(31, "7", 1L, today), receivable(60, "11", 1L, today), receivable(90, "13", 2L, today),
                receivable(91, "17", 2L, today), receivable(120, "0", 3L, today));
        List<CrmReceivableAgingBucketVO> buckets = CrmReceivableAging.summarize(rows, tiers, today);
        equal(List.of("CURRENT", "DUE_TIER_1", "DUE_TIER_2", "DUE_TIER_3", "DUE_TIER_4"), buckets.stream().map(CrmReceivableAgingBucketVO::getBucketCode).toList(), "default bucket IDs match configured vocabulary");
        equal(List.of(new BigDecimal("3"), new BigDecimal("5"), new BigDecimal("18"), new BigDecimal("13"), new BigDecimal("17")), buckets.stream().map(CrmReceivableAgingBucketVO::getOutstandingAmount).toList(), "bucket totals at 30/60/90 boundaries");
        equal(1, buckets.get(2).getCustomerCount(), "same customer counted once within a tier");
        equal(1, dictionaryReads[0], "rules loaded once for allocation and totals");
        SysDictHelper.DictItem early = tier("10", 1); SysDictHelper.DictItem late = tier("40", 2);
        List<CrmReceivableAging.Tier> configured = CrmReceivableAging.loadTiers(dictionary(List.of(late, early)));
        equal("DUE_TIER_1", CrmReceivableAging.bucket(today.minusDays(10), today, configured), "configured upper bound is inclusive");
        equal("DUE_TIER_2", CrmReceivableAging.bucket(today.minusDays(100), today, configured), "configured overflow uses final tier");
        for (SysDictHelper.DictItem invalid : List.of(tier("1.5", 3), tier("0", 3), tier("30", 0))) {
            rejects(RuntimeException.class, () -> CrmReceivableAging.loadTiers(dictionary(List.of(invalid))), "ambiguous rules rejected");
        }
        rejects(RuntimeException.class, () -> CrmReceivableAging.loadTiers(dictionary(List.of(early, tier("20", 1)))), "duplicate IDs rejected");
    }

    private static void calendarFailure() {
        IllegalStateException original = new IllegalStateException("controlled calendar outage");
        HolidayCalendarService calendars = proxy(HolidayCalendarService.class, (target, method, values) -> { throw original; });
        CrmSlaPolicy policy = new CrmSlaPolicy(); policy.setPolicyId(1L); policy.setHolidayCalendarId(1L); policy.setRoundTheClockFlag(0); policy.setApplyForResolution(1);
        CrmSlaPriority priority = new CrmSlaPriority(); priority.setFirstResponseMinutes(30); priority.setResolutionMinutes(120);
        CrmSlaPolicyService policies = new CrmSlaPolicyService(null, null, null, null, null, null, null, null) {
            @Override public CrmSlaPolicy match(CrmServiceTicket ticket) { return policy; }
            @Override public CrmSlaPriority priority(Long id, String code) { return priority; }
            @Override public List<CrmSlaStatusRule> rules(Long id) { return List.of(); }
        };
        CrmSlaService service = new CrmSlaService(new CrmSlaClock(calendars), policies,
                proxy(CrmSlaPolicyMapper.class, (target, method, values) -> policy), null, null, request -> {}, null, null);
        CrmServiceTicket ticket = new CrmServiceTicket(); ticket.setOpenedTime(LocalDateTime.of(2026,11,3,9,0)); ticket.setSeverity("P1");
        RuntimeException failure = rejects(CrmBusinessException.class, () -> service.initialize(ticket), "calendar failure interrupts initialization");
        equal(original, failure.getCause(), "calendar cause retained");
        equal(null, ticket.getFirstResponseDue(), "failure does not invent a natural-time deadline");
        ticket.setSlaPolicyId(1L); ticket.setSlaPausedMinutes(0); ticket.setStatus("OPEN");
        ticket.setFirstResponseDue(LocalDateTime.now().minusHours(1));
        rejects(CrmBusinessException.class, () -> service.change(ticket, "OPEN", "P1", false), "elapsed calendar failure interrupts breach calculation");
        policy.setRoundTheClockFlag(1); service.initialize(ticket);
        equal(ticket.getOpenedTime().plusMinutes(30), ticket.getFirstResponseDue(), "explicit round-the-clock policy works without calendar");
    }

    private static void workspaceReuse() {
        Map<String,Integer> calls = new HashMap<>(); List<String> aggregateSql = new ArrayList<>();
        CrmCustomer first = customer(1L); CrmCustomer second = customer(2L);
        List<CrmCustomer> customers = List.of(first, second);
        ICrmCustomerService customerService = proxy(ICrmCustomerService.class, (target, method, values) -> {
            hit(calls, "access"); equal("getAccessibleCustomer", method.getName(), "workspace checks access once"); return first;
        });
        CrmCustomerMapper customerMapper = proxy(CrmCustomerMapper.class, (target, method, values) -> {
            hit(calls, method.getName());
            if (method.getName().equals("selectPageByDataScope")) { Page<CrmCustomer> page = new Page<>(1,200); page.setRecords(customers); return page; }
            if (method.getName().equals("update")) return 1;
            if (method.getName().equals("selectList")) { aggregateSql.add(((LambdaQueryWrapper<?>) values[0]).getSqlSegment()); return List.of(); }
            throw new AssertionError("Unexpected customer read: " + method.getName());
        });
        SysDictHelper dictionaries = new SysDictHelper() { @Override public List<DictItem> getDictData(String type) { hit(calls, "dict:"+type); return List.of(); } };
        RemoteOaService oa = proxy(RemoteOaService.class, (target, method, values) -> { hit(calls, method.getName()); return R.ok(PageResult.build(new Page<Object>(1, 10))); });
        CrmLostAnalysisService lost = new CrmLostAnalysisService(null,null,null,null,null) { @Override public Report report(LocalDate from, LocalDate to) { return new Report(List.of(),List.of(),List.of()); } };
        CrmCustomerWorkspaceServiceImpl service = new CrmCustomerWorkspaceServiceImpl(customerService, customerMapper,
                listing(CrmContactMapper.class,calls,aggregateSql), listing(CrmFollowUpMapper.class,calls,aggregateSql),
                listing(CrmOpportunityMapper.class,calls,aggregateSql), listing(CrmQuoteMapper.class,calls,aggregateSql),
                listing(CrmReceivableMapper.class,calls,aggregateSql), listing(CrmRenewalMapper.class,calls,aggregateSql),
                listing(CrmServiceTicketMapper.class,calls,aggregateSql), oa, dictionaries, lost, new CrmCustomerHealthService(customerMapper));
        CrmCustomerWorkspaceVO workspace = service.getWorkspace(1L);
        equal("YELLOW", workspace.getCustomer().getHealthLevel(), "workspace returns refreshed customer snapshot");
        equal(1, calls.get("access"), "one customer access read");
        for (String name : List.of("CrmContactMapper","CrmFollowUpMapper","CrmOpportunityMapper","CrmQuoteMapper","CrmReceivableMapper","CrmRenewalMapper","CrmServiceTicketMapper")) equal(1,calls.get(name),"one read for " + name);
        calls.clear(); aggregateSql.clear(); service.getDashboardSummary();
        equal(1,calls.get("selectPageByDataScope"),"dashboard loads accessible customers once");
        equal(2,calls.get("CrmContactMapper"),"each workspace built once across all panels");
        equal(2,calls.get("CrmFollowUpMapper"),"health reuses each workspace followup facts");
        equal(2,calls.get("update"),"one health refresh per displayed workspace");
        equal(2,calls.get("listContracts"),"remote contracts reused across dashboard panels");
        equal(2,calls.get("listInvoices"),"remote invoices reused across dashboard panels");
        equal(1,calls.get("dict:crm_receivable_overdue_tier"),"dashboard aging dictionary read once");
        equal(1L,aggregateSql.stream().filter(sql -> sql.contains("LIMIT 8")).count(),"pending quotes bounded in SQL");
        equal(4L,aggregateSql.stream().filter(sql -> sql.contains("LIMIT 10")).count(),"four dashboard lists bounded in SQL");
        for (String sql : aggregateSql) if (sql.contains("LIMIT")) equal(true,sql.contains("customer_id IN"),"bounded panels keep accessible customer scope");
        calls.clear(); aggregateSql.clear(); service.getDashboardWorkplace();
        equal(1,calls.get("selectPageByDataScope"),"workplace access list read once");
        equal(2,calls.get("CrmFollowUpMapper"),"todos and risks share workspaces");
        equal(2L,aggregateSql.stream().filter(sql -> sql.contains("LIMIT 4") && sql.contains("customer_id IN")).count(),"both activity streams retain scope and SQL bounds");
    }

    private static <T> T listing(Class<T> type, Map<String,Integer> calls, List<String> sql) {
        return proxy(type,(target,method,values)->{ equal("selectList",method.getName(),"list-only fact read"); hit(calls,type.getSimpleName()); LambdaQueryWrapper<?> query=(LambdaQueryWrapper<?>)values[0]; sql.add(query.getSqlSegment()); return List.of(); });
    }
    private static void hit(Map<String,Integer> calls,String name) { calls.merge(name,1,Integer::sum); }
    private static CrmCustomer customer(Long id) { CrmCustomer row=new CrmCustomer(); row.setCustomerId(id); row.setCustomerName("quality-"+id); row.setTenantId(100L); row.setDeleted(0); return row; }
    private static CrmReceivable receivable(int days,String amount,Long customer,LocalDate today) { CrmReceivable row=new CrmReceivable(); row.setCustomerId(customer); row.setDueDate(today.minusDays(days)); row.setOutstandingAmount(new BigDecimal(amount)); return row; }
    private static SysDictHelper.DictItem tier(String days,int sort) { SysDictHelper.DictItem item=new SysDictHelper.DictItem(); item.setValue(days); item.setSort(sort); item.setLabel("Tier "+sort); return item; }
    private static SysDictHelper dictionary(List<SysDictHelper.DictItem> items) { return new SysDictHelper(){@Override public List<DictItem> getDictData(String type){return items;}}; }
    private static <T> T proxy(Class<T> type,InvocationHandler handler) { return type.cast(Proxy.newProxyInstance(type.getClassLoader(),new Class<?>[]{type},handler)); }
    private static RuntimeException rejects(Class<? extends RuntimeException> type,Runnable action,String label) { try {action.run();} catch(RuntimeException failure) {equal(true,type.isInstance(failure),label);return failure;} throw new AssertionError(label); }
    private static void equal(Object expected,Object actual,String label) {checks++;if(!Objects.equals(expected,actual))throw new AssertionError(label+": expected="+expected+", actual="+actual);}
}
