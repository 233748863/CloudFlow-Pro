package com.cloudflow.oa.service.impl;

import cn.dev33.satoken.stp.StpLogic;
import cn.dev33.satoken.stp.StpUtil;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.config.GlobalConfig;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.cloudflow.common.config.MybatisPlusConfig;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.datascope.DataScopeHandle;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.common.handler.MyMetaObjectHandler;
import com.cloudflow.common.message.api.MessageSender;
import com.cloudflow.common.message.config.MessageAutoConfiguration;
import com.cloudflow.common.redis.core.SysConfigHelper;
import com.cloudflow.common.statemachine.core.StateMachineRegistry;
import com.cloudflow.common.tenant.TenantConfigProperties;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.oa.config.OaStateMachineConfig;
import com.cloudflow.oa.domain.*;
import com.cloudflow.oa.domain.dto.*;
import com.cloudflow.oa.mapper.*;
import com.cloudflow.oa.service.*;
import com.cloudflow.oa.service.remote.RemoteBusinessRuleService;
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
import org.springframework.transaction.support.TransactionTemplate;
import java.lang.reflect.*;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.*;
import static com.cloudflow.oa.service.impl.OaOperationsChecks.*;

public final class OaOperationsDatabaseChecks {
    final Map<Class<?>, Object> beans = new HashMap<>();
    final ObjectMapper json = new ObjectMapper().findAndRegisterModules();
    final JdbcTemplate jdbc;
    final SqlSessionTemplate sessions;
    final PlatformTransactionManager transactions;
    final Set<String> permissions = new HashSet<>(Set.of("oa:rfq:comparison", "oa:activity-cost:list"));
    final String marker = "F-" + UUID.randomUUID().toString().substring(0, 8);
    final Path files;

    public static void run(String url, boolean assetPlanPerformance) throws Exception {
        StpLogic previous = StpUtil.getStpLogic();
        try {
            OaOperationsDatabaseChecks fixture = new OaOperationsDatabaseChecks(url);
            OaAssetSupplierDatabaseChecks.run(fixture, assetPlanPerformance);
            OaProjectContractDatabaseChecks.run(fixture);
            OaRfqDatabaseChecks.run(fixture);
            OaContractTeamDatabaseChecks.run(fixture);
            OaQuoteContractCopyDatabaseChecks.run(fixture);
            OaOpportunityContractSourceDatabaseChecks.run(fixture);
            OaContractPerformanceDatabaseChecks.run(fixture);
            OaPortalContractDatabaseChecks.run(fixture);
            OaInvoiceReceiptDatabaseChecks.run(fixture);
            fixture.reports();
            System.out.println("PASS: isolated OA services with real tenant/data-scope SQL and transactions");
        } finally { StpUtil.setStpLogic(previous); identity(100000L, 1L); }
    }

    private OaOperationsDatabaseChecks(String url) throws Exception {
        this(url, false);
    }

    OaOperationsDatabaseChecks(String url, boolean migrationRehearsal) throws Exception {
        if (!url.startsWith("jdbc:mysql://127.0.0.1:")) throw new IllegalArgumentException("Only isolated loopback database is allowed");
        javax.sql.DataSource source = OaAssetPlanSqlDiagnostics.wrap(new DriverManagerDataSource(url, "root", "")); jdbc = new JdbcTemplate(source);
        String directory = Objects.requireNonNull(jdbc.queryForObject("SELECT @@datadir", String.class)).replace('\\', '/');
        boolean accepted = migrationRehearsal ? directory.contains("/.cloudflow-runtime/batch-f-rehearsal/data-")
                : directory.contains("/target/batch-f-mysql-") || directory.contains("/.cloudflow-runtime/batch-f-validation/data-");
        if (!accepted) throw new IllegalArgumentException("Database must be created for the requested Batch F checks");
        MybatisConfiguration configuration = new MybatisConfiguration(); configuration.setMapUnderscoreToCamelCase(true);
        configuration.setLogImpl(org.apache.ibatis.logging.nologging.NoLoggingImpl.class);
        GlobalConfig global = new GlobalConfig(); global.setDbConfig(new GlobalConfig.DbConfig().setLogicDeleteField("deleted").setLogicDeleteValue("1").setLogicNotDeleteValue("0"));
        global.setMetaObjectHandler(new MyMetaObjectHandler());
        com.baomidou.mybatisplus.core.toolkit.GlobalConfigUtils.setGlobalConfig(configuration, global);
        configuration.addMappers("com.cloudflow.oa.mapper"); configuration.addMappers("com.cloudflow.common.event.outbox");
        configuration.addMappers("com.cloudflow.common.audit.mapper");
        configuration.addMappers("com.cloudflow.common.tenant.quota.mapper");
        MybatisPlusConfig plugins = new MybatisPlusConfig(new TenantConfigProperties());
        set(plugins, "dataScopeHandle", (DataScopeHandle) scope -> {
            if (Objects.equals(UserContext.getDsType(), 0)) return true;
            scope.setUserId(UserContext.getUserId()); scope.setDeptList(List.of()); return false;
        });
        MybatisSqlSessionFactoryBean factory = new MybatisSqlSessionFactoryBean(); factory.setDataSource(source); factory.setConfiguration(configuration); factory.setGlobalConfig(global);
        factory.setPlugins(plugins.mybatisPlusInterceptor()); factory.setMapperLocations(new PathMatchingResourcePatternResolver().getResources("classpath*:mapper/**/*Mapper.xml"));
        sessions = new SqlSessionTemplate(Objects.requireNonNull(factory.getObject())); transactions = new DataSourceTransactionManager(source);
        if (!com.baomidou.mybatisplus.core.metadata.TableInfoHelper.getTableInfo(SysAsset.class).isWithLogicDelete()
                || !com.baomidou.mybatisplus.core.metadata.TableInfoHelper.getTableInfo(OaAssetCategory.class).isWithLogicDelete()) {
            throw new IllegalStateException("Asset database checks must use the application's logical deletion metadata");
        }
        beans.put(ObjectMapper.class, json); beans.put(PlatformTransactionManager.class, transactions); beans.put(TransactionTemplate.class, new TransactionTemplate(transactions));
        SysConfigHelper settings = new SysConfigHelper() {
            @Override public String getConfigValue(String key, String fallback) {
                List<String> values = jdbc.queryForList("SELECT config_value FROM sys_config WHERE tenant_id=? AND config_key=?", String.class, OaRecordSupport.tenantId(), key);
                return values.isEmpty() ? fallback : values.get(0);
            }
        };
        beans.put(SysConfigHelper.class, settings);
        beans.put(RemoteBusinessRuleService.class, proxy(RemoteBusinessRuleService.class, (method, values) -> {
            if ("getEffectiveRule".equals(method) || "getEffectiveProjectRule".equals(method)) {
                List<BusinessRuleDTO> rows = jdbc.query("SELECT rule_code,threshold_value,effect,enabled FROM sys_business_rule WHERE tenant_id=? AND rule_code=?", (record, index) -> {
                    BusinessRuleDTO rule = new BusinessRuleDTO(); rule.setRuleCode(record.getString(1)); rule.setThresholdValue(record.getBigDecimal(2)); rule.setEffect(record.getString(3)); rule.setEnabled(record.getInt(4)); return rule;
                }, OaRecordSupport.tenantId(), values[0]);
                return rows.isEmpty() ? R.fail("Missing test rule") : R.ok(rows.get(0));
            }
            if ("recordHit".equals(method) || "recordProjectHit".equals(method)) return R.ok();
            throw new IllegalStateException("Unexpected rule operation " + method);
        }));
        StpUtil.setStpLogic(new StpLogic("oa-database-check") { @Override public boolean hasPermission(String permission) { return permissions.contains(permission); } });
        register(OutboxPublisher.class);
        StandardEnvironment environment = new StandardEnvironment();
        environment.getPropertySources().addFirst(new MapPropertySource("oa-check", Map.of("spring.application.name", "cloudflow-oa")));
        beans.put(MessageSender.class, new MessageAutoConfiguration().messageSender(bean(OutboxPublisher.class), json, environment));
        register(OaTraceEventServiceImpl.class); register(OaApprovalOutboxService.class); register(OaBusinessRuleService.class); register(OaReminderService.class);
        register(OaSupplierAuditService.class); register(OaSupplierGovernanceService.class); register(OaSupplierDecisionService.class); register(SupplierServiceImpl.class);
        register(OaAssetAuditService.class); register(OaDepreciationService.class); register(OaAssetRegistryService.class); register(OaAssetOperationsService.class); register(OaAssetMaintenanceService.class);
        register(AssetRepairApprovalHandler.class); register(AssetMovementApprovalHandler.class);
        register(ProjectExecutionStateService.class); register(OaProjectTaskService.class); register(OaProjectTemplateService.class);
        register(OaProjectAuditService.class); register(OaActivityCatalogService.class); register(OaProjectAccountingService.class); register(OaTimesheetCalculationService.class); register(OaTimesheetService.class);
        register(OaOrganizationService.class); register(OaRiskAlertServiceImpl.class); register(OaClientIpResolver.class);
        files = Files.createTempDirectory(Path.of("cloudflow-backend/target").toAbsolutePath().normalize(), "batch-f-files-");
        OaPrivateFileStorageService storage = new OaPrivateFileStorageService(mapper(OaPrivateFileMapper.class),
                new com.cloudflow.common.tenant.quota.TenantQuotaService(mapper(com.cloudflow.common.tenant.quota.mapper.TenantQuotaMapper.class)));
        set(storage, "baseDirectory", files.toString()); wrap(OaPrivateFileStorageService.class, storage);
        beans.put(com.cloudflow.oa.service.remote.RemoteContractTeamDirectory.class,
                proxy(com.cloudflow.oa.service.remote.RemoteContractTeamDirectory.class, (method, values) -> {
                    throw new IllegalStateException("Unexpected contract performance employee lookup " + method);
                }));
        register(ContractPortalSelectionMaintenance.class); register(ContractPortalPublicationService.class);
        register(OaContractPerformanceService.class); register(OaContractFulfilmentService.class); register(OaContractTermTemplateService.class);
        register(OaRfqAuditService.class); register(OaRfqAccessService.class); register(OaRfqPurchaseSourceService.class); register(OaQuotationFileService.class); register(OaQuotationService.class); register(OaRfqComparisonService.class);
        beans.put(com.cloudflow.oa.service.remote.RemoteMessageDeliveryService.class,
                proxy(com.cloudflow.oa.service.remote.RemoteMessageDeliveryService.class, (method, values) -> {
                    if ("readiness".equals(method)) return R.ok(new com.cloudflow.common.message.api.MessageChannelReadiness(false, "Isolated F regression does not send email"));
                    throw new IllegalStateException("Unexpected message operation " + method);
                }));
        register(OaRfqEmailContent.class); register(OaRfqInvitationService.class);
        StateMachineRegistry registry = new StateMachineRegistry(type -> Set.of(), new com.cloudflow.common.statemachine.config.StateMachineProperties());
        new OaStateMachineConfig(registry).run(); beans.put(StateMachineRegistry.class, registry);
        register(ConsumableTransactions.class); register(ConsumableLedgerService.class); register(ConsumableOperationSupport.class);
        register(ConsumableServiceImpl.class); register(ConsumablePurchaseService.class);
        beans.put(IPaymentRequestService.class, proxy(IPaymentRequestService.class, (method, values) -> { throw new IllegalStateException("Unexpected payment operation " + method); }));
        beans.put(IOaBudgetService.class, proxy(IOaBudgetService.class, (method, values) -> { throw new IllegalStateException("Unexpected budget operation " + method); }));
        register(PurchaseRequestServiceImpl.class); register(OaRfqService.class); register(OaRfqAwardService.class);
        register(OaOperationsReportService.class); register(OaOperationsReminderService.class);
    }

    <Type> Type mapper(Class<Type> type) { return sessions.getMapper(type); }
    <Type> Type bean(Class<Type> type) { return type.cast(Objects.requireNonNull(beans.get(type), type.getName())); }
    long count(String sql, Object... values) { return Objects.requireNonNull(jdbc.queryForObject(sql, Long.class, values)); }
    void config(String key, String value) { jdbc.update("UPDATE sys_config SET config_value=? WHERE tenant_id=? AND config_key=?", value, OaRecordSupport.tenantId(), key); }

    <Type> Type register(Class<Type> type) throws Exception {
        Constructor<?> constructor = type.getConstructors()[0]; Class<?>[] types = constructor.getParameterTypes(); Object[] values = new Object[types.length];
        for (int index = 0; index < types.length; index++) values[index] = types[index].isInterface() && types[index].getSimpleName().endsWith("Mapper") ? mapper(types[index]) : bean(types[index]);
        Object target = constructor.newInstance(values);
        if (target instanceof ServiceImpl<?, ?>) set(target, "baseMapper", mapper(Objects.requireNonNull(ResolvableType.forClass(type).as(ServiceImpl.class).getGeneric(0).resolve())));
        return wrap(type, target);
    }

    private <Type> Type wrap(Class<Type> type, Object target) {
        ProxyFactory factory = new ProxyFactory(target); factory.setProxyTargetClass(true); factory.addAdvice(new TransactionInterceptor(transactions, new AnnotationTransactionAttributeSource()));
        Type service = type.cast(factory.getProxy()); beans.put(type, service);
        for (Class<?> contract : type.getInterfaces()) if (contract.getPackageName().equals("com.cloudflow.oa.service")) beans.put(contract, service);
        return service;
    }

    static void set(Object target, String name, Object value) throws Exception {
        for (Class<?> type = target.getClass(); type != null; type = type.getSuperclass()) {
            try { Field field = type.getDeclaredField(name); field.setAccessible(true); field.set(target, value); return; }
            catch (NoSuchFieldException missing) { }
        }
        throw new IllegalStateException("Missing field " + name);
    }

    OaApprovalRequest request(Long id, String reservation) throws Exception {
        List<String> payloads = jdbc.queryForList("SELECT payload_json FROM outbox_event WHERE tenant_id=? AND aggregate_id=? AND event_type='OA_F_APPROVAL_SUBMITTED' ORDER BY id DESC", String.class, OaRecordSupport.tenantId(), id);
        for (String payload : payloads) {
            OaApprovalRequest request = json.readValue(json.readValue(payload, BusinessEventEnvelope.class).getPayload(), OaApprovalRequest.class);
            if (reservation.equals(request.getReservation())) return request;
        }
        throw new IllegalStateException("Approval outbox request missing");
    }

    ApprovalResultDTO bind(OaApprovalParticipant participant, Long id, String reservation) throws Exception {
        OaApprovalRequest request = request(id, reservation); String instance = marker + "-" + UUID.randomUUID(); participant.bindInstance(request, instance);
        ApprovalResultDTO result = new ApprovalResultDTO(); result.setTenantId(OaRecordSupport.tenantId()); result.setBusinessType(request.getBusinessType()); result.setBusinessId(id);
        result.setProcessInstanceId(instance); result.setVariables(request.getVariables()); result.setApprovalComment("isolated database check"); return result;
    }

    void reports() throws Exception {
        OaReportQuery query = new OaReportQuery(); query.setTenantId(100000L); query.setUserId(1L); query.setFromDate(LocalDate.now().minusDays(30)); query.setToDate(LocalDate.now().plusDays(30));
        query.setRfqIds(jdbc.queryForList("SELECT rfq_id FROM oa_purchase_rfq WHERE tenant_id=100000 AND deleted=0", Long.class));
        Object reportMapper = mapper(OaOperationsReportMapper.class);
        for (Method method : OaOperationsReportMapper.class.getDeclaredMethods()) {
            Object value = method.getParameterCount() == 1 ? method.invoke(reportMapper, query) : method.invoke(reportMapper, query, "TYPE");
            equal(true, value instanceof List<?>, "report SQL executes: " + method.getName());
        }
        mapper(OaOperationsReportMapper.class).contractRates(query, "OWNER"); mapper(OaOperationsReportMapper.class).contractRates(query, "COUNTERPARTY");
        equal(true, mapper(OaOperationsReminderMapper.class).missingTimesheets(100000L, query.getFromDate(), query.getToDate()) != null, "timesheet reminder SQL executes");
        equal(true, mapper(OaIdentityReferenceMapper.class).jobLevels(100000L) != null, "job level references execute");
        equal(8L, count("SELECT COUNT(*) FROM sys_job WHERE job_id BETWEEN 1650 AND 1657 AND service_name='oa'"), "eight built-in jobs registered");
        equal(0L, count("SELECT COUNT(*) FROM sys_role_menu grants JOIN sys_role role ON role.role_id=grants.role_id AND role.tenant_id=grants.tenant_id JOIN sys_menu menu ON menu.menu_id=grants.menu_id WHERE role.role_key='employee' AND menu.menu_id BETWEEN 1650 AND 1749 AND menu.perms NOT LIKE 'oa:timesheet:%'"), "employee has no cost or governance grants");
    }
}
