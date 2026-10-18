package com.cloudflow.crm.service.impl;

import cn.dev33.satoken.stp.StpLogic;
import cn.dev33.satoken.stp.StpUtil;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.config.GlobalConfig;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.baomidou.mybatisplus.core.toolkit.GlobalConfigUtils;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.cloudflow.common.config.MybatisPlusConfig;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.datascope.DataScopeHandle;
import com.cloudflow.common.datascope.RedisDataScopeHandle;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.common.handler.MyMetaObjectHandler;
import com.cloudflow.common.holiday.api.HolidayCalendarService;
import com.cloudflow.common.holiday.mapper.*;
import com.cloudflow.common.holiday.service.HolidayCalendarServiceImpl;
import com.cloudflow.common.message.api.MessageSender;
import com.cloudflow.common.message.config.MessageAutoConfiguration;
import com.cloudflow.common.redis.config.RuntimeSysConfigService;
import com.cloudflow.common.redis.core.SysConfigHelper;
import com.cloudflow.common.redis.core.SysDictHelper;
import com.cloudflow.common.redis.core.UserDataScopeStore;
import com.cloudflow.common.statemachine.core.StateMachineRegistry;
import com.cloudflow.common.tenant.TenantConfigProperties;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.crm.config.CrmStateMachineConfig;
import com.cloudflow.crm.domain.*;
import com.cloudflow.crm.domain.dto.InternalWorkflowStartDTO;
import com.cloudflow.crm.domain.vo.HrEmployeeSummaryVO;
import com.cloudflow.crm.mapper.*;
import com.cloudflow.crm.service.*;
import com.cloudflow.crm.service.remote.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.core.ResolvableType;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.math.BigDecimal;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

import static com.cloudflow.crm.service.impl.CrmOperationsChecks.*;

public final class CrmOperationsDatabaseChecks {
    final Map<Class<?>, Object> beans = new HashMap<>();
    final ObjectMapper json = new ObjectMapper().findAndRegisterModules();
    final JdbcTemplate jdbc;
    final CrmRefundWorkflowFixture refundWorkflow;
    final SqlSessionTemplate sessions;
    final PlatformTransactionManager manager;
    final Map<String, CrmBusinessRuleClient.Rule> rules = new ConcurrentHashMap<>();
    final List<CrmBusinessRuleClient.Hit> hits = new CopyOnWriteArrayList<>();
    final Map<Long, CrmContractOriginClient.Origin> origins = new ConcurrentHashMap<>();
    final AtomicInteger workflowCalls = new AtomicInteger();
    final AtomicInteger contractCalls = new AtomicInteger();
    final AtomicInteger receiptNotifications = new AtomicInteger();
    final Map<Long, RemoteOaService.ContractInfo> contractDetails = new ConcurrentHashMap<>();
    volatile boolean failContractDetails;
    volatile boolean failOrigins;
    final Map<Long, HrEmployeeSummaryVO> employeeDirectory = new ConcurrentHashMap<>();
    final Set<Long> missingEmployees = ConcurrentHashMap.newKeySet();
    volatile boolean failEmployees;

    public static void run(String url) throws Exception {
        CrmOperationsDatabaseChecks fixture = new CrmOperationsDatabaseChecks(url);
        CrmActivitiesDatabaseChecks.run(fixture);
        CrmCommercialDatabaseChecks.run(fixture);
        CrmOpportunityDatabaseChecks.run(fixture);
        CrmStageReportingDatabaseChecks.run(fixture);
        CrmDealLedgerDatabaseChecks.run(fixture);
        CrmContractPerformanceDatabaseChecks.run(fixture);
        CrmDealTeamDatabaseChecks.run(fixture);
        CrmQuoteTeamDatabaseChecks.run(fixture);
        CrmQuoteContractLinkDatabaseChecks.run(fixture);
        CrmDealHandoverDatabaseChecks.run(fixture);
        CrmReceivableDatabaseChecks.run(fixture);
        CrmReceivableTeamDatabaseChecks.run(fixture);
        CrmInvoiceReceiptDatabaseChecks.run(fixture);
        CrmReceiptRefundDatabaseChecks.run(fixture);
        CrmRefundWorkflowDatabaseChecks.run(fixture);
        CrmSalesTargetDatabaseChecks.run(fixture);
        CrmOpportunityReopenDatabaseChecks.run(fixture);
        CrmOpportunityReopenFinanceDatabaseChecks.run(fixture);
        CrmPerformanceDatabaseChecks.run(fixture);
        try { CrmPortalTicketDatabaseChecks.run(fixture); }
        finally {
            if (cn.dev33.satoken.SaManager.getSaTokenDao() instanceof cn.dev33.satoken.dao.SaTokenDaoDefaultImpl tokenStore) tokenStore.destroy();
        }
        System.out.println("PASS: isolated CRM services with real tenant/data-scope SQL and transactions");
    }

    private CrmOperationsDatabaseChecks(String url) throws Exception {
        if (!url.startsWith("jdbc:mysql://127.0.0.1:")) throw new IllegalArgumentException("Only isolated loopback database is allowed");
        DriverManagerDataSource source = new DriverManagerDataSource(url, "root", "");
        jdbc = new JdbcTemplate(source);
        String expectedDirectory = System.getProperty("cloudflow.crm.check.dataDirectory", "");
        if (expectedDirectory.isBlank()) throw new IllegalArgumentException("Isolated database directory must be supplied by verify-batch-e-db.ps1");
        Path expected = Path.of(expectedDirectory).toRealPath();
        Path actual = Path.of(jdbc.queryForObject("SELECT @@datadir", String.class)).toRealPath();
        if (!expected.equals(actual) || !expected.getFileName().toString().equals("data")
                || !expected.getParent().getFileName().toString().matches("batch-e-mysql-[a-f0-9]{32}"))
            throw new IllegalArgumentException("Database must match the new isolated directory created by verify-batch-e-db.ps1");
        refundWorkflow = new CrmRefundWorkflowFixture(this);
        MybatisConfiguration configuration = new MybatisConfiguration(); configuration.setMapUnderscoreToCamelCase(true);
        configuration.setLogImpl(org.apache.ibatis.logging.nologging.NoLoggingImpl.class);
        GlobalConfig global = new GlobalConfig();
        global.setDbConfig(new GlobalConfig.DbConfig().setLogicDeleteField("deleted").setLogicDeleteValue("1").setLogicNotDeleteValue("0"));
        global.setMetaObjectHandler(new MyMetaObjectHandler());
        // BaseMapper statements are generated during registration and must see the production delete policy.
        GlobalConfigUtils.setGlobalConfig(configuration, global);
        configuration.addMappers("com.cloudflow.crm.mapper"); configuration.addMappers("com.cloudflow.common.holiday.mapper");
        configuration.addMappers("com.cloudflow.common.event.outbox"); configuration.addMappers("com.cloudflow.common.audit.mapper");
        MybatisPlusConfig pluginConfiguration = new MybatisPlusConfig(new TenantConfigProperties());
        DataScopeHandle dataScopeHandle = new RedisDataScopeHandle(new UserDataScopeStore(null) {
            @Override public <T> T get(Long tenantId, Long userId) { return null; }
        });
        set(pluginConfiguration, "dataScopeHandle", dataScopeHandle);
        MybatisSqlSessionFactoryBean factory = new MybatisSqlSessionFactoryBean();
        factory.setDataSource(source); factory.setConfiguration(configuration); factory.setGlobalConfig(global);
        factory.setPlugins(pluginConfiguration.mybatisPlusInterceptor());
        factory.setMapperLocations(new PathMatchingResourcePatternResolver().getResources("classpath*:mapper/**/*Mapper.xml"));
        sessions = new SqlSessionTemplate(factory.getObject()); manager = new DataSourceTransactionManager(source);
        check(TableInfoHelper.getTableInfo(CrmActivityParticipant.class).isWithLogicDelete(), "participant mapper uses production logical deletion");
        beans.put(PlatformTransactionManager.class, manager); beans.put(TransactionTemplate.class, new TransactionTemplate(manager));
        beans.put(DataScopeHandle.class, dataScopeHandle);
        beans.put(ObjectMapper.class, json); beans.put(SysDictHelper.class, emptyDictionaries());
        SysConfigHelper settings = new SysConfigHelper() {
            @Override public String getConfigValue(String key, String fallback) { return fallback; }
            @Override public int getConfigInt(String key, int fallback) { return fallback; }
            @Override public boolean getConfigBoolean(String key, boolean fallback) { return fallback; }
        };
        beans.put(SysConfigHelper.class, settings); beans.put(RuntimeSysConfigService.class, new RuntimeSysConfigService(settings));
        StpUtil.setStpLogic(new StpLogic("crm-check") { @Override public boolean hasPermission(String permission) { return false; } });
        beans.put(RemoteHrService.class, proxy(RemoteHrService.class, (method, values) -> {
            if (failEmployees) return R.fail("HR unavailable fixture");
            if ("getEmployeeByUserId".equals(method)) return R.ok(employee((Long) values[0]));
            if ("listEmployeesByUserIds".equals(method)) return R.ok(((List<Long>) values[0]).stream().map(this::employee).filter(Objects::nonNull).toList());
            throw new IllegalStateException("Unexpected HR call " + method);
        }));
        beans.put(RemoteWorkflowService.class, proxy(RemoteWorkflowService.class, (method, values) -> {
            equal(false, TransactionSynchronizationManager.isActualTransactionActive(), "workflow call occurs outside database transaction");
            workflowCalls.incrementAndGet();
            if (values[0] instanceof InternalWorkflowStartDTO request) {
                String instanceId = "crm-workflow-" + request.getVariables().get("approvalId");
                if (com.cloudflow.crm.constant.CrmBusinessTypes.CRM_REFUND.equals(request.getVariables().get("businessType"))) refundWorkflow.start(request, instanceId);
                return R.ok(instanceId);
            }
            return R.ok("crm-quote-workflow");
        }));
        beans.put(RemoteOaService.class, proxy(RemoteOaService.class, (method, values) -> {
            if ("createContract".equals(method)) return R.ok(900000L + contractCalls.incrementAndGet());
            if ("getContract".equals(method)) {
                if (failContractDetails) return R.fail("OA unavailable fixture");
                if (contractDetails.containsKey((Long) values[0])) return R.ok(contractDetails.get((Long) values[0]));
                RemoteOaService.ContractInfo contract = new RemoteOaService.ContractInfo(); contract.setContractId((Long) values[0]);
                contract.setContractNo("CHECK-CONTRACT"); return R.ok(contract);
            }
            throw new IllegalStateException("Unexpected OA call " + method);
        }));
        beans.put(CrmContractOriginClient.class, proxy(CrmContractOriginClient.class, (method, values) -> failOrigins ? null
                : R.ok(((List<?>) values[0]).stream().map(origins::get).filter(Objects::nonNull).toList())));
        beans.put(CrmEventPublisher.class, proxy(CrmEventPublisher.class, (method, values) -> {
            if ("publish".equals(method) && "ReceivableConfirmed".equals(values[0])) receiptNotifications.incrementAndGet();
            return null;
        }));
        beans.put(CrmBusinessRuleClient.class, proxy(CrmBusinessRuleClient.class, (method, values) -> {
            if ("effective".equals(method)) return R.ok(rules.get((String) values[0]));
            hits.add((CrmBusinessRuleClient.Hit) values[0]); return R.ok();
        }));
        register(OutboxPublisher.class); register(CrmAuditTrail.class); register(CrmRuleService.class); register(CrmReferenceService.class);
        StandardEnvironment environment = new StandardEnvironment();
        environment.getPropertySources().addFirst(new MapPropertySource("crm-checks", Map.of("spring.application.name", "cloudflow-service-crm")));
        beans.put(MessageSender.class, new MessageAutoConfiguration().messageSender(bean(OutboxPublisher.class), json, environment));
        beans.put(com.cloudflow.common.message.security.MessageSecretCipher.class, new MessageAutoConfiguration().messageSecretCipher(environment));
        beans.put(HolidayCalendarService.class, new HolidayCalendarServiceImpl(mapper(HolidayCalendarMapper.class), mapper(HolidayDateMapper.class), mapper(HolidayResolverMapper.class), null));
        register(CrmSlaClock.class); register(CrmSlaPriorityCatalog.class); register(CrmSlaPolicyService.class); register(CrmSlaService.class);
        register(com.cloudflow.crm.service.opportunity.CrmSalesStageService.class);
        register(com.cloudflow.crm.service.opportunity.CrmOpportunityAccessService.class);
        register(com.cloudflow.crm.service.deal.CrmDealLedgerService.class);
        register(com.cloudflow.crm.service.opportunity.CrmOpportunityReopenLedgerService.class);
        register(com.cloudflow.crm.service.opportunity.CrmOpportunityReopenFinanceService.class);
        register(CrmCampaignWonService.class);
        register(com.cloudflow.crm.service.deal.CrmContractPerformanceService.class);
        register(com.cloudflow.crm.service.deal.CrmDealMemberResolver.class);
        register(com.cloudflow.crm.service.deal.CrmReceiptAchievementService.class);
        register(CrmSalesTargetServiceImpl.class);
        register(CrmPerformanceQueryServiceImpl.class);
        register(com.cloudflow.crm.service.deal.CrmDealTeamStore.class);
        register(com.cloudflow.crm.service.deal.CrmQuoteAccessService.class);
        register(com.cloudflow.crm.service.deal.CrmQuoteContractLinkService.class);
        register(com.cloudflow.crm.service.receivable.CrmReceivableAccessService.class);
        register(com.cloudflow.crm.service.deal.CrmReceivableTeamService.class);
        register(com.cloudflow.crm.service.receivable.CrmReceivableReceiptService.class);
        register(com.cloudflow.crm.service.receivable.CrmRefundWorkflowService.class);
        register(com.cloudflow.crm.service.receivable.CrmRefundService.class);
        register(com.cloudflow.crm.service.deal.CrmQuoteTeamService.class);
        register(com.cloudflow.crm.service.deal.CrmDealHandoverService.class);
        register(com.cloudflow.crm.service.deal.CrmOpportunityTeamService.class);
        register(com.cloudflow.crm.service.opportunity.CrmOpportunityStageService.class);
        register(com.cloudflow.crm.service.opportunity.CrmOpportunityItemService.class);
        register(com.cloudflow.crm.service.opportunity.CrmStageAnalysisService.class);
        register(CrmLostAnalysisService.class); register(CrmApprovalInstanceBinder.class); register(CrmApprovalServiceImpl.class); register(CrmCreditService.class); register(CrmCreditApprovalHandler.class);
        register(CrmTerritoryService.class); register(CrmProfileService.class); register(CrmLeadScoreService.class); register(CrmLeadQualificationService.class);
        register(CrmAudienceService.class); register(CrmTargetListService.class); register(CrmCampaignRevenueService.class);
        register(com.cloudflow.crm.service.email.CrmEmailAccessService.class);
        register(com.cloudflow.crm.service.opportunity.CrmOpportunityReminderService.class);
        register(com.cloudflow.crm.service.email.CrmEmailAudienceService.class);
        register(com.cloudflow.crm.service.email.CrmEmailStatisticsService.class); register(CrmCampaignService.class);
        StateMachineRegistry registry = new StateMachineRegistry(type -> Set.of(), new com.cloudflow.common.statemachine.config.StateMachineProperties());
        new CrmStateMachineConfig(registry).run(); beans.put(StateMachineRegistry.class, registry);
        register(CrmCustomerServiceImpl.class); register(CrmFollowUpServiceImpl.class); register(CrmContactServiceImpl.class);
        beans.put(com.cloudflow.common.security.portal.PortalTokens.class, new com.cloudflow.common.security.portal.PortalTokens());
        beans.put(RemotePortalTicketFiles.class, proxy(RemotePortalTicketFiles.class, (method, values) -> { throw new IllegalStateException("File bytes require separate real HTTP verification"); }));
        register(CrmServiceTicketServiceImpl.class); register(CrmPortalTicketService.class); register(CrmPortalTicketManagement.class);
        register(com.cloudflow.crm.service.opportunity.CrmOpportunityWriteService.class);
        register(com.cloudflow.crm.service.opportunity.CrmOpportunityReopenService.class);
        register(CrmOpportunityServiceImpl.class); register(CrmLeadServiceImpl.class); register(CrmQuoteServiceImpl.class);
        register(com.cloudflow.crm.service.receivable.CrmInvoiceReceiptService.class);
        register(CrmReceivableServiceImpl.class); register(CrmRefundApprovalHandler.class); register(CrmCrossModuleDraftServiceImpl.class);
        register(CrmHandoverTaskServiceImpl.class);
        register(CrmOpportunityDowngradeApprovalHandler.class); register(CrmActivityService.class); register(CrmActivityReminderService.class); register(CrmActivityMessageSourceService.class);
    }

    HrEmployeeSummaryVO employee(Long userId) {
        if (missingEmployees.contains(userId)) return null;
        if (employeeDirectory.containsKey(userId)) return employeeDirectory.get(userId);
        HrEmployeeSummaryVO employee = new HrEmployeeSummaryVO(); employee.setUserId(userId); employee.setEmployeeId(userId);
        employee.setEmployeeName("CRM user " + userId); employee.setDeptId(100L); employee.setDeptName("CRM部门");
        employee.setActive(true); employee.setStatus("ACTIVE"); employee.setTenantId(CrmRecordSupport.tenantId());
        employee.setUserEnabled(true); employee.setDepartmentEnabled(true); return employee;
    }

    CrmCustomer customer(String name) {
        CrmCustomer customer = new CrmCustomer(); customer.setCustomerCode("CHECK-" + UUID.randomUUID()); customer.setCustomerName("CRM check " + name);
        customer.setCustomerType("ENTERPRISE"); customer.setOwnerId(1L); customer.setOwnerName("batch-e-check"); customer.setDeptId(100L);
        customer.setStatus("ACTIVE"); customer.setUnsubscribeFlag(0); CrmRecordSupport.create(customer, "customerId"); mapper(CrmCustomerMapper.class).insert(customer); return customer;
    }

    CrmCampaign campaign(String name) {
        CrmCampaign campaign = new CrmCampaign(); campaign.setCampaignName("CRM check " + name); campaign.setCampaignCode("CHECK-" + UUID.randomUUID());
        campaign.setCampaignType("EMAIL"); campaign.setStartDate(LocalDate.now().minusDays(40)); campaign.setEndDate(LocalDate.now().minusDays(5));
        campaign.setStatus("PLANNING"); campaign.setOwnerId(1L); campaign.setBudget(new BigDecimal("100")); campaign.setActualCost(new BigDecimal("100"));
        CrmRecordSupport.create(campaign, "campaignId"); mapper(CrmCampaignMapper.class).insert(campaign); return campaign;
    }

    CrmOpportunity opportunity(CrmCustomer customer, Long campaignId, String stage) {
        CrmOpportunity opportunity = new CrmOpportunity(); opportunity.setCustomerId(customer.getCustomerId()); opportunity.setCustomerName(customer.getCustomerName());
        opportunity.setOpportunityName("CRM check opportunity");
        opportunity.setOwnerId(1L); opportunity.setDeptId(100L); opportunity.setStage(stage); opportunity.setStatus("OPEN");
        opportunity.setExpectedAmount(new BigDecimal("100")); opportunity.setCampaignId(campaignId); opportunity.setStageChangedTime(LocalDateTime.now().withNano(0));
        CrmRecordSupport.create(opportunity, "opportunityId"); mapper(CrmOpportunityMapper.class).insert(opportunity); return opportunity;
    }

    CrmQuote quote(CrmCustomer customer, Long opportunityId, Long contractId) {
        CrmQuote quote = new CrmQuote(); quote.setCustomerId(customer.getCustomerId()); quote.setCustomerName(customer.getCustomerName());
        quote.setQuoteNo("CHECK-" + UUID.randomUUID()); quote.setQuoteName("CRM quote check"); quote.setOpportunityId(opportunityId); quote.setContractId(contractId);
        quote.setTotalAmount(new BigDecimal("100")); quote.setCurrency("CNY"); quote.setStatus("DRAFT"); quote.setOwnerId(1L);
        CrmRecordSupport.create(quote, "quoteId"); mapper(CrmQuoteMapper.class).insert(quote); return quote;
    }

    CrmReceivable receivable(CrmCustomer customer, Long contractId, String planned, String received, LocalDate due) {
        CrmReceivable row = new CrmReceivable(); row.setReceivableNo("CHECK-" + UUID.randomUUID()); row.setCustomerId(customer.getCustomerId()); row.setContractId(contractId);
        row.setReceivableName("CRM receivable check"); row.setPlannedAmount(new BigDecimal(planned)); row.setReceivedAmount(new BigDecimal(received));
        row.setDueDate(due); row.setStatus(row.getReceivedAmount().signum() > 0 ? "PARTIAL_RECEIVED" : "PLANNED"); row.setOwnerId(1L);
        CrmRecordSupport.create(row, "receivableId"); mapper(CrmReceivableMapper.class).insert(row); return row;
    }

    CrmServiceTicket ticket(CrmCustomer customer, LocalDateTime opened) {
        CrmServiceTicket ticket = new CrmServiceTicket(); ticket.setTicketNo("CHECK-" + UUID.randomUUID()); ticket.setTicketTitle("CRM SLA check");
        ticket.setCustomerId(customer.getCustomerId()); ticket.setSeverity("P4"); ticket.setStatus("OPEN"); ticket.setOpenedTime(opened); ticket.setOwnerId(1L);
        CrmRecordSupport.create(ticket, "ticketId"); return ticket;
    }

    long scalar(String statement, Object... arguments) { return jdbc.queryForObject(statement, Long.class, arguments); }
    <Type> Type mapper(Class<Type> type) { return sessions.getMapper(type); }
    <Type> Type bean(Class<Type> type) { return type.cast(Objects.requireNonNull(beans.get(type), type.getName())); }

    private <Type> Type register(Class<Type> type) throws Exception {
        Constructor<?> constructor = type.getConstructors()[0]; Class<?>[] types = constructor.getParameterTypes(); Object[] arguments = new Object[types.length];
        for (int index = 0; index < types.length; index++) arguments[index] = types[index].isInterface() && types[index].getSimpleName().endsWith("Mapper") ? mapper(types[index]) : bean(types[index]);
        Object target = constructor.newInstance(arguments);
        if (target instanceof ServiceImpl<?, ?>) set(target, "baseMapper", mapper(Objects.requireNonNull(ResolvableType.forClass(type).as(ServiceImpl.class).getGeneric(0).resolve())));
        ProxyFactory factory = new ProxyFactory(target); factory.setProxyTargetClass(true);
        factory.addAdvice(new TransactionInterceptor(manager, new AnnotationTransactionAttributeSource()));
        Type service = type.cast(factory.getProxy()); beans.put(type, service);
        for (Class<?> contract : type.getInterfaces()) if (contract.getPackageName().equals("com.cloudflow.crm.service")) beans.put(contract, service);
        return service;
    }

    static void set(Object target, String name, Object value) throws Exception {
        for (Class<?> type = target.getClass(); type != null; type = type.getSuperclass()) {
            try { Field field = type.getDeclaredField(name); field.setAccessible(true); field.set(target, value); return; }
            catch (NoSuchFieldException missing) { }
        }
        throw new IllegalStateException("Missing field " + name);
    }

    int[] parallel(Callable<Integer> first, Callable<Integer> second) throws Exception {
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            List<Future<Integer>> futures = new ArrayList<>();
            for (Callable<Integer> operation : List.of(first, second)) futures.add(executor.submit(() -> {
                identity(); try { return operation.call(); } finally { TenantContext.clear(); UserContext.clear(); }
            }));
            return new int[]{futures.get(0).get(30, TimeUnit.SECONDS), futures.get(1).get(30, TimeUnit.SECONDS)};
        } finally { executor.shutdownNow(); executor.awaitTermination(10, TimeUnit.SECONDS); identity(); }
    }
}
