package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.config.GlobalConfig;
import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.cloudflow.common.config.MybatisPlusConfig;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.datascope.DataScopeHandle;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxEventMapper;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.common.handler.MyMetaObjectHandler;
import com.cloudflow.common.statemachine.config.StateMachineProperties;
import com.cloudflow.common.statemachine.core.StateMachineRegistry;
import com.cloudflow.common.tenant.TenantConfigProperties;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.oa.config.OaStateMachineConfig;
import com.cloudflow.oa.domain.*;
import com.cloudflow.oa.domain.dto.OaMeetingDecision;
import com.cloudflow.oa.mapper.*;
import com.cloudflow.oa.service.*;
import com.cloudflow.oa.service.remote.RemoteBusinessRuleService;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.event.OaWorkflowEventListener;
import com.cloudflow.workflow.event.ProcessRevokedEvent;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.lang.reflect.Field;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.math.BigDecimal;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.apache.ibatis.session.LocalCacheScope;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Runs production services/SQL in an explicitly isolated schema, with only remote services controlled. */
public final class OaQualityDatabaseChecks {
    private static final long TENANT = 910000031L;
    private static final long OTHER_TENANT = 910000032L;
    private static final long USER = 910000041L;
    private static final long OTHER_USER = 910000042L;
    private static final LocalDate DATE = LocalDate.of(2026, 11, 3);
    private static final AtomicInteger CHECKS = new AtomicInteger();
    private final String marker = "quality-" + UUID.randomUUID().toString().substring(0, 8);
    private final ObjectMapper json = new ObjectMapper().findAndRegisterModules();
    private final JdbcTemplate jdbc;
    private final SqlSessionTemplate sessions;
    private final DataSourceTransactionManager transactions;
    private final BizExpenseClaimMapper claims;
    private final BizExpenseItemMapper items;
    private final OaIdentityReferenceMapper identities;
    private final IExpenseClaimService service;
    private volatile Long pausedClaim;
    private volatile Long failedClaim;
    private final CountDownLatch firstReady = new CountDownLatch(1);
    private final CountDownLatch firstRelease = new CountDownLatch(1);

    public static void main(String[] args) throws Exception {
        if (args.length != 2 || !args[0].matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/quality_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalArgumentException("Require a dedicated local quality_ schema URL and owned data directory");
        }
        OaQualityDatabaseChecks fixture = new OaQualityDatabaseChecks(args[0], args[1]);
        try {
            identity(TENANT, USER);
            fixture.setupIdentity();
            fixture.expenseTransactions();
            fixture.templateAndStandard();
            fixture.meetings();
            System.out.println("PASS: OA quality MySQL checks=" + CHECKS.get() + "; production_services_sql_and_transactions=true; remote_budget_rules_controlled=true");
        } finally {
            fixture.cleanup(); UserContext.clear(); TenantContext.clear();
        }
    }

    private OaQualityDatabaseChecks(String url, String directory) throws Exception {
        DriverManagerDataSource source = new DriverManagerDataSource(url, "root", "");
        jdbc = new JdbcTemplate(source);
        Path actual = Path.of(Objects.requireNonNull(jdbc.queryForObject("SELECT @@datadir", String.class))).toRealPath();
        Path expected = Path.of(directory).toRealPath();
        if (!actual.equals(expected) || !expected.toString().contains(".cloudflow-runtime")) throw new IllegalArgumentException("Unowned database directory");
        equal(0L, jdbc.queryForObject("SELECT COUNT(*) FROM sys_user WHERE user_id IN (?,?)", Long.class, USER, OTHER_USER), "test identity is unused");
        MybatisConfiguration config = new MybatisConfiguration();
        config.setMapUnderscoreToCamelCase(true); config.setLocalCacheScope(LocalCacheScope.STATEMENT);
        config.setLogImpl(org.apache.ibatis.logging.nologging.NoLoggingImpl.class);
        GlobalConfig global = new GlobalConfig();
        global.setDbConfig(new GlobalConfig.DbConfig().setLogicDeleteField("deleted").setLogicDeleteValue("1").setLogicNotDeleteValue("0"));
        global.setMetaObjectHandler(new MyMetaObjectHandler());
        com.baomidou.mybatisplus.core.toolkit.GlobalConfigUtils.setGlobalConfig(config, global);
        MybatisPlusConfig plugins = new MybatisPlusConfig(new TenantConfigProperties());
        set(plugins, "dataScopeHandle", (DataScopeHandle) scope -> {
            if (Objects.equals(UserContext.getDsType(), 0)) return true;
            scope.setUserId(UserContext.getUserId()); scope.setDeptList(List.of()); return false;
        });
        List<Class<?>> mapperTypes = List.of(BizExpenseClaimMapper.class, BizExpenseItemMapper.class,
                OaExpenseStandardMapper.class, OaContractTemplateMapper.class, OaIdentityReferenceMapper.class,
                OaMeetingMinutesMapper.class, OaMeetingAttendanceMapper.class, WorkTaskMapper.class, OutboxEventMapper.class);
        for (Class<?> mapper : mapperTypes) config.addMapper(mapper);
        List<Resource> resources = new ArrayList<>();
        for (String mapper : List.of("BizExpenseClaimMapper", "BizExpenseItemMapper", "OaContractTemplateMapper",
                "OaIdentityReferenceMapper", "OaMeetingMinutesMapper", "OutboxEventMapper")) resources.add(new ClassPathResource("mapper/" + mapper + ".xml"));
        MybatisSqlSessionFactoryBean factory = new MybatisSqlSessionFactoryBean();
        factory.setDataSource(source); factory.setConfiguration(config); factory.setGlobalConfig(global);
        factory.setPlugins(plugins.mybatisPlusInterceptor()); factory.setMapperLocations(resources.toArray(Resource[]::new));
        sessions = new SqlSessionTemplate(Objects.requireNonNull(factory.getObject()));
        transactions = new DataSourceTransactionManager(source);
        claims = sessions.getMapper(BizExpenseClaimMapper.class); items = sessions.getMapper(BizExpenseItemMapper.class);
        identities = sessions.getMapper(OaIdentityReferenceMapper.class);
        StateMachineRegistry registry = new StateMachineRegistry(null, new StateMachineProperties());
        new OaStateMachineConfig(registry).run();
        ExpenseClaimServiceImpl target = new ExpenseClaimServiceImpl();
        set(target, "baseMapper", claims); set(target, "expenseItemMapper", items); set(target, "identities", identities);
        set(target, "objectMapper", json); set(target, "stateMachineRegistry", registry);
        set(target, "remoteBusinessRuleService", proxy(RemoteBusinessRuleService.class, (object, method, values) -> R.ok()));
        set(target, "oaBudgetService", proxy(IOaBudgetService.class, (object, method, values) -> null));
        set(target, "oaExpenseStandardService", new OaExpenseStandardServiceImpl(sessions.getMapper(OaExpenseStandardMapper.class), items, identities));
        set(target, "outboxPublisher", new OutboxPublisher(sessions.getMapper(OutboxEventMapper.class), json) {
            @Override public void publish(BusinessEventEnvelope envelope) {
                equal(true, TransactionSynchronizationManager.isActualTransactionActive(), "event remains inside submit transaction");
                super.publish(envelope);
                if (Objects.equals(failedClaim, envelope.getSourceId())) throw new IllegalStateException("controlled outbox failure");
                if (Objects.equals(pausedClaim, envelope.getSourceId())) { firstReady.countDown(); await(firstRelease); }
            }
        });
        service = transactional(target, IExpenseClaimService.class);
    }

    private void setupIdentity() {
        jdbc.update("INSERT INTO sys_user(user_id,tenant_id,user_name,nick_name,status,deleted) VALUES(?,?,?,?, '0',0),(?,?,?,?, '0',0)",
                USER,TENANT,marker,"质量甲",OTHER_USER,OTHER_TENANT,marker+"b","质量乙");
    }

    private void expenseTransactions() throws Exception {
        jdbc.update("INSERT INTO oa_expense_standard(tenant_id,category,city,limit_amount,limit_type,status,deleted,version) VALUES(?, 'MEAL','上海',100,'DAILY','ACTIVE',0,0)", TENANT);
        long first = claim(TENANT,USER,"DRAFT","60","上海",DATE);
        long second = claim(TENANT,USER,"DRAFT","60","上海",DATE);
        pausedClaim = first;
        CountDownLatch secondEntered = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<Boolean> one = pool.submit(() -> { identity(TENANT,USER); try { return service.submitClaim(first); } finally { UserContext.clear();TenantContext.clear(); } });
            await(firstReady);
            Future<Boolean> two = pool.submit(() -> { identity(TENANT,USER); secondEntered.countDown(); try { return service.submitClaim(second); } finally { UserContext.clear();TenantContext.clear(); } });
            await(secondEntered);
            try { two.get(200,TimeUnit.MILLISECONDS); throw new AssertionError("second submit escaped applicant row lock"); }
            catch (java.util.concurrent.TimeoutException expected) { CHECKS.incrementAndGet(); }
            equal("DRAFT",status(first),"uncommitted first submit remains invisible");
            firstRelease.countDown(); equal(true,one.get(15,TimeUnit.SECONDS),"first submit succeeds"); equal(true,two.get(15,TimeUnit.SECONDS),"queued submit succeeds");
        } finally { firstRelease.countDown();pool.shutdownNow();pool.awaitTermination(15,TimeUnit.SECONDS);pausedClaim=null; }
        equal(new BigDecimal("0.00"),amount(first,"exceeded_amount"),"first claim is within limit");
        equal(new BigDecimal("20.00"),amount(second,"exceeded_amount"),"queued claim sees committed usage");
        equal(new BigDecimal("60.00"),amount(first,"total_amount"),"total derives from actual items");
        equal(2L,jdbc.queryForObject("SELECT COUNT(*) FROM outbox_event WHERE tenant_id=?",Long.class,TENANT),"both submissions persist real events");
        equal(new BigDecimal("120.00"),usage(),"pending claims occupy allowance");
        jdbc.update("UPDATE biz_expense_claim SET instance_id=? WHERE id=?",marker,first);
        WfProcessInstance instance=new WfProcessInstance();instance.setInstanceId(marker);instance.setBusinessKey("EXPENSE_CLAIM:"+first);
        OaWorkflowEventListener listener=new OaWorkflowEventListener();set(listener,"jdbcTemplate",jdbc);
        set(listener,"processInstanceMapper",proxy(WfProcessInstanceMapper.class,(object,method,values)->instance));
        listener.onProcessRevoked(new ProcessRevokedEvent(this,marker,"expense_claim",USER,"quality"));
        equal("CANCELLED",status(first),"actual withdrawal listener cancels claim");
        equal(new BigDecimal("60.00"),usage(),"withdrawal releases allowance");
        jdbc.update("UPDATE biz_expense_claim SET status='REJECTED' WHERE id=?",second);
        equal(BigDecimal.ZERO,usage(),"rejected claim releases allowance");
        long failure=claim(TENANT,USER,"DRAFT","25","上海",DATE);failedClaim=failure;
        rejects(() -> service.submitClaim(failure),"outbox failure rolls back submission");failedClaim=null;
        equal("DRAFT",status(failure),"failed claim remains draft");
        equal(2L,jdbc.queryForObject("SELECT COUNT(*) FROM outbox_event WHERE tenant_id=?",Long.class,TENANT),"failed outbox insert rolls back");
        equal(BigDecimal.ZERO,usage(),"failed submission consumes no allowance");
        long noCity=claim(TENANT,USER,"DRAFT","15",null,DATE); rejects(()->service.submitClaim(noCity),"missing city rejected");
        equal("DRAFT",status(noCity),"invalid input remains draft");
        long other=claim(OTHER_TENANT,OTHER_USER,"PENDING","1000","上海",DATE);
        equal(false,service.submitClaim(other),"foreign tenant claim inaccessible");equal(BigDecimal.ZERO,usage(),"foreign tenant costs excluded");
        long approved=claim(TENANT,USER,"APPROVED","7","上海",DATE);long paid=claim(TENANT,USER,"PAID","8","上海",DATE);
        claim(TENANT,USER,"PENDING","100","上海",DATE.minusDays(1));
        equal(new BigDecimal("15.00"),usage(),"approved/paid expenses count by occurrence date");
        jdbc.update("UPDATE biz_expense_claim SET status='PENDING' WHERE id=?",second);
        BizExpenseClaim forbidden=claims.selectById(second);forbidden.setItems(List.of());
        rejects(()->service.updateClaim(forbidden),"editing cannot replace submitted items");
        equal(1L,jdbc.queryForObject("SELECT COUNT(*) FROM biz_expense_item WHERE claim_id=?",Long.class,second),"failed edit preserves submitted detail");
    }

    private void templateAndStandard() {
        IOaContractTemplateService templates=transactional(new OaContractTemplateServiceImpl(sessions.getMapper(OaContractTemplateMapper.class)),IOaContractTemplateService.class);
        OaContractTemplate template=new OaContractTemplate();template.setTenantId(OTHER_TENANT);template.setTemplateCode(marker);template.setTemplateName("质量模板");template.setContent("Hello {{name}}");template.setVersion(0);
        equal(true,templates.save(template),"template saved");equal(TENANT,template.getTenantId(),"body cannot choose template tenant");
        for(int index=0;index<3;index++) jdbc.update("INSERT INTO oa_contract(tenant_id,template_id,contract_no,contract_name,contract_type,counterparty_name,deleted) VALUES(?,?,?,?,?,?,?)",
                index==2?OTHER_TENANT:TENANT,template.getId(),marker+index,"质量合同","SALES","质量客户",index==1?1:0);
        equal(1L,templates.getById(template.getId()).getUsageCount(),"usage counts only same-tenant active contracts");
        equal("Hello Alice",templates.renderContent(template.getId(),java.util.Map.of("name","Alice")),"render still substitutes declared variables");
        OaContractTemplate stale=templates.getById(template.getId());jdbc.update("UPDATE oa_contract_template SET version=version+1 WHERE id=?",template.getId());
        stale.setTemplateName("stale");equal(false,templates.update(stale),"stale template version fails");
        equal(true,templates.remove(template.getId()),"referenced template logically deleted");
        equal(1,jdbc.queryForObject("SELECT deleted FROM oa_contract_template WHERE id=?",Integer.class,template.getId()),"deleted flag persisted");
        equal(2,jdbc.queryForObject("SELECT version FROM oa_contract_template WHERE id=?",Integer.class,template.getId()),"deletion advances version");
        equal(3L,jdbc.queryForObject("SELECT COUNT(*) FROM oa_contract WHERE template_id=?",Long.class,template.getId()),"historical contracts preserved");
        identity(OTHER_TENANT,OTHER_USER);equal(null,templates.getById(template.getId()),"cross-tenant template inaccessible");identity(TENANT,USER);
        IOaExpenseStandardService standards=transactional(new OaExpenseStandardServiceImpl(sessions.getMapper(OaExpenseStandardMapper.class),items,identities),IOaExpenseStandardService.class);
        OaExpenseStandard standard=new OaExpenseStandard();standard.setTenantId(OTHER_TENANT);standard.setCategory("MEAL");standard.setLimitAmount(BigDecimal.TEN);standard.setLimitType("MONTHLY");standard.setVersion(0);
        equal(true,standards.save(standard),"standard saves");equal(TENANT,standard.getTenantId(),"body cannot choose standard tenant");
        equal(true,standards.remove(standard.getStandardId()),"standard logically deletes");equal(1,jdbc.queryForObject("SELECT deleted FROM oa_expense_standard WHERE standard_id=?",Integer.class,standard.getStandardId()),"standard deletion reaches database");
        UserContext.clear();TenantContext.clear();rejects(()->templates.save(template),"missing tenant rejected");identity(TENANT,USER);
    }

    private void meetings() throws Exception {
        WorkTaskMapper tasks=sessions.getMapper(WorkTaskMapper.class);
        AtomicInteger creates=new AtomicInteger();
        IWorkTaskService work=proxy(IWorkTaskService.class,(object,method,values)->{if(!method.getName().equals("save"))throw new AssertionError(method);creates.incrementAndGet();return tasks.insert((WorkTask)values[0])==1;});
        IOaMeetingMinutesService minutes=transactional(new OaMeetingMinutesServiceImpl(sessions.getMapper(OaMeetingMinutesMapper.class),sessions.getMapper(OaMeetingAttendanceMapper.class),work,json,null,identities,scope->true),IOaMeetingMinutesService.class);
        OaMeetingMinutes draft=new OaMeetingMinutes();draft.setMeetingTitle("质量会议");draft.setOrganizerId(USER);
        OaMeetingDecision decision=new OaMeetingDecision();decision.setTitle("复核报价");decision.setDueDate(DATE.plusDays(1));decision.setRemark("保留实际备注");decision.setOwnerId(USER);
        draft.setDecisions(json.writeValueAsString(List.of(decision)));equal(true,minutes.save(draft),"independent minutes saved");
        equal(null,minutes.getDetail(draft.getId()).getScheduleEventId(),"independent minutes require no fabricated meeting ID");
        equal(true,minutes.confirm(draft.getId()),"minutes confirmed");
        List<Long> created=minutes.dispatchDecisionsToWorkTasks(draft.getId(),List.of(decision));
        WorkTask task=tasks.selectById(created.get(0));equal(DATE.plusDays(1).atStartOfDay(),task.getDueDate(),"dueDate reaches actual task");
        equal(true,task.getDescription().contains("保留实际备注"),"remark reaches actual task");
        OaMeetingDecision repeated=new OaMeetingDecision();repeated.setTitle("旧请求");repeated.setOwnerId(USER);
        equal(created,minutes.dispatchDecisionsToWorkTasks(draft.getId(),List.of(repeated)),"repeat dispatch reuses server task ID");equal(1,creates.get(),"repeat dispatch creates no second task");
        OaMeetingMinutes malformed=new OaMeetingMinutes();malformed.setMeetingTitle("坏决议");malformed.setDecisions("[{\"title\":\"x\",\"deadline\":\"2026-11-04\"}]");
        rejects(()->minutes.save(malformed),"old date alias rejected instead of ignored");
        OaMeetingMinutes update=minutes.getDetail(draft.getId());update.setStatus("DRAFT");update.setVersion(-1);rejects(()->minutes.update(update),"stale meeting version rejected");
        identity(OTHER_TENANT,OTHER_USER);rejects(()->minutes.getDetail(draft.getId()),"foreign tenant minutes hidden");identity(TENANT,USER);
        equal(true,minutes.remove(draft.getId()),"minutes logically delete");equal(1,jdbc.queryForObject("SELECT deleted FROM oa_meeting_minutes WHERE id=?",Integer.class,draft.getId()),"minutes deletion persisted");
    }

    private long claim(long tenant,long user,String status,String amount,String city,LocalDate date) {
        String number=marker+"-"+UUID.randomUUID().toString().substring(0,8);
        jdbc.update("INSERT INTO biz_expense_claim(tenant_id,user_id,user_name,claim_no,category,total_amount,status,deleted,version) VALUES(?,?,?,?,'OFFICE',999,?,0,0)",tenant,user,"quality",number,status);
        Long id=jdbc.queryForObject("SELECT id FROM biz_expense_claim WHERE claim_no=?",Long.class,number);
        jdbc.update("INSERT INTO biz_expense_item(tenant_id,claim_id,expense_type,amount,expense_date,city) VALUES(?,?,'MEAL',?,?,?)",tenant,id,new BigDecimal(amount),date,city);return Objects.requireNonNull(id);
    }
    private BigDecimal usage() { return items.selectCommittedUsage(TENANT,USER,-1L,DATE,DATE.plusDays(1),Set.of("MEAL")).stream().map(BizExpenseItem::getAmount).reduce(BigDecimal.ZERO,BigDecimal::add); }
    private String status(long id) { return jdbc.queryForObject("SELECT status FROM biz_expense_claim WHERE id=?",String.class,id); }
    private BigDecimal amount(long id,String field) { if(!Set.of("exceeded_amount","total_amount").contains(field))throw new IllegalArgumentException();return jdbc.queryForObject("SELECT "+field+" FROM biz_expense_claim WHERE id=?",BigDecimal.class,id); }
    private void cleanup() { for(String table:List.of("outbox_event","biz_expense_item","biz_expense_claim","oa_contract","oa_contract_template","oa_expense_standard","oa_meeting_minutes","oa_work_task","sys_user"))jdbc.update("DELETE FROM "+table+" WHERE tenant_id IN (?,?)",TENANT,OTHER_TENANT); }
    private <T> T transactional(Object target,Class<T> type) { ProxyFactory proxy=new ProxyFactory(target);proxy.setInterfaces(type);proxy.addAdvice(new TransactionInterceptor(transactions,new AnnotationTransactionAttributeSource()));return type.cast(proxy.getProxy()); }
    private static void identity(long tenant,long user) { UserContext.setTenantId(tenant);UserContext.setUserId(user);UserContext.setUserName("quality");UserContext.setDsType(0);TenantContext.setTenantId(tenant); }
    private static <T> T proxy(Class<T> type,InvocationHandler handler) { return type.cast(Proxy.newProxyInstance(type.getClassLoader(),new Class<?>[]{type},handler)); }
    private static void set(Object target,String name,Object value) { for(Class<?> type=target.getClass();type!=Object.class;type=type.getSuperclass())try{Field field=type.getDeclaredField(name);field.setAccessible(true);field.set(target,value);return;}catch(NoSuchFieldException ignored){}catch(ReflectiveOperationException failure){throw new IllegalStateException(failure);}throw new IllegalArgumentException(name); }
    private static void await(CountDownLatch latch) { try{if(!latch.await(15,TimeUnit.SECONDS))throw new AssertionError("Timed out waiting for controlled transaction boundary");}catch(InterruptedException failure){Thread.currentThread().interrupt();throw new IllegalStateException(failure);} }
    private static void rejects(Runnable action,String label) { try{action.run();}catch(RuntimeException expected){CHECKS.incrementAndGet();return;}throw new AssertionError(label); }
    private static void equal(Object expected,Object actual,String label) { CHECKS.incrementAndGet();if(!Objects.equals(expected,actual))throw new AssertionError(label+": expected="+expected+", actual="+actual); }
}
