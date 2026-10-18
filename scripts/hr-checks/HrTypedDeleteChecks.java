package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.config.GlobalConfig;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.metadata.TableInfo;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.baomidou.mybatisplus.core.toolkit.GlobalConfigUtils;
import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.cloudflow.common.config.MybatisPlusConfig;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.handler.MyMetaObjectHandler;
import com.cloudflow.common.holiday.api.HolidayCalendarService;
import com.cloudflow.common.tenant.TenantConfigProperties;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.hr.domain.entity.HrEmployee;
import com.cloudflow.hr.domain.dto.HrEmployeePayload;
import com.cloudflow.hr.domain.entity.HrFamilyMember;
import com.cloudflow.hr.domain.entity.HrJobLevel;
import com.cloudflow.hr.domain.entity.HrPerformanceInterview;
import com.cloudflow.hr.domain.entity.HrSalarySlip;
import com.cloudflow.hr.domain.entity.HrScheduleAssignment;
import com.cloudflow.hr.domain.entity.HrTaxDeduction;
import com.cloudflow.hr.domain.entity.HrTrainingCategory;
import com.cloudflow.hr.domain.entity.HrTrainingCourse;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrAuditLogMapper;
import com.cloudflow.hr.mapper.HrEmployeeMapper;
import com.cloudflow.hr.mapper.HrFamilyMemberMapper;
import com.cloudflow.hr.mapper.HrJobLevelMapper;
import com.cloudflow.hr.mapper.HrPerformanceInterviewMapper;
import com.cloudflow.hr.mapper.HrSalarySlipMapper;
import com.cloudflow.hr.mapper.HrScheduleAssignmentMapper;
import com.cloudflow.hr.mapper.HrTaxDeductionMapper;
import com.cloudflow.hr.mapper.HrTrainingCategoryMapper;
import com.cloudflow.hr.mapper.HrTrainingCourseMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.zaxxer.hikari.HikariDataSource;
import java.beans.Introspector;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.LinkedHashMap;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.context.support.StaticApplicationContext;
import org.springframework.core.io.FileSystemResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

public final class HrTypedDeleteChecks {
    private static final long TENANT = 982092801L;
    private static final long OTHER_TENANT = 982092802L;
    private static final long BASE = 98209280000L;
    private static int assertions;
    private record Probe(Class<?> type, Class<?> mapper, String insert, String check, boolean logical, boolean versioned) { }
    private static final List<Probe> PROBES = List.of(
            new Probe(HrPerformanceInterview.class, HrPerformanceInterviewMapper.class,
                    "INSERT INTO hr_performance_interview(id,tenant_id,objective_id,evaluatee_id,interviewer_id,interview_time) VALUES(?,?,1,1,1,NOW())",
                    "SELECT deleted FROM hr_performance_interview WHERE id=? AND tenant_id=?", true, true),
            new Probe(HrFamilyMember.class, HrFamilyMemberMapper.class,
                    "INSERT INTO hr_family_member(id,tenant_id,employee_id,member_name,relationship) VALUES(?,?,1,'删除回归成员','OTHER')",
                    "SELECT deleted FROM hr_family_member WHERE id=? AND tenant_id=?", true, false),
            new Probe(HrJobLevel.class, HrJobLevelMapper.class,
                    "INSERT INTO hr_job_level(id,tenant_id,level_code,level_name,level_series,level_rank) VALUES(?,?,'DELETE_CHECK','删除回归职级','P',1)",
                    "SELECT COUNT(*) FROM hr_job_level WHERE id=? AND tenant_id=?", false, true),
            new Probe(HrTrainingCategory.class, HrTrainingCategoryMapper.class,
                    "INSERT INTO hr_training_category(id,tenant_id,name) VALUES(?,?,'删除回归分类')",
                    "SELECT deleted FROM hr_training_category WHERE id=? AND tenant_id=?", true, true),
            new Probe(HrTrainingCourse.class, HrTrainingCourseMapper.class,
                    "INSERT INTO hr_training_course(id,tenant_id,course_code,course_name) VALUES(?,?,'DELETE_CHECK','删除回归课程')",
                    "SELECT deleted FROM hr_training_course WHERE id=? AND tenant_id=?", true, true),
            new Probe(HrEmployee.class, HrEmployeeMapper.class,
                    "INSERT INTO hr_employee(id,tenant_id,employee_no,name,gender) VALUES(?,?,'DELETE_CHECK','删除回归员工','UNKNOWN')",
                    "SELECT deleted FROM hr_employee WHERE id=? AND tenant_id=?", true, false),
            new Probe(HrScheduleAssignment.class, HrScheduleAssignmentMapper.class,
                    "INSERT INTO hr_schedule_assignment(id,tenant_id,target_type,target_id) VALUES(?,?,'EMPLOYEE',1)",
                    "SELECT COUNT(*) FROM hr_schedule_assignment WHERE id=? AND tenant_id=?", false, true),
            new Probe(HrSalarySlip.class, HrSalarySlipMapper.class,
                    "INSERT INTO hr_salary_slip(id,tenant_id,employee_id,period_month) VALUES(?,?,1,'2026-09')",
                    "SELECT deleted FROM hr_salary_slip WHERE id=? AND tenant_id=?", true, true));

    public static void main(String[] arguments) throws Exception {
        if (arguments.length != 3 || !arguments[0].startsWith("jdbc:mysql://127.0.0.1:")) throw new IllegalArgumentException("Owned loopback database and workspace required");
        Path root = Path.of(arguments[2]).toRealPath();
        Path expectedData = Path.of(arguments[1]).toRealPath();
        if (!expectedData.startsWith(root.resolve(".cloudflow-runtime/batch-g-integration"))) throw new IllegalArgumentException("Owned database directory required");
        try (HikariDataSource source = new HikariDataSource(); StaticApplicationContext application = new StaticApplicationContext()) {
            source.setJdbcUrl(arguments[0]); source.setUsername("root"); source.setPassword(""); source.setMaximumPoolSize(2); source.setPoolName("hr-delete-isolated-checks");
            JdbcTemplate jdbc = new JdbcTemplate(source);
            equal(expectedData, Path.of(jdbc.queryForObject("SELECT @@datadir", String.class)).toRealPath(), "owned data directory");
            equal(0L, jdbc.queryForObject("SELECT COUNT(*) FROM sys_tenant WHERE tenant_id IN (?,?)", Long.class, TENANT, OTHER_TENANT), "private fixture tenants absent");
            MybatisConfiguration configuration = new MybatisConfiguration(); configuration.setMapUnderscoreToCamelCase(true);
            configuration.setLogImpl(org.apache.ibatis.logging.nologging.NoLoggingImpl.class);
            GlobalConfig global = new GlobalConfig();
            global.setDbConfig(new GlobalConfig.DbConfig().setLogicDeleteField("deleted").setLogicDeleteValue("1").setLogicNotDeleteValue("0"));
            global.setMetaObjectHandler(new MyMetaObjectHandler()); GlobalConfigUtils.setGlobalConfig(configuration, global);
            for (Probe probe : PROBES) configuration.addMapper(probe.mapper());
            configuration.addMapper(HrAuditLogMapper.class); configuration.addMapper(HrTaxDeductionMapper.class);
            MybatisSqlSessionFactoryBean factory = new MybatisSqlSessionFactoryBean(); factory.setDataSource(source); factory.setConfiguration(configuration); factory.setGlobalConfig(global);
            factory.setPlugins(new MybatisPlusConfig(new TenantConfigProperties()).mybatisPlusInterceptor());
            factory.setMapperLocations(new FileSystemResource(root.resolve("cloudflow-backend/cloudflow-service-hr/src/main/resources/mapper/HrAuditLogMapper.xml")));
            SqlSessionTemplate sessions = new SqlSessionTemplate(Objects.requireNonNull(factory.getObject()));
            AtomicBoolean staleWrite = new AtomicBoolean(); AtomicInteger calendarInvalidations = new AtomicInteger();
            for (Probe probe : PROBES) {
                Object actual = sessions.getMapper(probe.mapper());
                Object decorated = Proxy.newProxyInstance(probe.mapper().getClassLoader(), new Class<?>[]{probe.mapper()}, (proxy, method, values) -> {
                    if (probe.type() == HrPerformanceInterview.class && method.getName().equals("update") && staleWrite.compareAndSet(true, false)) {
                        HrPerformanceInterview interview = (HrPerformanceInterview) values[0];
                        equal(1, jdbc.update("UPDATE hr_performance_interview SET version=version+1 WHERE id=? AND tenant_id=?", interview.getId(), TENANT), "simulate changed source version before actual mapper update");
                    }
                    try { return method.invoke(actual, values); }
                    catch (InvocationTargetException failure) { throw failure.getCause(); }
                });
                application.getBeanFactory().registerSingleton(Introspector.decapitalize(probe.type().getSimpleName()) + "Mapper", decorated);
            }
            application.getBeanFactory().registerSingleton("hrTaxDeductionMapper", sessions.getMapper(HrTaxDeductionMapper.class));
            application.getBeanFactory().registerSingleton("holidayCalendarService", Proxy.newProxyInstance(HolidayCalendarService.class.getClassLoader(), new Class<?>[]{HolidayCalendarService.class}, (proxy, method, values) -> {
                if (method.getName().equals("invalidateAssignments")) { calendarInvalidations.incrementAndGet(); return null; }
                if (method.getName().equals("toString")) return "calendar-invalidation-observer";
                throw new AssertionError("Unexpected calendar dependency method: " + method.getName());
            }));
            HrTypedCrudService service = new HrTypedCrudService(application, new ObjectMapper().findAndRegisterModules(), null, null, null, sessions.getMapper(HrAuditLogMapper.class), null, null, null, null, null);
            TransactionTemplate transaction = new TransactionTemplate(new DataSourceTransactionManager(source));
            identity();
            transaction.executeWithoutResult(status -> {
                try {
                    jdbc.update("INSERT INTO sys_tenant(tenant_id,tenant_code,tenant_name) VALUES(?,'HR_DELETE_CHECK','删除回归'),(?,'HR_DELETE_OTHER','删除隔离')", TENANT, OTHER_TENANT);
                    for (int index = 0; index < PROBES.size(); index++) {
                        Probe probe = PROBES.get(index); long ownId = BASE + index * 10; long foreignId = ownId + 1;
                        jdbc.update(probe.insert(), ownId, TENANT); jdbc.update(probe.insert(), foreignId, OTHER_TENANT);
                        TableInfo metadata = TableInfoHelper.getTableInfo(probe.type());
                        equal(probe.logical(), metadata.isWithLogicDelete(), "actual logical deletion metadata");
                        equal(probe.versioned(), metadata.isWithVersion(), "actual version metadata");
                        BaseMapper<?> mapper = (BaseMapper<?>) application.getBean(Introspector.decapitalize(probe.type().getSimpleName()) + "Mapper");
                        equal(null, mapper.selectById(foreignId), "cross-tenant record hidden");
                        long before = auditCount(jdbc, metadata.getTableName(), foreignId);
                        service.delete(probe.type(), foreignId);
                        equal(probe.logical() ? 0 : 1, jdbc.queryForObject(probe.check(), Integer.class, foreignId, OTHER_TENANT), "cross-tenant delete unchanged");
                        equal(before, auditCount(jdbc, metadata.getTableName(), foreignId), "cross-tenant attempt not audited as deletion");
                        service.delete(probe.type(), ownId);
                        equal(probe.logical() ? 1 : 0, jdbc.queryForObject(probe.check(), Integer.class, ownId, TENANT), "actual database deletion");
                        equal(null, mapper.selectById(ownId), "deleted record disappears from real mapper");
                        equal(1L, auditCount(jdbc, metadata.getTableName(), ownId), "one successful deletion audit");
                        service.delete(probe.type(), ownId);
                        equal(1L, auditCount(jdbc, metadata.getTableName(), ownId), "repeated deletion has no false additional audit");
                        System.out.println("HR_TYPED_DELETE_TABLE: table=" + metadata.getTableName() + "; logical=" + probe.logical() + "; versioned=" + probe.versioned() + "; deleted=true; tenant_isolation=true; audit_once=true");
                    }
                    equal(2, calendarInvalidations.get(), "employee and schedule deletion invalidate assignments once");
                    long auditEmployee = BASE + 85;
                    equal(0L, jdbc.queryForObject("SELECT COUNT(*) FROM hr_employee WHERE id=?", Long.class, auditEmployee), "audit fixture ID unused");
                    jdbc.update("INSERT INTO hr_employee(id,tenant_id,employee_no,name,gender,create_by,create_time,update_by) VALUES(?,?,'AUDIT_UPDATE_CHECK','审计保护员工','UNKNOWN','original-creator','2026-01-02 03:04:05','original-updater')", auditEmployee, TENANT);
                    HrEmployeePayload employeePayload = new HrEmployeePayload();
                    employeePayload.setEmployeeNo("AUDIT_UPDATE_CHECK"); employeePayload.setName("审计保护员工"); employeePayload.setGender("UNKNOWN");
                    employeePayload.setEmployeeType("FULL_TIME"); employeePayload.setEmployeeStatus("REGULAR"); employeePayload.setHireDate(java.time.LocalDate.of(2026, 1, 1));
                    employeePayload.setUserId(12345L);
                    service.update(HrEmployee.class, auditEmployee, employeePayload);
                    equal("original-creator", jdbc.queryForObject("SELECT create_by FROM hr_employee WHERE id=?", String.class, auditEmployee), "omitted DTO creator preserved");
                    equal("delete-check", jdbc.queryForObject("SELECT update_by FROM hr_employee WHERE id=?", String.class, auditEmployee), "omitted DTO updater uses current actor");
                    equal(12345L, jdbc.queryForObject("SELECT user_id FROM hr_employee WHERE id=?", Long.class, auditEmployee), "binding business change applied");
                    Map<String, Object> forgedAudit = new LinkedHashMap<>();
                    forgedAudit.put("createBy", "forged-creator"); forgedAudit.put("updateBy", "forged-updater");
                    forgedAudit.put("createTime", "2030-01-01T00:00:00"); forgedAudit.put("userId", null);
                    service.updateProperties(HrEmployee.class, auditEmployee, forgedAudit);
                    equal("original-creator", jdbc.queryForObject("SELECT create_by FROM hr_employee WHERE id=?", String.class, auditEmployee), "supplied creator cannot replace original");
                    equal("2026-01-02 03:04:05", jdbc.queryForObject("SELECT DATE_FORMAT(create_time,'%Y-%m-%d %H:%i:%s') FROM hr_employee WHERE id=?", String.class, auditEmployee), "supplied creation time cannot replace original");
                    equal("delete-check", jdbc.queryForObject("SELECT update_by FROM hr_employee WHERE id=?", String.class, auditEmployee), "supplied updater cannot replace current actor");
                    equal(null, jdbc.queryForObject("SELECT user_id FROM hr_employee WHERE id=?", Long.class, auditEmployee), "explicit business null still unbinds account");
                    equal(2L, jdbc.queryForObject("SELECT COUNT(*) FROM hr_audit_log WHERE tenant_id=? AND business_domain='hr_employee' AND business_id=? AND operation_type='UPDATE' AND JSON_UNQUOTE(JSON_EXTRACT(before_data,'$.createBy'))='original-creator' AND JSON_UNQUOTE(JSON_EXTRACT(after_data,'$.createBy'))='original-creator'", Long.class, TENANT, auditEmployee), "both update audits preserve creator evidence");
                    System.out.println("HR_TYPED_UPDATE_AUDIT: creator_preserved=true; creation_time_preserved=true; updater_is_actor=true; null_business_field_supported=true; actual_mapper=true; updates=2");
                    Probe interview = PROBES.get(0); long staleId = BASE + 200;
                    jdbc.update(interview.insert(), staleId, TENANT); staleWrite.set(true);
                    try { service.delete(HrPerformanceInterview.class, staleId); throw new AssertionError("Stale delete falsely reported success"); }
                    catch (HrHException expected) { equal("DELETE_CONFLICT", expected.getCode(), "stale delete conflict code"); equal(409, expected.getStatus(), "stale delete HTTP status"); }
                    equal(0, jdbc.queryForObject(interview.check(), Integer.class, staleId, TENANT), "stale delete preserves live record");
                    equal(0L, auditCount(jdbc, "hr_performance_interview", staleId), "failed deletion not audited as success");
                    service.delete(HrPerformanceInterview.class, staleId);
                    equal("1:delete-check:2", jdbc.queryForObject("SELECT CONCAT(deleted,':',update_by,':',version) FROM hr_performance_interview WHERE id=? AND tenant_id=?", String.class, staleId, TENANT), "deletion preserves updater and advances latest version");
                    Probe salary = PROBES.get(7);
                    for (String protectedStatus : List.of("ARCHIVED", "RELEASED")) {
                        long salaryId = protectedStatus.equals("ARCHIVED") ? BASE + 300 : BASE + 301;
                        jdbc.update("INSERT INTO hr_salary_slip(id,tenant_id,employee_id,period_month,status) VALUES(?,?,?,'2026-09',?)", salaryId, TENANT, salaryId, protectedStatus);
                        try { service.delete(HrSalarySlip.class, salaryId); throw new AssertionError("Immutable salary slip deleted"); }
                        catch (HrBusinessException expected) { equal("SALARY_SLIP_IMMUTABLE", expected.getCode(), "immutable salary guard"); }
                        equal(0, jdbc.queryForObject(salary.check(), Integer.class, salaryId, TENANT), "protected salary record preserved");
                        equal(0L, auditCount(jdbc, "hr_salary_slip", salaryId), "protected salary not audited as deleted");
                    }
                    UserContext.setRoles(Set.of("EMPLOYEE"));
                    try { service.delete(HrTaxDeduction.class, BASE + 400); throw new AssertionError("Employee sensitive deletion allowed"); }
                    catch (HrBusinessException expected) { equal("FORBIDDEN_SENSITIVE_WRITE", expected.getCode(), "employee sensitive write denied"); }
                    identity();
                    System.out.println("HR_TYPED_DELETE_PROTECTION: stale_version_409=true; stale_version_input_simulated=true; actual_mapper=true; immutable_salary_preserved=true; employee_sensitive_write_denied=true; calendar_invalidations=2");
                } finally { status.setRollbackOnly(); }
            });
            equal(0L, jdbc.queryForObject("SELECT COUNT(*) FROM sys_tenant WHERE tenant_id IN (?,?)", Long.class, TENANT, OTHER_TENANT), "private fixture transaction rolled back");
            equal(0L, jdbc.queryForObject("SELECT COUNT(*) FROM hr_audit_log WHERE tenant_id IN (?,?)", Long.class, TENANT, OTHER_TENANT), "fixture audit rolled back");
            System.out.println("HR_TYPED_DELETE_CHECKS: assertions=" + assertions + "; failed=0; tables=" + PROBES.size() + "; real_mysql=true; real_service=true; real_mappers=true; tenant_plugin=true; optimistic_plugin=true; identity_double=true; calendar_double=true; http=false; fixtures_rolled_back=true; production_modified=false");
        } finally { TenantContext.clear(); UserContext.clear(); }
    }

    private static long auditCount(JdbcTemplate jdbc, String table, long id) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM hr_audit_log WHERE tenant_id=? AND business_domain=? AND business_id=? AND operation_type='DELETE'", Long.class, TENANT, table, id);
    }
    private static void identity() { TenantContext.clear(); TenantContext.setTenantId(TENANT); UserContext.setTenantId(TENANT); UserContext.setUserId(BASE); UserContext.setUserName("delete-check"); UserContext.setRoles(Set.of("admin")); }
    private static void equal(Object expected, Object actual, String label) { assertions++; if (!Objects.equals(expected, actual)) throw new AssertionError(label + ": expected=" + expected + "; actual=" + actual); }
}
