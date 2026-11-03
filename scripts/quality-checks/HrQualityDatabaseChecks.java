package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.config.GlobalConfig;
import com.baomidou.mybatisplus.core.toolkit.GlobalConfigUtils;
import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.cloudflow.common.audit.aop.AuditAspect;
import com.cloudflow.common.audit.handle.DefaultAuditLogHandle;
import com.cloudflow.common.audit.handle.JaversCompareHandle;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import com.cloudflow.common.audit.support.AuditBizModuleResolver;
import com.cloudflow.common.audit.support.AuditSnapshotContext;
import com.cloudflow.common.config.MybatisPlusConfig;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.handler.MyMetaObjectHandler;
import com.cloudflow.common.redis.config.RuntimeSysConfigService;
import com.cloudflow.common.redis.core.SysConfigHelper;
import com.cloudflow.common.tenant.TenantConfigProperties;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.common.tenant.quota.TenantQuotaService;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.hr.config.HrJacksonConfig;
import com.cloudflow.hr.domain.dto.HrEmployeeCompPayload;
import com.cloudflow.hr.domain.dto.HrResumeParsedFieldsPayload;
import com.cloudflow.hr.domain.dto.HrTimeRequestPayload;
import com.cloudflow.hr.domain.entity.HrLeaveType;
import com.cloudflow.hr.client.BusinessRuleClient;
import com.cloudflow.hr.client.dto.BusinessRuleDTO;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.domain.ProcessStartResult;
import com.cloudflow.hr.client.WorkflowServiceClient;
import com.cloudflow.hr.client.dto.ProcessStartDTO;
import com.cloudflow.hr.domain.dto.Hr360EvaluatorResponsePayload;
import com.cloudflow.hr.domain.dto.benefit.HrMallItemDTO;
import com.cloudflow.hr.domain.dto.benefit.HrMallItemQueryDTO;
import com.cloudflow.hr.domain.dto.benefit.HrMallOrderPlaceDTO;
import com.cloudflow.hr.domain.dto.dispute.HrDisputeEvidenceDTO;
import com.cloudflow.hr.domain.dto.labor.HrWorkInjuryCompensationDTO;
import com.cloudflow.hr.domain.dto.labor.HrWorkInjuryDTO;
import com.cloudflow.hr.domain.dto.labor.HrWorkInjuryInvestigationDTO;
import com.cloudflow.hr.domain.dto.labor.HrWorkInjuryRehabilitationDTO;
import com.cloudflow.hr.domain.dto.labor.HrWorkInjuryTreatmentDTO;
import com.cloudflow.hr.domain.dto.recruitment.HrRecruitmentCommonQueryDTO;
import com.cloudflow.hr.domain.entity.HrEmployeeComp;
import com.cloudflow.hr.domain.entity.HrMallOrder;
import com.cloudflow.hr.domain.entity.HrPayrollBatch;
import com.cloudflow.hr.domain.entity.HrPointAccount;
import com.cloudflow.hr.domain.entity.HrWorkInjury;
import com.cloudflow.hr.domain.vo.benefit.HrMallOrderVO;
import com.cloudflow.hr.domain.vo.recruitment.HrCandidateVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.*;
import com.cloudflow.hr.service.impl.*;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import java.beans.Introspector;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.lang.reflect.Field;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Supplier;
import java.util.stream.Stream;
import org.apache.ibatis.executor.statement.StatementHandler;
import org.apache.ibatis.plugin.Interceptor;
import org.apache.ibatis.plugin.Intercepts;
import org.apache.ibatis.plugin.Invocation;
import org.apache.ibatis.plugin.Signature;
import org.apache.ibatis.session.LocalCacheScope;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.aop.aspectj.annotation.AspectJProxyFactory;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.context.support.StaticApplicationContext;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.json.Jackson2ObjectMapperBuilder;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;

/** Current DDL, real MyBatis queries and business services; fixture transaction is always rolled back. */
public final class HrQualityDatabaseChecks implements AutoCloseable {
    private static final long TENANT = 198211031L;
    private static final long FOREIGN = 198211032L;
    private static final long USER = 198211033L;
    private static final long EMPLOYEE = 198211034L;
    private static final long OTHER = 198211035L;
    private static final long DEPT = 198211036L;
    private static final long INCIDENT_DEPT = 198211037L;
    private static final long POSITION = 198211038L;
    private static final long REQUISITION = 198211039L;
    private static int checks;
    private final ObjectMapper json = productionJson();
    private final StaticApplicationContext application = new StaticApplicationContext();
    private final JdbcTemplate jdbc;
    private final DataSourceTransactionManager transactions;
    private final SqlSessionTemplate sessions;
    private final SqlCounter queries = new SqlCounter();
    private final HrRuleSupport support;
    private final HrTypedCrudService crud;
    private final HrGrievanceAccessService grievanceAccess;
    private final HrWorkInjuryAccess injuryAccess;
    private final Path storageDirectory;
    private final SysConfigHelper settings = new SysConfigHelper() {
        @Override public int getConfigInt(String key, int fallback) { return fallback; }
    };

    public static void main(String[] arguments) throws Exception {
        require(arguments.length >= 4 && arguments.length <= 5, "JDBC, owned data directory, HR module, output directory and optional group required");
        String group = arguments.length == 5 ? arguments[4] : "all";
        require(Set.of("all", "leave-resume", "performance-workflow", "leadership-callback").contains(group), "known check group required");
        require(arguments[0].matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]{4,5}/cloud_flow_db\\?.*"), "loopback database only");
        Path owned = Path.of(arguments[1]).toRealPath();
        require(owned.toString().matches("(?i)D:.*batch-e-mysql-[a-f0-9]{32}[\\\\/]data"), "owned scratch data directory only");
        try (HrQualityDatabaseChecks fixture = new HrQualityDatabaseChecks(arguments, owned)) {
            if (Set.of("all", "leadership-callback").contains(group)) fixture.prepareCallbackSchema(Path.of(arguments[2]));
            new TransactionTemplate(fixture.transactions).executeWithoutResult(status -> {
                try {
                    fixture.seed();
                    if ("all".equals(group)) {
                    fixture.recruitment();
                    fixture.workInjury();
                    fixture.mall();
                    fixture.evidence();
                    fixture.auditAndCompensation();
                    fixture.payrollScopeAndCorrections();
                    fixture.trainingArchive();
                    }
                    if (Set.of("all", "leave-resume").contains(group)) fixture.leaveAndResume();
                    if (Set.of("all", "performance-workflow").contains(group)) fixture.performanceAndWorkflow();
                    if (Set.of("all", "leadership-callback").contains(group)) {
                        fixture.departmentLeadership();
                        fixture.approvalCallbacks();
                        fixture.onboardingProtocol();
                    }
                } catch (Exception failure) {
                    throw new IllegalStateException(failure);
                } finally { status.setRollbackOnly(); }
            });
            equal(0L, fixture.number("SELECT COUNT(*) FROM hr_employee WHERE tenant_id=?", TENANT), "business fixtures rolled back");
            equal(0L, fixture.number("SELECT COUNT(*) FROM sys_file WHERE tenant_id=?", TENANT), "file metadata rolled back");
            if (Files.exists(fixture.storageDirectory)) {
                try (Stream<Path> paths = Files.walk(fixture.storageDirectory)) {
                    equal(0L, paths.filter(Files::isRegularFile).count(), "storage transaction removes rolled-back files");
                }
            }
        } finally { UserContext.clear(); TenantContext.clear(); }
        System.out.println("HR_QUALITY_DATABASE: group=" + group + "; checks=" + checks + "; failed=0; mysql=true; real_mappers=true; audit_aspect=true; file_storage=" + "all".equals(group) + "; fixtures_rolled_back=true; http=false");
    }

    private HrQualityDatabaseChecks(String[] arguments, Path owned) throws Exception {
        DriverManagerDataSource source = new DriverManagerDataSource(arguments[0], "root", "");
        jdbc = new JdbcTemplate(source);
        equal(owned, Path.of(Objects.requireNonNull(jdbc.queryForObject("SELECT @@datadir", String.class))).toRealPath(), "database directory ownership");
        equal(0L, number("SELECT COUNT(*) FROM hr_employee WHERE tenant_id=?", TENANT), "unused fixture tenant");
        transactions = new DataSourceTransactionManager(source);
        MybatisConfiguration configuration = new MybatisConfiguration();
        configuration.setMapUnderscoreToCamelCase(true);
        configuration.setCacheEnabled(false);
        configuration.setLocalCacheScope(LocalCacheScope.STATEMENT);
        configuration.setLogImpl(org.apache.ibatis.logging.nologging.NoLoggingImpl.class);
        GlobalConfig global = new GlobalConfig();
        global.setBanner(false);
        global.setDbConfig(new GlobalConfig.DbConfig().setLogicDeleteField("deleted").setLogicDeleteValue("1").setLogicNotDeleteValue("0"));
        global.setMetaObjectHandler(new MyMetaObjectHandler());
        GlobalConfigUtils.setGlobalConfig(configuration, global);
        configuration.addMappers("com.cloudflow.hr.mapper");
        configuration.addMapper(SysAuditLogMapper.class);
        List<Resource> resources = new ArrayList<>();
        resources.add(new FileSystemResource(Path.of(arguments[2]).getParent().resolve("cloudflow-common/cloudflow-common-data/src/main/resources/mapper/report/ReportSqlMapper.xml")));
        try (Stream<Path> files = Files.walk(Path.of(arguments[2], "src/main/resources/mapper"))) {
            files.filter(file -> file.toString().endsWith(".xml")).forEach(file -> resources.add(new FileSystemResource(file)));
        }
        MybatisSqlSessionFactoryBean factory = new MybatisSqlSessionFactoryBean();
        factory.setDataSource(source); factory.setConfiguration(configuration); factory.setGlobalConfig(global);
        factory.setMapperLocations(resources.toArray(Resource[]::new));
        factory.setPlugins(new MybatisPlusConfig(new TenantConfigProperties()).mybatisPlusInterceptor(), queries);
        sessions = new SqlSessionTemplate(Objects.requireNonNull(factory.getObject()));
        for (Class<?> type : configuration.getMapperRegistry().getMappers()) {
            application.getBeanFactory().registerSingleton(Introspector.decapitalize(type.getSimpleName()), sessions.getMapper(type));
        }
        support = new HrRuleSupport(transactions, null, mapper(HrEmployeeMapper.class), mapper(HrAuditLogMapper.class), json, mapper(HrPositionMapper.class));
        grievanceAccess = new HrGrievanceAccessService(mapper(HrEmployeeMapper.class), mapper(HrGrievanceMapper.class), support, new HrEssSupport(null));
        HrTypedCrudService target = new HrTypedCrudService(application, json, mapper(HrEmployeeMapper.class), mapper(HrPositionMapper.class),
                mapper(HrCompGradeMapper.class), mapper(HrAuditLogMapper.class), new HrAppraisalGuard(null, null, null, null, null), null, null, settings, grievanceAccess);
        DefaultAuditLogHandle audit = new DefaultAuditLogHandle(mapper(SysAuditLogMapper.class), json, new AuditBizModuleResolver());
        AspectJProxyFactory proxy = new AspectJProxyFactory(target);
        proxy.setProxyTargetClass(true);
        proxy.addAspect(new AuditAspect(new JaversCompareHandle(Optional.of(audit))));
        crud = proxy.getProxy();
        injuryAccess = new HrWorkInjuryAccess(mapper(HrWorkInjuryMapper.class), support);
        application.getBeanFactory().registerSingleton("hrWorkInjuryAccess", injuryAccess);
        storageDirectory = Path.of(arguments[3]).toRealPath().resolve("evidence-files");
    }

    private void seed() {
        identity(USER, TENANT, 0, Set.of("admin"));
        jdbc.update("INSERT INTO sys_dept(dept_id,tenant_id,parent_id,ancestors,dept_name,order_num,status,deleted) VALUES(?,?,0,'0','所属部门',1,'0',0),(?,?,0,'0','事发部门',2,'0',0)", DEPT, TENANT, INCIDENT_DEPT, TENANT);
        jdbc.update("INSERT INTO hr_position(id,tenant_id,position_code,position_name,status) VALUES(?,?,'QUALITY_POSITION','质量岗位',1)", POSITION, TENANT);
        for (long employee : List.of(EMPLOYEE, OTHER)) {
            jdbc.update("INSERT INTO hr_employee(id,tenant_id,employee_no,name,gender,dept_id,position_id,user_id,employee_status,hire_date,deleted) VALUES(?,?,?,'核验员工','UNKNOWN',?,?,?,'REGULAR','2020-01-01',0)",
                    employee, TENANT, "quality-" + employee, employee == EMPLOYEE ? DEPT : INCIDENT_DEPT, POSITION, employee == EMPLOYEE ? USER : USER + 100);
        }
        jdbc.update("INSERT INTO hr_employee(id,tenant_id,employee_no,name,gender,dept_id,user_id,employee_status,deleted) VALUES(?,?,'quality-foreign','异租户员工','UNKNOWN',?,?,'REGULAR',0)", OTHER + 100, FOREIGN, DEPT, USER);
    }

    private void recruitment() {
        jdbc.update("INSERT INTO hr_recruitment_requisition(id,tenant_id,requisition_no,title,dept_id,position_id,expected_arrival_date,status,create_by) VALUES(?,?,'QUALITY-REQ','质量需求',?,?,'2026-12-01','RECRUITING','quality')", REQUISITION, TENANT, DEPT, POSITION);
        for (int index = 1; index <= 5; index++) {
            jdbc.update("INSERT INTO hr_candidate(id,tenant_id,candidate_no,requisition_id,name,phone,source,channel_id,status,create_by) VALUES(?,?,?,?,?,'+8613812345678','WEBSITE',NULL,'SCREENING',?)",
                    REQUISITION + index, index == 5 ? FOREIGN : TENANT, "QC-" + index, REQUISITION, "质量候选" + index, index == 4 ? "other" : "quality");
        }
        HrLookupMapper lookups = mapper(HrLookupMapper.class);
        HrRecruitmentService recruitment = new HrRecruitmentService(crud, null, new HrViewSupport(crud, lookups, json), json, lookups);
        HrRecruitmentCommonQueryDTO query = new HrRecruitmentCommonQueryDTO(); query.setPageSize(100);
        queries.clear();
        PageResult<HrCandidateVO> page = recruitment.pageCandidates(query);
        equal(4L, page.getTotal(), "candidate tenant separation");
        equal(1L, queries.selects("hr_recruitment_requisition"), "one requisition query for four candidates");
        equal(1L, queries.selects("hr_position"), "one position query for four candidates");
        equal(1L, queries.selects("sys_dept"), "one department query for four candidates");
        require(page.getRows().stream().allMatch(row -> "QUALITY-REQ".equals(row.getRequisitionNo()) && "质量岗位".equals(row.getPositionName())
                && "所属部门".equals(row.getDeptName()) && row.getChannelId() == null && "WEBSITE".equals(row.getSource())), "shared references and independent source populated");
        identity(USER, TENANT, 4, Set.of("employee"));
        PageResult<HrCandidateVO> scoped = recruitment.pageCandidates(query);
        equal(3L, scoped.getTotal(), "candidate creator scope retained");
        require(scoped.getRows().stream().noneMatch(row -> "+8613812345678".equals(row.getPhone())), "candidate phones remain masked");
        jdbc.update("UPDATE hr_recruitment_requisition SET create_by='other' WHERE id=?", REQUISITION);
        require(recruitment.pageCandidates(query).getRows().stream().allMatch(row -> row.getRequisitionNo() == null), "batch enrichment cannot reveal inaccessible requisitions");
        identity(USER, TENANT, 0, Set.of("admin"));
    }

    private void workInjury() {
        HrWorkInjuryServiceImpl injuryService = new HrWorkInjuryServiceImpl(mapper(HrWorkInjuryMapper.class), crud, null, json, null, null,
                null, new HrEssSupport(null), injuryAccess, support, mapper(HrLookupMapper.class));
        HrWorkInjuryDTO injury = new HrWorkInjuryDTO(); injury.setInjuryNo("QUALITY-INJURY"); injury.setEmployeeId(EMPLOYEE);
        injury.setDeptId(INCIDENT_DEPT); injury.setOccurredAt(LocalDateTime.of(2026, 11, 1, 10, 0)); injury.setEventDescription("现场事件");
        Long injuryId = injuryService.createInjury(injury);
        equal(INCIDENT_DEPT, injuryService.get(injuryId).getDeptId(), "incident department saved");
        equal("REPORTED", injuryService.get(injuryId).getStatus(), "new injury state controlled by service");
        HrWorkInjuryInvestigationServiceImpl investigation = new HrWorkInjuryInvestigationServiceImpl(mapper(HrWorkInjuryInvestigationMapper.class), injuryAccess, crud, json);
        HrWorkInjuryTreatmentServiceImpl treatment = new HrWorkInjuryTreatmentServiceImpl(mapper(HrWorkInjuryTreatmentMapper.class), injuryAccess, crud, json);
        HrWorkInjuryCompensationServiceImpl compensation = new HrWorkInjuryCompensationServiceImpl(mapper(HrWorkInjuryCompensationMapper.class), injuryAccess, crud, json);
        HrWorkInjuryRehabilitationServiceImpl rehabilitation = new HrWorkInjuryRehabilitationServiceImpl(mapper(HrWorkInjuryRehabilitationMapper.class), injuryAccess, crud, json);
        HrWorkInjuryInvestigationDTO investigationInput = new HrWorkInjuryInvestigationDTO(); investigationInput.setInvestigatorId(USER); investigationInput.setInvestigationDate(LocalDate.of(2026, 11, 1));
        Long investigationId = investigation.createInvestigation(injuryId, investigationInput);
        HrWorkInjuryTreatmentDTO treatmentInput = new HrWorkInjuryTreatmentDTO(); treatmentInput.setHospitalName("核验医院"); treatmentInput.setAdmitDate(LocalDate.of(2026, 11, 1));
        Long treatmentId = treatment.createTreatment(injuryId, treatmentInput);
        HrWorkInjuryCompensationDTO compensationInput = new HrWorkInjuryCompensationDTO(); compensationInput.setItemType("MEDICAL"); compensationInput.setAmount(new BigDecimal("300.00"));
        Long compensationId = compensation.createCompensation(injuryId, compensationInput);
        HrWorkInjuryRehabilitationDTO rehabilitationInput = new HrWorkInjuryRehabilitationDTO(); rehabilitationInput.setStatus("IN_REHAB");
        Long rehabilitationId = rehabilitation.createRehabilitation(injuryId, rehabilitationInput);
        equal(1, investigation.listByInjury(injuryId).size(), "investigation uses parent without employee column");
        equal(1, treatment.listByInjury(injuryId).size(), "treatment uses parent without employee column");
        equal(1, compensation.listByInjury(injuryId).size(), "compensation uses parent without employee column");
        equal(1, rehabilitation.listByInjury(injuryId).size(), "rehabilitation uses parent without employee column");
        identity(USER, TENANT, 3, Set.of("employee"));
        equal(1, crud.list(HrWorkInjury.class, Map.of()).size(), "employee department can read an injury occurring elsewhere");
        UserContext.setDeptId(INCIDENT_DEPT); UserContext.setDsDeptIds(List.of(INCIDENT_DEPT));
        equal(0, crud.list(HrWorkInjury.class, Map.of()).size(), "incident department does not grant access");
        for (Runnable action : List.<Runnable>of(() -> investigation.listByInjury(injuryId), () -> treatment.listByInjury(injuryId),
                () -> compensation.listByInjury(injuryId), () -> rehabilitation.listByInjury(injuryId),
                () -> investigation.updateInvestigation(investigationId, investigationInput), () -> treatment.updateTreatment(treatmentId, treatmentInput),
                () -> compensation.markPaid(compensationId), () -> rehabilitation.updateRehabilitation(rehabilitationId, rehabilitationInput),
                () -> injuryService.close(injuryId, "越权结案"))) rejected(action, "all child operations use parent employee scope");
        identity(USER, FOREIGN, 0, Set.of("admin"));
        rejected(() -> investigation.createInvestigation(injuryId, investigationInput), "cross tenant parent rejected");
        rejected(() -> compensation.markPaid(compensationId), "cross tenant child rejected");
        identity(USER, TENANT, 0, Set.of("admin"));
        injuryService.close(injuryId, "真实结案");
        LocalDateTime closedAt = injuryService.get(injuryId).getClosedAt();
        require(closedAt != null, "close records timestamp");
        injuryService.close(injuryId, "重复请求");
        equal(closedAt, injuryService.get(injuryId).getClosedAt(), "repeated close preserves timestamp");
        equal("真实结案", injuryService.get(injuryId).getCloseReason(), "repeated close preserves reason");
        rejected(() -> injuryService.updateInjury(injuryId, injury), "closed case rejects ordinary edit");
        identity(USER, TENANT, 4, Set.of("employee")); queries.clear();
        equal(Set.of(EMPLOYEE), support.accessibleEmployeeIds(List.of(EMPLOYEE, OTHER, OTHER + 100, EMPLOYEE)), "batch employee scope and tenant filter");
        equal(1L, queries.selects("hr_employee"), "employee scope uses one query for distinct employee IDs");
        identity(USER, TENANT, 0, Set.of("admin"));
    }

    private void mall() {
        HrMallItemServiceImpl items = new HrMallItemServiceImpl(mapper(HrMallItemMapper.class), crud, json);
        HrMallItemDTO item = new HrMallItemDTO(); item.setItemNo("QUALITY-ITEM"); item.setItemName("下单时商品"); item.setPointPrice(20);
        item.setStock(50); item.setSortOrder(9); item.setStatus("ON_SHELF"); item.setCoverImage("/old-cover.jpg");
        Long itemId = items.createItem(item);
        item.setItemNo("QUALITY-PRIORITY"); item.setItemName("优先商品"); item.setSortOrder(1);
        Long first = items.createItem(item);
        equal(first, items.page(new HrMallItemQueryDTO()).getRows().get(0).getId(), "sort order governs product page");
        AtomicInteger debits = new AtomicInteger(); AtomicInteger credits = new AtomicInteger();
        IHrPointAccountService points = (IHrPointAccountService) Proxy.newProxyInstance(IHrPointAccountService.class.getClassLoader(), new Class<?>[]{IHrPointAccountService.class}, (proxy, method, values) -> {
            if ("findOrCreateAccount".equals(method.getName())) { HrPointAccount account = new HrPointAccount(); account.setId(1L); return account; }
            if ("debit".equals(method.getName())) { debits.incrementAndGet(); return null; }
            if ("credit".equals(method.getName())) { credits.incrementAndGet(); return null; }
            throw new AssertionError("unexpected points method " + method.getName());
        });
        HrMallOrderServiceImpl orders = new HrMallOrderServiceImpl(mapper(HrMallOrderMapper.class), mapper(HrMallOrderItemMapper.class),
                mapper(HrMallItemMapper.class), points, items, crud, null, json, null, new RuntimeSysConfigService(settings));
        HrMallOrderPlaceDTO input = new HrMallOrderPlaceDTO(); input.setItemId(itemId); input.setQuantity(2); input.setReceiverName("收件人");
        input.setReceiverPhone("13812345678"); input.setReceiverAddress("收件地址"); input.setRemark("原始下单备注");
        Long orderId = orders.placeOrder(input);
        equal(1, debits.get(), "one points debit per order");
        jdbc.update("UPDATE hr_mall_item SET item_no='QUALITY-RENAMED',item_name='后来商品',cover_image='/new-cover.jpg',point_price=99 WHERE id=?", itemId);
        HrMallOrderVO order = orders.get(orderId);
        equal("QUALITY-ITEM", order.getItems().get(0).getItemNo(), "order retains original item number");
        equal("下单时商品", order.getItems().get(0).getItemName(), "order retains original item name");
        equal("/old-cover.jpg", order.getItems().get(0).getCoverImage(), "order retains original cover");
        equal(20, order.getItems().get(0).getPointPrice(), "order retains original price");
        orders.cancel(orderId, "独立取消原因"); orders.cancel(orderId, "重复取消");
        equal("原始下单备注", orders.get(orderId).getRemark(), "cancellation does not overwrite order remark");
        equal("独立取消原因", orders.get(orderId).getCancelReason(), "repeat cancellation preserves initial reason");
        equal(1, credits.get(), "cancel returns points once");
        equal(50L, number("SELECT stock FROM hr_mall_item WHERE id=?", itemId), "cancel restores stock once");
        Long shipped = orders.placeOrder(input); orders.ship(shipped, " 核验快递 ", " WAYBILL-001 ");
        equal("核验快递", orders.get(shipped).getExpressCompany(), "shipping company saved and exposed");
        equal("WAYBILL-001", orders.get(shipped).getExpressNo(), "shipping number saved and exposed");
        rejected(() -> orders.ship(shipped, "替换快递", "REPLACEMENT"), "shipped order rejects second dispatch");
        identity(USER, TENANT, 4, Set.of("employee"));
        require(!"13812345678".equals(orders.get(orderId).getReceiverPhone()), "order read retains phone mask");
        UserContext.setUserName("other"); rejected(() -> orders.get(orderId), "order detail follows existing creator scope");
        identity(USER, FOREIGN, 0, Set.of("admin")); rejected(() -> orders.get(orderId), "order detail tenant boundary");
        identity(USER, TENANT, 0, Set.of("admin"));
    }

    private void evidence() throws Exception {
        long disputeId = REQUISITION + 50;
        jdbc.update("INSERT INTO hr_labor_dispute(id,tenant_id,dispute_no,create_by) VALUES(?,?,'QUALITY-DISPUTE','quality'),(?,?,'QUALITY-DISPUTE-OTHER','quality')", disputeId, TENANT, disputeId + 1, TENANT);
        TenantQuotaService quotas = new TenantQuotaService(null) {
            @Override public void requireStorageCapacity(Long tenant, long bytes) { }
            @Override public void refreshStorage(Long tenant) { }
        };
        HrFileStorage storage = new HrFileStorage(mapper(HrFileStorageMapper.class), quotas);
        Field base = HrFileStorage.class.getDeclaredField("baseDir"); base.setAccessible(true); base.set(storage, storageDirectory.toString());
        HrDisputeEvidenceService evidence = transactional(new HrDisputeEvidenceService(mapper(HrDisputeEvidenceMapper.class), mapper(HrFileStorageMapper.class), storage, crud, grievanceAccess, support), HrDisputeEvidenceService.class);
        HrDisputeEvidenceDTO input = new HrDisputeEvidenceDTO(); input.setEvidenceType("OTHER"); input.setRemark("证据说明");
        Long evidenceId = evidence.upload(disputeId, new BytesFile("提交时文件.txt", "核验内容".getBytes(StandardCharsets.UTF_8)), input);
        Long fileId = jdbc.queryForObject("SELECT file_id FROM hr_dispute_evidence WHERE id=?", Long.class, evidenceId);
        equal("提交时文件.txt", jdbc.queryForObject("SELECT file_name FROM hr_dispute_evidence WHERE id=?", String.class, evidenceId), "evidence stores submission filename");
        equal("", jdbc.queryForObject("SELECT url FROM sys_file WHERE file_id=?", String.class, fileId), "private evidence stores no public URL");
        jdbc.update("UPDATE sys_file SET file_name='后来改名.txt' WHERE file_id=?", fileId);
        ResponseEntity<byte[]> download = evidence.download(disputeId, fileId);
        equal("提交时文件.txt", download.getHeaders().getContentDisposition().getFilename(), "download uses evidence name snapshot");
        require(Arrays.equals("核验内容".getBytes(StandardCharsets.UTF_8), download.getBody()), "download returns stored bytes");
        equal("no-store", download.getHeaders().getFirst(HttpHeaders.CACHE_CONTROL), "private response avoids caching");
        rejected(() -> evidence.download(disputeId + 1, fileId), "evidence from a different accessible case is denied");
        rejected(() -> storage.load(fileId), "generic storage cannot read private dispute evidence");
        identity(USER, FOREIGN, 0, Set.of("admin")); rejected(() -> evidence.download(disputeId, fileId), "cross tenant evidence denied");
        identity(USER, TENANT, 4, Set.of("employee")); UserContext.setUserName("other"); rejected(() -> evidence.download(disputeId, fileId), "case creator scope also applies to file download");
        identity(USER, TENANT, 0, Set.of("admin"));
        jdbc.update("UPDATE sys_file SET file_type='HR_GRIEVANCE' WHERE file_id=?", fileId);
        rejected(() -> evidence.download(disputeId, fileId), "source grievance file requires linked authorized grievance");
        jdbc.update("UPDATE sys_file SET file_type='HR_DISPUTE_EVIDENCE',deleted=1 WHERE file_id=?", fileId);
        rejected(() -> evidence.download(disputeId, fileId), "deleted evidence file denied");
    }

    private void auditAndCompensation() throws Exception {
        long orderId = REQUISITION + 100;
        jdbc.update("INSERT INTO hr_mall_order(id,tenant_id,order_no,employee_id,receiver_phone,status,remark,create_by) VALUES(?,?,'QUALITY-AUDIT',?,'13812345678','APPROVED','before','quality')", orderId, TENANT, USER);
        queries.clear();
        crud.updateProperties(HrMallOrder.class, orderId, Map.of("receiverPhone", "13899995678", "remark", "after"));
        equal(2L, queries.selects("hr_mall_order"), "dual audit reuses two business snapshots without extra reads");
        String hrAudit = jdbc.queryForObject("SELECT CONCAT(before_data,after_data) FROM hr_audit_log WHERE tenant_id=? AND business_domain='hr_mall_order' AND business_id=? ORDER BY id DESC LIMIT 1", String.class, TENANT, orderId);
        require(hrAudit != null && hrAudit.contains("changedSensitiveFields") && hrAudit.contains("receiverPhone"), "HR audit tracks changes hidden by equal masks");
        require(!hrAudit.contains("13812345678") && !hrAudit.contains("13899995678"), "HR audit contains no original phone");
        List<Map<String, Object>> publicAudit = jdbc.queryForList("SELECT * FROM sys_audit_log WHERE tenant_id=? AND audit_name='HR记录更新'", TENANT);
        require(!publicAudit.isEmpty(), "actual Common audit rows saved");
        String commonAudit = json.writeValueAsString(publicAudit);
        require(commonAudit.contains("receiverPhone") && commonAudit.contains("changedSensitiveFields"), "Common audit uses the same changed-sensitive-field snapshot");
        require(!commonAudit.contains("13812345678") && !commonAudit.contains("13899995678"), "Common audit contains no original phone");
        require(AuditSnapshotContext.current() == null, "audit scope released after call");
        HrEmployeeCompPayload compensation = new HrEmployeeCompPayload(); compensation.setEmployeeId(EMPLOYEE); compensation.setGradeId(9191L);
        compensation.setTotalSalary(new BigDecimal("12345.67")); compensation.setEffectiveDate(LocalDate.of(2026, 11, 1)); compensation.setStatus("ACTIVE");
        queries.clear(); Long compensationId = crud.create(HrEmployeeComp.class, compensation);
        equal(0L, queries.selects("hr_employee"), "fully supplied compensation does not load employee");
        equal(0L, queries.selects("hr_position"), "fully supplied compensation does not load position");
        equal(0L, queries.selects("hr_comp_grade"), "fully supplied compensation does not load grade");
        equal("12345.67", jdbc.queryForObject("SELECT total_salary FROM hr_employee_comp WHERE id=?", String.class, compensationId), "manual salary preserved");
        Map<String, Object> clearRemark = new LinkedHashMap<>(); clearRemark.put("remark", null);
        crud.updateProperties(HrMallOrder.class, orderId, clearRemark);
        equal(null, jdbc.queryForObject("SELECT remark FROM hr_mall_order WHERE id=?", String.class, orderId), "typed update retains explicit null semantics");
    }

    private void payrollScopeAndCorrections() {
        long batchId = REQUISITION + 200;
        for (int offset = 0; offset < 5; offset++) {
            jdbc.update("INSERT INTO hr_payroll_batch(batch_id,tenant_id,batch_no,payroll_period_id,create_by) VALUES(?,?,?,1,?)",
                    batchId + offset, TENANT, "QUALITY-BATCH-" + offset, offset == 4 ? "other" : "quality");
        }
        jdbc.update("INSERT INTO hr_payroll_batch_employee(tenant_id,batch_id,employee_id) VALUES(?,?,?),(?,?,?),(?,?,?),(?,?,?)",
                TENANT, batchId, EMPLOYEE, TENANT, batchId + 1, EMPLOYEE, TENANT, batchId + 1, OTHER, TENANT, batchId + 2, OTHER);
        HrPayrollBatchService batches = new HrPayrollBatchService(mapper(HrPayrollBatchMapper.class), mapper(HrPayrollBatchEmployeeMapper.class),
                mapper(HrSalarySlipMapper.class), mapper(HrPayrollPeriodMapper.class), null, null, support, null, null, null);
        identity(USER, TENANT, 4, Set.of("employee")); queries.clear();
        List<Long> visible = batches.list().stream().map(HrPayrollBatch::getBatchId).toList();
        equal(Set.of(batchId, batchId + 3), Set.copyOf(visible), "batch list requires all members visible and preserves empty-batch creator policy");
        equal(1L, queries.selects("hr_payroll_batch_employee"), "one member query for batch list");
        equal(1L, queries.selects("hr_employee"), "one employee query for batch authorization");
        queries.clear(); batches.detail(batchId);
        equal(1L, queries.selects("hr_payroll_batch_employee"), "batch detail reuses authorized member rows");
        rejected(() -> batches.detail(batchId + 1), "mixed employee visibility cannot grant batch access");
        identity(USER, FOREIGN, 0, Set.of("admin"));
        equal(0, batches.list().size(), "batch list tenant isolation");
        identity(USER, TENANT, 0, Set.of("admin"));
        equal(5, batches.list().size(), "all-scope batch visibility including empty foreign creator");
        long slipId = batchId + 10;
        jdbc.update("INSERT INTO hr_salary_slip(id,tenant_id,employee_id,period_month) VALUES(?,?,?,'2026-12')", slipId, TENANT, EMPLOYEE);
        jdbc.update("INSERT INTO hr_payroll_correction(correction_id,tenant_id,original_slip_id,correction_slip_id,reason,status) VALUES(?,?,?,?,'质量更正','PENDING')", slipId, TENANT, slipId, slipId);
        HrPayrollCorrectionMapper corrections = mapper(HrPayrollCorrectionMapper.class); queries.clear();
        require(corrections.hasPendingForEmployeeYear(TENANT, EMPLOYEE, "2026-01", "2027-01"), "pending correction matches employee and year");
        equal(1L, queries.selects("hr_payroll_correction"), "correction existence uses one SQL statement");
        require(!corrections.hasPendingForEmployeeYear(TENANT, OTHER, "2026-01", "2027-01"), "another employee correction excluded");
        require(!corrections.hasPendingForEmployeeYear(TENANT, EMPLOYEE, "2027-01", "2028-01"), "another year correction excluded");
        jdbc.update("UPDATE hr_payroll_correction SET status='APPROVED' WHERE correction_id=?", slipId);
        require(!corrections.hasPendingForEmployeeYear(TENANT, EMPLOYEE, "2026-01", "2027-01"), "completed correction does not block");
        jdbc.update("UPDATE hr_payroll_correction SET status='PENDING' WHERE correction_id=?", slipId);
        jdbc.update("UPDATE hr_salary_slip SET tenant_id=? WHERE id=?", FOREIGN, slipId);
        require(!corrections.hasPendingForEmployeeYear(TENANT, EMPLOYEE, "2026-01", "2027-01"), "cross tenant slip cannot join correction");
    }

    private void trainingArchive() {
        long courseId = REQUISITION + 300;
        jdbc.update("INSERT INTO hr_training_course(id,tenant_id,course_code,course_name,credit_hours,status) VALUES(?,?,'QUALITY-TRAIN','核验课程',3.50,'PUBLISHED')", courseId, TENANT);
        jdbc.update("INSERT INTO hr_training_session(id,tenant_id,course_id,session_no,start_time,end_time,status) VALUES(?,?,?,'QUALITY-TRAIN-SESSION','2026-11-01 09:00:00','2026-11-01 12:30:00','COMPLETED')", courseId, TENANT, courseId);
        jdbc.update("INSERT INTO hr_training_enrollment(tenant_id,session_id,employee_id,status,completion_status) VALUES(?,?,?,'APPROVED','PASSED')", TENANT, courseId, EMPLOYEE);
        HrTrainingArchiveServiceImpl archive = new HrTrainingArchiveServiceImpl(mapper(HrTrainingEnrollmentMapper.class), mapper(HrTrainingCertificateMapper.class),
                mapper(HrTrainingCourseMapper.class), mapper(HrTrainingSessionMapper.class), mapper(HrEmployeeMapper.class), mapper(HrTrainingArchiveMapper.class), new HrEssSupport(null));
        queries.clear(); Map<String, Object> first = archive.forEmployee(EMPLOYEE);
        equal(new BigDecimal("3.50"), first.get("totalCreditHours"), "uncached archive total matches current enrollment");
        equal(1, first.get("completedCount"), "uncached archive completion total");
        equal(1L, queries.selects("hr_training_enrollment"), "uncached archive aggregates enrollment once");
        equal(0L, number("SELECT COUNT(*) FROM hr_training_archive WHERE tenant_id=?", TENANT), "archive read does not write cached summary");
        jdbc.update("INSERT INTO hr_training_archive(tenant_id,employee_id,total_hours,completion_count) VALUES(?,?,99,99)", TENANT, EMPLOYEE);
        queries.clear(); Map<String, Object> stale = archive.forEmployee(EMPLOYEE);
        equal(new BigDecimal("3.50"), stale.get("totalCreditHours"), "stale summary cannot replace current total");
        equal(1, stale.get("completedCount"), "stale summary cannot replace completion count");
        equal(1L, queries.selects("hr_training_enrollment"), "cached archive still reads current enrollment once");
        equal(0L, queries.selects("hr_training_archive"), "detail does not read unused cached summary");
        jdbc.update("UPDATE hr_training_enrollment SET completion_status='PENDING' WHERE tenant_id=? AND employee_id=?", TENANT, EMPLOYEE);
        Map<String, Object> pending = archive.forEmployee(EMPLOYEE);
        equal(BigDecimal.ZERO, pending.get("totalCreditHours"), "changed completion reflected without stale summary");
        equal(1, pending.get("ongoingCount"), "ongoing count shares current detail source");
    }

    private void leaveAndResume() throws Exception {
        long candidateId = REQUISITION + 400;
        jdbc.update("INSERT INTO hr_candidate(id,tenant_id,candidate_no,name,status,create_by) VALUES(?,?,'QUALITY-SKILLS','技能核验','SCREENING','quality')", candidateId, TENANT);
        HrRecruitmentIdentityService identities = new HrRecruitmentIdentityService(mapper(HrRecruitmentIdentityMapper.class), mapper(HrCandidateMapper.class), transactions);
        HrResumeParserServiceImpl parser = new HrResumeParserServiceImpl(mapper(HrResumeParsedFieldsMapper.class), mapper(HrCandidateMapper.class), json, identities);
        Long parsedId = parser.parseResume(candidateId, null, "技能：Java、Python、Redis");
        List<String> parsedSkills = json.convertValue(parser.listParsed(candidateId).get(0).getParsedSkills(), new com.fasterxml.jackson.core.type.TypeReference<List<String>>() { });
        require(parsedSkills.containsAll(List.of("Java", "Python", "Redis")), "automatic resume parsing returns a skill list");
        equal("ARRAY", jdbc.queryForObject("SELECT JSON_TYPE(parsed_skills) FROM hr_resume_parsed_fields WHERE id=?", String.class, parsedId), "automatic parsing persists JSON array");
        HrResumeParsedFieldsPayload edit = json.readValue("{\"parsedSkills\":[\" Java \",\"Redis\",\"Java\"]}", HrResumeParsedFieldsPayload.class);
        parser.updateParsed(parsedId, edit);
        equal(json.valueToTree(List.of("Java", "Redis")), parser.listParsed(candidateId).get(0).getParsedSkills(), "manual skill edit trims and deduplicates array elements");
        edit.setParsedSkills(List.of()); parser.updateParsed(parsedId, edit); parser.confirmParsed(parsedId);
        equal(json.createArrayNode(), parser.listParsed(candidateId).get(0).getParsedSkills(), "empty skill list survives confirmation");
        try { json.readValue("{\"parsedSkills\":\"Java,Redis\"}", HrResumeParsedFieldsPayload.class); throw new AssertionError("legacy skill string accepted"); }
        catch (com.fasterxml.jackson.databind.exc.MismatchedInputException expected) { checks++; }
        edit.setParsedSkills(List.of(" "));
        try { parser.updateParsed(parsedId, edit); throw new AssertionError("empty skill name accepted"); }
        catch (IllegalArgumentException expected) { checks++; }
        identity(USER, FOREIGN, 0, Set.of("admin"));
        rejected(() -> parser.listParsed(candidateId), "parsed skills keep tenant boundary");
        identity(USER, TENANT, 0, Set.of("admin"));

        long leaveTypeId = candidateId + 10;
        long firstPeriod = candidateId + 11;
        long secondPeriod = candidateId + 12;
        jdbc.update("INSERT INTO hr_leave_type(id,tenant_id,leave_code,leave_name,need_quota,unit,status,rounding_mode) VALUES(?,?,'QUALITY-LEAVE','逐日复用',0,'HOUR',1,'NONE')", leaveTypeId, TENANT);
        jdbc.update("INSERT INTO hr_leave_period(period_id,tenant_id,period_name,start_date,end_date,status) VALUES(?,?,'质量周期一','2026-01-01','2026-11-30','OPEN'),(?,?,'质量周期二','2026-12-01','2026-12-31','OPEN')", firstPeriod, TENANT, secondPeriod, TENANT);
        Map<LocalDate, Integer> dailyCalls = new LinkedHashMap<>();
        HrLeaveDayCalculator daily = new HrLeaveDayCalculator(null, null, null, null) {
            @Override public BigDecimal quantity(Long employee, HrLeaveType type, LocalDate date, LocalDateTime start, LocalDateTime end) {
                dailyCalls.merge(date, 1, Integer::sum);
                return date.isBefore(start.toLocalDate()) ? BigDecimal.ZERO : new BigDecimal("0.33333333");
            }
        };
        HrRuleSupport localLocks = new HrRuleSupport(transactions, null, mapper(HrEmployeeMapper.class), mapper(HrAuditLogMapper.class), json, mapper(HrPositionMapper.class)) {
            @Override public <T> T locked(String resource, Supplier<T> action) { return action.get(); }
        };
        AtomicInteger enqueued = new AtomicInteger();
        HrRuleWorkflowService workflow = new HrRuleWorkflowService(null, json, null, null, crud, localLocks, null, null, null, null, null, null, null, null, null, null) {
            @Override public void enqueue(String kind, Long id, String number, String title, Map<String, Object> variables) { enqueued.incrementAndGet(); }
        };
        BusinessRuleClient rules = (BusinessRuleClient) Proxy.newProxyInstance(BusinessRuleClient.class.getClassLoader(), new Class<?>[]{BusinessRuleClient.class}, (proxy, method, values) -> {
            if ("getEffectiveRule".equals(method.getName())) { BusinessRuleDTO rule = new BusinessRuleDTO(); rule.setEnabled(1); rule.setEffect("PASS"); return R.ok(rule); }
            if ("recordHit".equals(method.getName())) return R.ok();
            throw new AssertionError("unexpected rule call " + method.getName());
        });
        HrLeaveBusinessService leave = new HrLeaveBusinessService(mapper(HrLeaveTypeMapper.class), null, workflow, mapper(HrLeaveQuotaMapper.class),
                mapper(HrLeaveLedgerMapper.class), mapper(HrLeavePeriodMapper.class), mapper(HrLeavePolicyAssignmentMapper.class), mapper(HrLeavePolicyDetailMapper.class),
                mapper(HrEarnedLeaveScheduleMapper.class), mapper(HrEmployeeMapper.class), mapper(HrTimeRequestMapper.class), null, crud, null, localLocks, rules,
                mapper(HrFileStorageMapper.class), null, daily, mapper(HrHMapper.class));
        HrTimeRequestPayload request = new HrTimeRequestPayload(); request.setEmployeeId(EMPLOYEE); request.setLeaveTypeId(leaveTypeId);
        request.setStartTime(LocalDateTime.of(2026, 11, 30, 9, 0)); request.setEndTime(LocalDateTime.of(2026, 12, 1, 12, 0));
        Long requestId = leave.submit(request);
        equal(Map.of(LocalDate.of(2026, 11, 29), 1, LocalDate.of(2026, 11, 30), 1, LocalDate.of(2026, 12, 1), 1), dailyCalls, "submission computes each date including night-shift lookback only once");
        equal("0.67", jdbc.queryForObject("SELECT duration FROM hr_time_request WHERE id=?", String.class, requestId), "submission rounds aggregate duration once");
        Object portions = localLocks.auditDetail("TIME_REQUEST", requestId, "LEAVE_SUBMIT").get("periodQuantities");
        require(portions instanceof Map<?, ?>, "submission saves period quantities");
        Map<?, ?> quantities = (Map<?, ?>) portions;
        equal(new BigDecimal("0.33"), new BigDecimal(quantities.get(String.valueOf(firstPeriod)).toString()), "first period keeps cumulative rounded fraction");
        equal(new BigDecimal("0.34"), new BigDecimal(quantities.get(String.valueOf(secondPeriod)).toString()), "last period receives rounding remainder");
        equal(1, enqueued.get(), "one workflow enqueue after submission");
    }

    private void performanceAndWorkflow() {
        long objectiveId = REQUISITION + 500;
        long invitationId = objectiveId + 1;
        jdbc.update("INSERT INTO hr_performance_objective(id,tenant_id,objective_no,cycle_name,cycle_start_date,cycle_end_date,objective_name) VALUES(?,?,'QUALITY-PERF','质量周期','2026-01-01','2026-12-31','质量目标')", objectiveId, TENANT);
        jdbc.update("INSERT INTO hr_perf_evaluator(id,tenant_id,objective_id,evaluatee_id,evaluator_id,evaluator_source,status,weight) VALUES(?,?,?,?,?,'PEER','PENDING',100)", invitationId, TENANT, objectiveId, EMPLOYEE, OTHER);
        HrAppraisalGuard guard = new HrAppraisalGuard(mapper(HrAppraisalCycleMapper.class), mapper(HrAppraisalResultMapper.class), mapper(HrPerformanceObjectiveMapper.class), mapper(HrPerformanceAssignmentMapper.class), null);
        HrPerformance360ServiceImpl performance = new HrPerformance360ServiceImpl(mapper(HrPerfEvaluatorMapper.class), mapper(HrPerfEvaluatorResponseMapper.class),
                mapper(HrPerformanceResultMapper.class), mapper(HrAuditLogMapper.class), json, guard, null);
        Hr360EvaluatorResponsePayload response = new Hr360EvaluatorResponsePayload(); response.setEvaluatorId(invitationId); response.setScore(new BigDecimal("87.50")); response.setCommentText("核验评分");
        performance.submitResponse(response);
        equal("SUBMITTED", jdbc.queryForObject("SELECT status FROM hr_perf_evaluator WHERE id=?", String.class, invitationId), "score submission updates real invitation");
        List<Map<String, Object>> scores = mapper(HrPerfEvaluatorMapper.class).selectAggregationRows(TENANT, objectiveId, EMPLOYEE);
        equal(1, scores.size(), "score aggregation joins response through invitation ID");
        equal("PEER", scores.get(0).get("evaluatorSource"), "source read from invitation after redundant column removal");
        equal(new BigDecimal("87.50"), scores.get(0).get("score"), "submitted score stored without redundant dimensions");
        identity(USER, FOREIGN, 0, Set.of("admin"));
        equal(0, mapper(HrPerfEvaluatorMapper.class).selectAggregationRows(FOREIGN, objectiveId, EMPLOYEE).size(), "performance aggregation tenant isolation");
        identity(USER, TENANT, 0, Set.of("admin"));

        AtomicReference<R<ProcessStartResult>> remote = new AtomicReference<>(R.ok(new ProcessStartResult("instance-quality", "WF-QUALITY")));
        AtomicInteger requests = new AtomicInteger();
        WorkflowServiceClient client = (WorkflowServiceClient) Proxy.newProxyInstance(WorkflowServiceClient.class.getClassLoader(), new Class<?>[]{WorkflowServiceClient.class}, (proxy, method, values) -> {
            if (method.isDefault()) return java.lang.reflect.InvocationHandler.invokeDefault(proxy, method, values);
            if ("startProcessInternal".equals(method.getName())) { requests.incrementAndGet(); return remote.get(); }
            throw new AssertionError("unexpected workflow call " + method.getName());
        });
        ProcessStartDTO start = new ProcessStartDTO(); start.setProcessDefinitionKey("wf_hr_leave"); start.setBusinessType("HR_TIME_REQUEST"); start.setBusinessId(1L); start.setTenantId(TENANT); start.setStartUserId(USER);
        equal("instance-quality", client.startProcess(start).getData(), "HR adapter accepts the single shared start response");
        equal(1, requests.get(), "HR adapter issues one remote start");
        remote.set(R.fail("故障需重试")); require(!client.startProcess(start).isSuccess(), "remote failed start remains a failure");
        remote.set(R.ok(null)); require(!client.startProcess(start).isSuccess(), "missing response object cannot bind an instance");
        for (String invalid : List.of(" ", "X".repeat(65), "instance\ncontrol")) {
            remote.set(R.ok(new ProcessStartResult(invalid, null)));
            try { client.startProcess(start); throw new AssertionError("invalid instance ID accepted"); }
            catch (IllegalStateException expected) { checks++; }
        }
    }

    private void prepareCallbackSchema(Path module) throws IOException {
        String ddl = Files.readString(module.getParent().resolve("DB/02.cloudflow-workflow.sql"));
        String start = "CREATE TABLE wf_callback_side_effect (";
        int offset = ddl.indexOf(start);
        require(offset >= 0, "callback marker table exists in current DDL");
        jdbc.execute(ddl.substring(offset, ddl.indexOf(';', offset)).replace(start, "CREATE TABLE IF NOT EXISTS wf_callback_side_effect ("));
    }

    private void departmentLeadership() {
        long currentLeader = REQUISITION + 600;
        long parentLeader = currentLeader + 1;
        long foreignLeader = currentLeader + 2;
        long role = currentLeader + 3;
        for (long userId : List.of(USER, currentLeader, parentLeader, foreignLeader)) {
            jdbc.update("INSERT INTO sys_user(user_id,tenant_id,dept_id,user_name,nick_name) VALUES(?,?,?,?, '负责人核验')",
                    userId, userId == foreignLeader ? FOREIGN : TENANT, DEPT, "leader_" + userId);
        }
        jdbc.update("INSERT INTO sys_role(role_id,tenant_id,role_name,role_key,role_sort,ds_type) VALUES(?,?,'负责人核验','admin',1,0)", role, TENANT);
        for (long userId : List.of(USER, currentLeader, parentLeader)) jdbc.update("INSERT INTO sys_user_role(user_id,role_id,tenant_id) VALUES(?,?,?)", userId, role, TENANT);
        jdbc.update("UPDATE sys_dept SET parent_id=?,leader_user_id=? WHERE dept_id=?", INCIDENT_DEPT, currentLeader, DEPT);
        jdbc.update("UPDATE sys_dept SET leader_user_id=? WHERE dept_id=?", parentLeader, INCIDENT_DEPT);
        HrHMapper lookups = mapper(HrHMapper.class);
        HrAdvanceApprovalSupport approvals = new HrAdvanceApprovalSupport(mapper(HrAdvanceApplicationMapper.class), lookups, null, null);
        Supplier<Long> selected = () -> approvals.requireDepartmentLeader(DEPT, USER,
                Set.copyOf(lookups.permissionUsers(TENANT, "workflow:task:complete", DEPT)));
        equal(currentLeader, selected.get(), "active current department leader with real permission is selected");
        jdbc.update("UPDATE sys_dept SET leader_user_id=NULL WHERE dept_id=?", DEPT);
        equal(parentLeader, selected.get(), "empty current leader falls back to parent");
        jdbc.update("UPDATE sys_dept SET leader_user_id=? WHERE dept_id=?", USER, DEPT);
        equal(parentLeader, selected.get(), "applicant cannot approve own advance");
        jdbc.update("UPDATE sys_dept SET leader_user_id=? WHERE dept_id=?", foreignLeader, DEPT);
        equal(parentLeader, selected.get(), "foreign tenant user cannot become current leader");
        jdbc.update("UPDATE sys_dept SET leader_user_id=? WHERE dept_id=?", currentLeader, DEPT);
        jdbc.update("UPDATE sys_user SET status='1' WHERE user_id=?", currentLeader);
        equal(parentLeader, selected.get(), "disabled user falls back to parent");
        jdbc.update("UPDATE sys_user SET status='0',deleted=1 WHERE user_id=?", currentLeader);
        equal(parentLeader, selected.get(), "deleted user falls back to parent");
        jdbc.update("UPDATE sys_user SET deleted=0 WHERE user_id=?", currentLeader);
        jdbc.update("DELETE FROM sys_user_role WHERE user_id=? AND role_id=?", currentLeader, role);
        equal(parentLeader, selected.get(), "leader without real approval permission falls back to parent");
        jdbc.update("INSERT INTO sys_user_role(user_id,role_id,tenant_id) VALUES(?,?,?)", currentLeader, role, TENANT);
        jdbc.update("UPDATE sys_dept SET status='1' WHERE dept_id=?", DEPT);
        equal(parentLeader, selected.get(), "disabled department keeps parent traversal only");
        jdbc.update("UPDATE sys_dept SET status='0',leader_user_id=NULL WHERE dept_id=?", DEPT);
        jdbc.update("UPDATE sys_dept SET leader_user_id=NULL WHERE dept_id=?", INCIDENT_DEPT);
        rejected(() -> selected.get(), "missing leader over entire chain rejects submission");
        jdbc.update("UPDATE sys_dept SET parent_id=? WHERE dept_id=?", DEPT, INCIDENT_DEPT);
        rejected(() -> selected.get(), "department cycle rejects submission");
        jdbc.update("UPDATE sys_dept SET parent_id=0,tenant_id=?,leader_user_id=? WHERE dept_id=?", FOREIGN, parentLeader, INCIDENT_DEPT);
        rejected(() -> selected.get(), "foreign parent department cannot be traversed");
        jdbc.update("UPDATE sys_dept SET tenant_id=? WHERE dept_id=?", TENANT, INCIDENT_DEPT);
        jdbc.update("UPDATE sys_dept SET parent_id=0 WHERE dept_id=?", DEPT);
    }

    private void approvalCallbacks() {
        AtomicInteger notices = new AtomicInteger();
        HrMessageService messages = new HrMessageService(null, null) {
            @Override public void sendToEmployee(Long tenant, Long employee, String category, String title, String content, String link, String type, Long id) {
                notices.incrementAndGet();
            }
        };
        HrWorkflowCallbackServiceImpl callback = transactional(new HrWorkflowCallbackServiceImpl(
                crud, null, null, mapper(HrOfferMapper.class), mapper(HrCandidateMapper.class),
                mapper(HrRecruitmentRequisitionMapper.class), mapper(HrPositionMapper.class), mapper(HrEmployeeMapper.class),
                mapper(HrTrainingEnrollmentMapper.class), mapper(HrTrainingSessionMapper.class), null, null,
                mapper(HrTalentReviewParticipantMapper.class), mapper(HrTalentSuccessorMapper.class), null, messages,
                mapper(HrMallOrderMapper.class), null, mapper(HrWorkInjuryMapper.class), mapper(WfCallbackSideEffectMapper.class),
                null, null, null, support, json, null, null, null, null, null, null, null), HrWorkflowCallbackServiceImpl.class);
        long benefit = REQUISITION + 700;
        jdbc.update("INSERT INTO hr_benefit_request(id,tenant_id,request_no,employee_id,status,process_instance_id) VALUES(?,?,'QUALITY-CALLBACK',?,'APPROVING','benefit-current')", benefit, TENANT, EMPLOYEE);
        rejected(() -> callback.handleApprovalResult(result("HR_BENEFIT_REQUEST", benefit, " ")), "blank instance cannot bypass instance matching");
        callback.handleApprovalResult(result("HR_BENEFIT_REQUEST", benefit, "benefit-old"));
        equal("APPROVING", status("hr_benefit_request", benefit), "wrong instance cannot update pending benefit");
        equal(0L, number("SELECT COUNT(*) FROM wf_callback_side_effect WHERE business_id=?", benefit), "wrong instance produces no marker");
        ApprovalResultDTO foreign = result("HR_BENEFIT_REQUEST", benefit, "benefit-current"); foreign.setTenantId(FOREIGN);
        callback.handleApprovalResult(foreign);
        equal("APPROVING", status("hr_benefit_request", benefit), "foreign tenant callback cannot update benefit");
        equal(TENANT, TenantContext.getTenantId(), "callback restores tenant context");
        ApprovalResultDTO approved = result("HR_BENEFIT_REQUEST", benefit, "benefit-current");
        callback.handleApprovalResult(approved);
        equal("APPROVED", status("hr_benefit_request", benefit), "correct benefit instance is approved");
        require(jdbc.queryForObject("SELECT paid_at FROM hr_benefit_request WHERE id=?", LocalDateTime.class, benefit) != null, "approved benefit side effect writes paid time");
        equal("HR_BENEFIT_REQUEST", jdbc.queryForObject("SELECT business_type FROM wf_callback_side_effect WHERE business_id=?", String.class, benefit), "marker preserves exact registered type");
        long audits = number("SELECT COUNT(*) FROM hr_audit_log WHERE business_id=?", benefit);
        callback.handleApprovalResult(approved);
        equal(audits, number("SELECT COUNT(*) FROM hr_audit_log WHERE business_id=?", benefit), "repeated callback has no repeated updates");
        equal(1L, number("SELECT COUNT(*) FROM wf_callback_side_effect WHERE business_id=?", benefit), "repeated callback produces one marker");
        long objective = benefit + 1;
        jdbc.update("INSERT INTO hr_performance_objective(id,tenant_id,objective_no,cycle_name,cycle_start_date,cycle_end_date,objective_name,status,plan_process_instance_id,result_process_instance_id) VALUES(?,?,'QUALITY-CB-PERF','质量周期','2026-01-01','2026-12-31','回调目标','PLAN_APPROVING','plan-current','result-current')", objective, TENANT);
        callback.handleApprovalResult(result("HR_PERFORMANCE_RESULT", objective, "result-current"));
        equal("PLAN_APPROVING", status("hr_performance_objective", objective), "result callback cannot close plan approval");
        callback.handleApprovalResult(result("HR_PERFORMANCE_PLAN", objective, "result-current"));
        equal("PLAN_APPROVING", status("hr_performance_objective", objective), "plan callback uses plan instance field");
        callback.handleApprovalResult(result("HR_PERFORMANCE_PLAN", objective, "plan-current"));
        equal("PLAN_APPROVED", status("hr_performance_objective", objective), "plan callback accepts plan approving state");
        jdbc.update("UPDATE hr_performance_objective SET status='RESULT_APPROVING' WHERE id=?", objective);
        callback.handleApprovalResult(result("HR_PERFORMANCE_PLAN", objective, "plan-current"));
        equal("RESULT_APPROVING", status("hr_performance_objective", objective), "plan replay cannot change result approval");
        callback.handleApprovalResult(result("HR_PERFORMANCE_RESULT", objective, "result-current"));
        equal("COMPLETED", status("hr_performance_objective", objective), "result callback accepts result approving state");
        long lifecycle = benefit + 2;
        jdbc.update("INSERT INTO hr_lifecycle_application(id,tenant_id,application_no,type,status,process_instance_id) VALUES(?,?,'QUALITY-CB-LIFE','TRANSFER','APPROVING','lifecycle-current')", lifecycle, TENANT);
        callback.handleApprovalResult(result("HR_LIFECYCLE", lifecycle, "lifecycle-current"));
        equal("APPROVED", status("hr_lifecycle_application", lifecycle), "registered lifecycle callback routes successfully");
        long compensation = benefit + 3;
        jdbc.update("INSERT INTO hr_comp_change(id,tenant_id,change_no,employee_id,change_type,after_total,effective_date,status,process_instance_id) VALUES(?,?,'QUALITY-CB-COMP',?,'ADJUSTMENT','100','2026-11-01','APPROVING','comp-current')", compensation, TENANT, EMPLOYEE);
        callback.handleApprovalResult(result("HR_COMP_CHANGE", compensation, "comp-current"));
        equal("APPROVED", status("hr_comp_change", compensation), "registered compensation callback routes successfully");
        long requisition = benefit + 6;
        jdbc.update("INSERT INTO hr_recruitment_requisition(id,tenant_id,requisition_no,title,status,process_instance_id) VALUES(?,?,'QUALITY-CB-REQ','审批招聘','APPROVING','requisition-current')", requisition, TENANT);
        callback.handleApprovalResult(result("HR_RECRUITMENT", requisition, "requisition-current"));
        equal("RECRUITING", status("hr_recruitment_requisition", requisition), "registered recruitment callback opens recruiting");
        long succession = benefit + 4;
        jdbc.update("INSERT INTO hr_talent_succession_plan(id,tenant_id,plan_no,plan_name,position_id,status,process_instance_id) VALUES(?,?,'QUALITY-CB-SUCCESSION','继任核验',?,'IN_PROGRESS','succession-current')", succession, TENANT, POSITION);
        callback.handleApprovalResult(result("HR_TALENT_SUCCESSION", succession, "succession-current"));
        equal("PUBLISHED", status("hr_talent_succession_plan", succession), "succession accepts actual in-progress state");
        long injury = benefit + 5;
        jdbc.update("INSERT INTO hr_work_injury(id,tenant_id,injury_no,employee_id,occurred_at,status,process_instance_id) VALUES(?,?,'QUALITY-CB-INJURY',?,'2026-11-01 09:00:00','DETERMINING','injury-current')", injury, TENANT, EMPLOYEE);
        callback.handleApprovalResult(result("HR_WORK_INJURY", injury, "injury-current"));
        equal("DETERMINED", status("hr_work_injury", injury), "work injury accepts actual determining state");
        callback.handleApprovalResult(result("HR_WORK_INJURY", injury, "injury-current"));
        equal(1, notices.get(), "work injury callback notification occurs once");
        rejected(() -> callback.handleApprovalResult(result("RECRUITMENT_REQUEST", requisition, "requisition-current")), "legacy guessed business type rejected");
        rejected(() -> callback.handleApprovalResult(null), "null callback rejected before logging");
    }

    private void onboardingProtocol() {
        RuntimeSysConfigService configuration = new RuntimeSysConfigService(settings) {
            @Override public String getString(String key, String fallback) { return fallback; }
        };
        HrEmployeeOnboardingService onboarding = new HrEmployeeOnboardingService(null, null, crud, null, configuration,
                mapper(HrEmployeeMapper.class), mapper(HrLifecycleApplicationMapper.class), mapper(HrLifecycleDetailMapper.class), json, transactions, null);
        com.cloudflow.hr.domain.dto.HrEmployeePayload employee = new com.cloudflow.hr.domain.dto.HrEmployeePayload();
        employee.setEmployeeNo("QUALITY-NEW"); employee.setName("协议核验");
        com.cloudflow.hr.domain.dto.HrLifecycleApplicationPayload application = new com.cloudflow.hr.domain.dto.HrLifecycleApplicationPayload();
        application.setApplicationNo("QUALITY-ONBOARDING");
        ProcessStartDTO request = (ProcessStartDTO) invokePrivate(onboarding, "createWorkflowRequest", new Class<?>[]{Long.class,
                com.cloudflow.hr.domain.dto.HrLifecycleApplicationPayload.class, com.cloudflow.hr.domain.dto.HrEmployeePayload.class, Map.class},
                REQUISITION + 800, application, employee, Map.of());
        equal("HR_LIFECYCLE", request.getBusinessType(), "onboarding sends registered lifecycle type");
        invokePrivate(onboarding, "validateWorkflowRequest", new Class<?>[]{ProcessStartDTO.class}, request);
        checks++;
        request.setBusinessType("ONBOARDING");
        rejected(() -> invokePrivate(onboarding, "validateWorkflowRequest", new Class<?>[]{ProcessStartDTO.class}, request), "unregistered onboarding start type rejected");
        for (int index = 0; index < 3; index++) {
            long id = REQUISITION + 800 + index;
            jdbc.update("INSERT INTO hr_lifecycle_application(id,tenant_id,application_no,type,status) VALUES(?,?,?,'ONBOARDING','APPROVING')", id, TENANT, "QUALITY-PENDING-" + index);
            jdbc.update("INSERT INTO hr_lifecycle_detail(id,tenant_id,application_id,detail_type,detail_json) VALUES(?,?,?,'ONBOARDING',?)", id, TENANT, id, "{\"employeeNo\":\"QUALITY-PENDING-" + index + "\"}");
        }
        queries.clear();
        invokePrivate(onboarding, "assertEmployeeNoAvailable", new Class<?>[]{String.class, Long.class}, "QUALITY-NEW", null);
        equal(1L, queries.selects("hr_lifecycle_detail"), "onboarding duplicate check batches all pending details");
        rejected(() -> invokePrivate(onboarding, "assertEmployeeNoAvailable", new Class<?>[]{String.class, Long.class}, "QUALITY-PENDING-1", null), "batch lookup rejects pending duplicate employee number");
        invokePrivate(onboarding, "assertEmployeeNoAvailable", new Class<?>[]{String.class, Long.class}, "QUALITY-PENDING-1", REQUISITION + 801);
        checks++;
    }

    private static Object invokePrivate(Object target, String name, Class<?>[] types, Object... arguments) {
        try {
            Method method = target.getClass().getDeclaredMethod(name, types); method.setAccessible(true);
            return method.invoke(target, arguments);
        } catch (InvocationTargetException failure) {
            if (failure.getCause() instanceof RuntimeException runtime) throw runtime;
            throw new IllegalStateException(failure.getCause());
        } catch (ReflectiveOperationException failure) { throw new IllegalStateException(failure); }
    }

    private static ApprovalResultDTO result(String type, long id, String instance) {
        ApprovalResultDTO dto = new ApprovalResultDTO(); dto.setTenantId(TENANT); dto.setBusinessType(type);
        dto.setBusinessId(id); dto.setProcessInstanceId(instance); dto.setApprovalResult("APPROVED"); return dto;
    }
    private String status(String table, long id) { return jdbc.queryForObject("SELECT status FROM " + table + " WHERE id=?", String.class, id); }
    private <T> T mapper(Class<T> type) { return sessions.getMapper(type); }
    private static ObjectMapper productionJson() {
        HrJacksonConfig configuration = new HrJacksonConfig();
        Jackson2ObjectMapperBuilder builder = Jackson2ObjectMapperBuilder.json();
        configuration.hrJacksonCustomizer().customize(builder);
        return configuration.objectMapper(builder);
    }
    private <T> T transactional(T target, Class<T> type) {
        ProxyFactory proxy = new ProxyFactory(target); proxy.setProxyTargetClass(true);
        proxy.addAdvice(new TransactionInterceptor(transactions, new AnnotationTransactionAttributeSource()));
        return type.cast(proxy.getProxy());
    }
    private long number(String sql, Object argument) { return Objects.requireNonNull(jdbc.queryForObject(sql, Long.class, argument)); }
    private static void identity(long user, long tenant, int scope, Set<String> roles) {
        UserContext.setUserId(user); UserContext.setTenantId(tenant); UserContext.setUserName("quality"); UserContext.setRoles(roles);
        UserContext.setDsType(scope); UserContext.setDeptId(DEPT); UserContext.setDsDeptIds(List.of(DEPT)); TenantContext.setTenantId(tenant);
    }
    private static void equal(Object expected, Object actual, String label) { require(Objects.equals(expected, actual), label + "; expected=" + expected + "; actual=" + actual); }
    private static void require(boolean valid, String label) { if (!valid) throw new AssertionError(label); checks++; }
    private static void rejected(Runnable operation, String label) {
        try { operation.run(); } catch (HrBusinessException | HrHException expected) { checks++; return; }
        throw new AssertionError(label + ": accepted");
    }
    @Override public void close() { application.close(); }

    @Intercepts(@Signature(type = StatementHandler.class, method = "prepare", args = {Connection.class, Integer.class}))
    public static final class SqlCounter implements Interceptor {
        private final List<String> statements = new ArrayList<>();
        @Override public Object intercept(Invocation invocation) throws Throwable {
            statements.add(((StatementHandler) invocation.getTarget()).getBoundSql().getSql().replaceAll("\\s+", " ").toLowerCase(java.util.Locale.ROOT));
            return invocation.proceed();
        }
        void clear() { statements.clear(); }
        long selects(String table) { return statements.stream().filter(sql -> sql.startsWith("select ") && sql.contains(" from " + table + " ")).count(); }
    }

    private record BytesFile(String originalFilename, byte[] bytes) implements MultipartFile {
        @Override public String getName() { return "file"; }
        @Override public String getOriginalFilename() { return originalFilename; }
        @Override public String getContentType() { return "text/plain"; }
        @Override public boolean isEmpty() { return bytes.length == 0; }
        @Override public long getSize() { return bytes.length; }
        @Override public byte[] getBytes() { return bytes; }
        @Override public InputStream getInputStream() { return new ByteArrayInputStream(bytes); }
        @Override public void transferTo(File destination) throws IOException { Files.write(destination.toPath(), bytes); }
    }
}
