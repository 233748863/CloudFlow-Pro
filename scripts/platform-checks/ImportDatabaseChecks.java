package com.cloudflow.common.excel.importing;

import com.baomidou.mybatisplus.annotation.DbType;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.extension.plugins.MybatisPlusInterceptor;
import com.baomidou.mybatisplus.extension.plugins.inner.PaginationInnerInterceptor;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.cloudflow.auth.importing.HolidayImport;
import com.cloudflow.auth.mapper.HolidayImportMapper;
import com.cloudflow.common.excel.importing.mapper.ImportTaskMapper;
import com.cloudflow.common.excel.importing.model.ImportTask;
import com.cloudflow.crm.mapper.CrmImportMapper;
import com.cloudflow.hr.mapper.HrImportMapper;
import com.cloudflow.oa.mapper.OaImportMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;

public class ImportDatabaseChecks {
    private static final long TENANT = 100000;
    private static final long OTHER_TENANT = 100001;
    private static final long CALENDAR = 990000001;
    private static final List<String> LABELS = new ArrayList<>();

    public static void main(String[] arguments) throws Exception {
        if (arguments.length != 2 || !arguments[0].startsWith("jdbc:mysql://127.0.0.1:")) throw new IllegalArgumentException("isolated loopback database required");
        DriverManagerDataSource dataSource = new DriverManagerDataSource(arguments[0], "root", "");
        MybatisConfiguration configuration = new MybatisConfiguration();
        configuration.setMapUnderscoreToCamelCase(true);
        configuration.addMapper(ImportTaskMapper.class);
        configuration.addMapper(HolidayImportMapper.class);
        configuration.addMapper(HrImportMapper.class);
        configuration.addMapper(OaImportMapper.class);
        configuration.addMapper(CrmImportMapper.class);
        MybatisPlusInterceptor interceptor = new MybatisPlusInterceptor();
        interceptor.addInnerInterceptor(new PaginationInnerInterceptor(DbType.MYSQL));
        MybatisSqlSessionFactoryBean factory = new MybatisSqlSessionFactoryBean();
        factory.setDataSource(dataSource);
        factory.setConfiguration(configuration);
        factory.setPlugins(interceptor);
        factory.setMapperLocations(new ClassPathResource("mapper/ImportTaskMapper.xml"), new ClassPathResource("mapper/HolidayImportMapper.xml"),
                new ClassPathResource("mapper/HrImportMapper.xml"), new ClassPathResource("mapper/OaImportMapper.xml"), new ClassPathResource("mapper/CrmImportMapper.xml"));
        SqlSessionTemplate session = new SqlSessionTemplate(factory.getObject());
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        TransactionTemplate transaction = new TransactionTemplate(new DataSourceTransactionManager(dataSource));
        ImportTaskMapper tasks = session.getMapper(ImportTaskMapper.class);
        ownership(tasks);
        progress(tasks, jdbc, transaction, session.getMapper(HolidayImportMapper.class));
        concurrentClaim(tasks);
        atomicClaim(tasks, transaction);
        references(jdbc, session.getMapper(HrImportMapper.class), session.getMapper(CrmImportMapper.class));
        duplicates(jdbc, session.getMapper(HrImportMapper.class), session.getMapper(OaImportMapper.class), session.getMapper(CrmImportMapper.class));
        cleanup(tasks, jdbc);
        Path output = Path.of(arguments[1]);
        Files.createDirectories(output);
        new ObjectMapper().writeValue(output.resolve("database-results.json").toFile(), Map.of("checks", LABELS.size(), "passed", LABELS));
        System.out.println("Batch G import database checks passed: " + LABELS.size());
    }

    private static void ownership(ImportTaskMapper tasks) {
        ImportTask own = task(tasks, TENANT, 1, "HOLIDAY");
        task(tasks, TENANT, 2, "HOLIDAY");
        task(tasks, OTHER_TENANT, 1, "HOLIDAY");
        task(tasks, TENANT, 1, "EMPLOYEE");
        check(tasks.owned(TENANT, 2, own.getTaskId()) == null && tasks.owned(OTHER_TENANT, 1, own.getTaskId()) == null, "task reads isolate both tenant and operator without global interceptor");
        check(tasks.pageOwned(new Page<>(1, 20), TENANT, 1, null, null, List.of("HOLIDAY")).getTotal() == 1, "task list also filters available business types");
        check(tasks.beginValidation(TENANT, 2, own.getTaskId()) == 0 && tasks.beginValidation(OTHER_TENANT, 1, own.getTaskId()) == 0, "another operator or tenant cannot start validation");
        String original = "原始值".repeat(2000);
        tasks.addErrors(TENANT, own.getTaskId(), List.of(new ImportError(2, "名称", original, "REQUIRED", "请填写名称")));
        check(tasks.errorsInRange(TENANT, 1, own.getTaskId(), 2, 2).get(0).getCellValue().equals(original), "MEDIUMTEXT retains long original values without truncation");
        check(tasks.pageErrors(new Page<>(1, 20), TENANT, 2, own.getTaskId()).getTotal() == 0
                && tasks.errorsInRange(OTHER_TENANT, 1, own.getTaskId(), 1, 100).isEmpty(), "error detail isolates owner and tenant");
        check(tasks.clearErrors(TENANT, 2, own.getTaskId()) == 0 && tasks.clearErrors(OTHER_TENANT, 1, own.getTaskId()) == 0, "unauthorized error cleanup changes no rows");
        check(tasks.invalidRows(TENANT, 1, own.getTaskId()).equals(List.of(2)) && tasks.errorCounts(TENANT, 1, own.getTaskId()).size() == 1, "error summary and row index use persisted validation results");
        check(tasks.clearErrors(TENANT, 1, own.getTaskId()) == 1, "owner can clear its own error rows");
        tasks.setFile(TENANT, 1, own.getTaskId(), "PENDING", false);
        check(tasks.beginValidation(TENANT, 1, own.getTaskId()) == 0, "incomplete file upload cannot enter validation");
        check(tasks.setFile(TENANT, 2, own.getTaskId(), "FILE:1", false) == 0, "another operator cannot replace the task file reference");
    }

    private static void progress(ImportTaskMapper tasks, JdbcTemplate jdbc, TransactionTemplate transaction, HolidayImportMapper holidays) {
        ImportTask task = task(tasks, TENANT, 1, "HOLIDAY");
        long taskId = task.getTaskId();
        check(tasks.beginImport(TENANT, 1, taskId) == 0, "unvalidated task cannot import");
        check(tasks.beginValidation(TENANT, 1, taskId) == 1, "owner starts validation");
        check(tasks.addValidation(TENANT, 1, taskId, 0, 1, 1) == 1 && tasks.addValidation(TENANT, 1, taskId, 0, 1, 1) == 0, "validation checkpoints reject duplicate batches");
        check(tasks.transition(TENANT, 1, taskId, "VALIDATING", "VALIDATED", null) == 1 && tasks.beginImport(TENANT, 1, taskId) == 1, "validated rows can enter import");
        jdbc.update("INSERT INTO sys_holiday_calendar (calendar_id, tenant_id, calendar_code, calendar_name) VALUES (?, ?, ?, ?)", CALENDAR, TENANT, "G_DB_CALENDAR", "导入事务校验日历");
        LocalDate date = LocalDate.of(2095, 1, 1);
        try {
            transaction.execute(status -> {
                tasks.ownedForUpdate(TENANT, 1, taskId);
                jdbc.update("INSERT INTO sys_holiday_date (tenant_id, calendar_id, holiday_date, date_type, year_no) VALUES (?, ?, ?, 'HOLIDAY', 2095)", TENANT, CALENDAR, date);
                tasks.addProgress(TENANT, 1, taskId, 0, 1, 0);
                throw new IllegalStateException("EXPECTED_ROLLBACK");
            });
            throw new AssertionError("transaction did not roll back");
        } catch (IllegalStateException exception) {
            if (!"EXPECTED_ROLLBACK".equals(exception.getMessage())) throw exception;
        }
        check(jdbc.queryForObject("SELECT COUNT(*) FROM sys_holiday_date WHERE tenant_id = ? AND calendar_id = ? AND holiday_date = ?", Integer.class, TENANT, CALENDAR, date) == 0
                && tasks.owned(TENANT, 1, taskId).processedRows() == 0, "business row and progress both roll back on failure");
        transaction.execute(status -> {
            tasks.ownedForUpdate(TENANT, 1, taskId);
            jdbc.update("INSERT INTO sys_holiday_date (tenant_id, calendar_id, holiday_date, date_type, year_no) VALUES (?, ?, ?, 'HOLIDAY', 2095)", TENANT, CALENDAR, date);
            check(tasks.addProgress(TENANT, 1, taskId, 0, 1, 0) == 1, "business write commits with its checkpoint");
            return null;
        });
        HolidayImport.Row row = new HolidayImport.Row();
        row.setCalendarId(CALENDAR); row.setHolidayDate(date);
        check(holidays.existing(TENANT, List.of(row)).size() == 1 && holidays.existing(OTHER_TENANT, List.of(row)).isEmpty(), "holiday duplicate lookup uses actual date and tenant");
        tasks.transition(TENANT, 1, taskId, "IMPORTING", "FAILED", "中断");
        check(tasks.beginValidation(TENANT, 1, taskId) == 0 && tasks.beginImport(TENANT, 1, taskId) == 1, "interrupted task resumes without resetting committed rows");
        check(tasks.owned(TENANT, 1, taskId).processedRows() == 1 && tasks.addProgress(TENANT, 1, taskId, 0, 1, 0) == 0, "retry cannot count an already committed row twice");
        check(tasks.addProgress(TENANT, 1, taskId, 1, 0, 1) == 1 && tasks.owned(TENANT, 1, taskId).processedRows() == 2, "skipped invalid row advances the same checkpoint");
        check(tasks.transition(TENANT, 1, taskId, "IMPORTING", "PARTIAL", null) == 1 && tasks.beginImport(TENANT, 1, taskId) == 0, "completed partial import cannot be executed again");
    }

    private static void concurrentClaim(ImportTaskMapper tasks) throws Exception {
        ImportTask task = task(tasks, TENANT, 1, "HOLIDAY");
        ExecutorService executor = Executors.newFixedThreadPool(2);
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch release = new CountDownLatch(1);
        try {
            ArrayList<Future<Integer>> claims = new ArrayList<java.util.concurrent.Future<Integer>>();
            for (int index = 0; index < 2; index++) claims.add(executor.submit(() -> {
                ready.countDown();
                if (!release.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("claim timeout");
                return tasks.beginValidation(TENANT, 1, task.getTaskId());
            }));
            if (!ready.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("workers not ready");
            release.countDown();
            check(claims.get(0).get(15, TimeUnit.SECONDS) + claims.get(1).get(15, TimeUnit.SECONDS) == 1, "concurrent validation claims have exactly one winner");
            check(tasks.setJob(TENANT, 1, task.getTaskId(), 99) == 1 && tasks.owned(TENANT, 1, task.getTaskId()).getJobLogId().equals(99L), "running task persists its actual execution identity");
            check(tasks.setJob(TENANT, 1, task.getTaskId(), 100) == 0 && tasks.owned(TENANT, 1, task.getTaskId()).getJobLogId().equals(99L), "a running claim cannot replace an already bound execution identity");
            tasks.transition(TENANT, 1, task.getTaskId(), "VALIDATING", "FAILED", "中断");
            check(tasks.beginValidation(TENANT, 1, task.getTaskId()) == 1 && tasks.owned(TENANT, 1, task.getTaskId()).getJobLogId() == null, "new validation clears the previous execution identity");
        } finally { release.countDown(); executor.shutdownNow(); }
    }

    private static void atomicClaim(ImportTaskMapper tasks, TransactionTemplate transaction) throws Exception {
        ImportTask task = task(tasks, TENANT, 1, "HOLIDAY");
        ExecutorService reader = Executors.newSingleThreadExecutor();
        try {
            transaction.execute(status -> {
                if (tasks.beginValidation(TENANT, 1, task.getTaskId()) != 1) throw new AssertionError("claim failed");
                status.setRollbackOnly();
                return null;
            });
            ImportTask rolledBack = tasks.owned(TENANT, 1, task.getTaskId());
            check("UPLOADED".equals(rolledBack.getStatus()) && rolledBack.getJobLogId() == null, "interrupted claim rolls back before any untracked running state is committed");
            transaction.execute(status -> {
                if (tasks.beginValidation(TENANT, 1, task.getTaskId()) != 1) throw new AssertionError("claim failed");
                try {
                    ImportTask observed = reader.submit(() -> tasks.owned(TENANT, 1, task.getTaskId())).get(10, TimeUnit.SECONDS);
                    check("UPLOADED".equals(observed.getStatus()) && observed.getJobLogId() == null, "other connections cannot observe an uncommitted claim without execution identity");
                } catch (Exception exception) { throw new IllegalStateException(exception); }
                if (tasks.setJob(TENANT, 1, task.getTaskId(), 101) != 1) throw new AssertionError("execution binding failed");
                return null;
            });
            ImportTask observed = reader.submit(() -> tasks.owned(TENANT, 1, task.getTaskId())).get(10, TimeUnit.SECONDS);
            check("VALIDATING".equals(observed.getStatus()) && Long.valueOf(101).equals(observed.getJobLogId()), "running state and execution identity become visible atomically");
        } finally { reader.shutdownNow(); }
    }

    private static void references(JdbcTemplate jdbc, HrImportMapper hr, CrmImportMapper crm) {
        jdbc.update("INSERT INTO sys_dept (dept_id, tenant_id, dept_name, status) VALUES (990000101, ?, '导入部门', '0'), (990000102, ?, '他租户部门', '0'), (990000103, ?, '停用部门', '1')", TENANT, OTHER_TENANT, TENANT);
        ImportReference department = hr.departments(TENANT).stream().filter(reference -> "990000101".equals(reference.code())).findFirst().orElseThrow();
        check("导入部门".equals(department.name()) && ((Number) department.value()).longValue() == 990000101L, "MyBatis maps numeric reference record components");
        check(hr.departments(TENANT).stream().noneMatch(reference -> List.of("990000102", "990000103").contains(reference.code())), "department options exclude disabled and other tenant records");
        jdbc.update("INSERT INTO sys_post (tenant_id, post_code, post_name, post_sort) VALUES (?, 'G_POST', '导入岗位', 1)", TENANT);
        jdbc.update("INSERT INTO hr_position (tenant_id, position_code, position_name) VALUES (?, 'G_POSITION', '导入职位')", TENANT);
        check(hr.posts(TENANT).stream().anyMatch(reference -> "G_POST".equals(reference.code()) && reference.value() instanceof Number)
                && hr.positions(TENANT).stream().anyMatch(reference -> "G_POSITION".equals(reference.code())), "post and position lookups match real schema and enabled states");
        jdbc.update("INSERT INTO sys_dict_data (tenant_id, dict_label, dict_value, dict_type) VALUES (0, '平台选项', 'G_PLATFORM', 'g_import_check'), (?, '本租户选项', 'G_OWN', 'g_import_check'), (?, '其他选项', 'G_OTHER', 'g_import_check')", TENANT, OTHER_TENANT);
        List<ImportReference> dictionary = hr.dictionary(TENANT, "g_import_check");
        check(dictionary.size() == 2 && dictionary.stream().noneMatch(reference -> "G_OTHER".equals(reference.code()))
                && dictionary.stream().allMatch(reference -> reference.value() instanceof String), "dictionary references map strings and isolate platform plus current tenant");
        jdbc.update("INSERT INTO sys_user (user_id, tenant_id, user_name, nick_name) VALUES (990000201, ?, 'g_import_owner', '导入负责人')", TENANT);
        jdbc.update("INSERT INTO hr_employee (tenant_id, employee_no, name, gender, user_id, employee_status) VALUES (?, 'G_OWNER', '导入负责人', 'MALE', 990000201, 'REGULAR')", TENANT);
        check(crm.owners(TENANT).stream().anyMatch(reference -> "G_OWNER".equals(reference.code()) && ((Number) reference.value()).longValue() == 990000201L), "customer owner resolves real employee to system user ID");
        jdbc.update("UPDATE sys_user SET status = '1' WHERE user_id = 990000201");
        check(crm.owners(TENANT).stream().noneMatch(reference -> "G_OWNER".equals(reference.code())), "disabled account cannot be selected as customer owner");
        jdbc.update("INSERT INTO sys_dict_data (tenant_id, dict_label, dict_value, dict_type) VALUES (?, '他租户级别', 'G_OTHER_LEVEL', 'crm_customer_level')", OTHER_TENANT);
        check(crm.levels(TENANT).stream().noneMatch(reference -> "G_OTHER_LEVEL".equals(reference.code())), "customer level options isolate tenant");
    }

    private static void duplicates(JdbcTemplate jdbc, HrImportMapper hr, OaImportMapper oa, CrmImportMapper crm) {
        jdbc.update("INSERT INTO hr_employee (tenant_id, employee_no, name, gender, deleted) VALUES (?, 'G_DELETED_EMPLOYEE', '已删除员工', 'MALE', 1), (?, 'G_OTHER_EMPLOYEE', '其他员工', 'MALE', 0)", TENANT, OTHER_TENANT);
        check(hr.existingEmployees(TENANT, List.of("G_DELETED_EMPLOYEE", "G_OTHER_EMPLOYEE")).equals(List.of("G_DELETED_EMPLOYEE")), "employee duplicate lookup includes deleted unique keys and excludes other tenants");
        jdbc.update("INSERT INTO oa_asset (tenant_id, asset_code, name, deleted) VALUES (?, 'G_DELETED_ASSET', '已删除资产', 1), (?, 'G_OTHER_ASSET', '其他资产', 0)", TENANT, OTHER_TENANT);
        check(oa.existingAssets(TENANT, List.of("G_DELETED_ASSET", "G_OTHER_ASSET")).equals(List.of("G_DELETED_ASSET")), "asset duplicate lookup preserves deleted key ownership");
        jdbc.update("INSERT INTO oa_supplier (tenant_id, supplier_code, supplier_name, credit_code, deleted) VALUES (?, 'G_SUPPLIER', '已删除供应商', '91310000GDB000001X', 1), (?, 'G_OTHER_SUPPLIER', '其他供应商', '91310000GDB000002X', 0)", TENANT, OTHER_TENANT);
        check(oa.existingSuppliers(TENANT, List.of("G_NEW", "G_OTHER_SUPPLIER"), List.of("91310000GDB000001X", "91310000GDB000002X")).size() == 1, "supplier independent credit-code uniqueness includes deleted records within tenant");
        check(oa.existingSuppliers(TENANT, List.of("G_SUPPLIER"), List.of()).size() == 1, "supplier code uniqueness works without credit-code values");
        jdbc.update("INSERT INTO crm_customer (tenant_id, customer_code, customer_name, deleted) VALUES (?, 'G_DELETED_CUSTOMER', '已删除客户', 1), (?, 'G_OTHER_CUSTOMER', '其他客户', 0)", TENANT, OTHER_TENANT);
        check(crm.existingCustomers(TENANT, List.of("G_DELETED_CUSTOMER", "G_OTHER_CUSTOMER")).equals(List.of("G_DELETED_CUSTOMER")), "customer duplicate lookup preserves deleted keys and tenant isolation");
    }

    private static void cleanup(ImportTaskMapper tasks, JdbcTemplate jdbc) {
        ImportTask expired = task(tasks, TENANT, 1, "HOLIDAY");
        ImportTask running = task(tasks, TENANT, 1, "HOLIDAY");
        tasks.beginValidation(TENANT, 1, running.getTaskId());
        jdbc.update("UPDATE sys_import_task SET create_time = '2020-01-01 00:00:00' WHERE task_id IN (?, ?)", expired.getTaskId(), running.getTaskId());
        List<ImportTask> candidates = tasks.expired(TENANT, LocalDateTime.now().minusDays(30));
        check(candidates.size() == 1 && candidates.get(0).getTaskId().equals(expired.getTaskId()), "retention query excludes running tasks");
        check(tasks.discardTask(TENANT, 2, expired.getTaskId()) == 0 && tasks.discardTask(OTHER_TENANT, 1, expired.getTaskId()) == 0, "cleanup cannot discard another owner or tenant task");
        check(tasks.discardTask(TENANT, 1, running.getTaskId()) == 0 && tasks.discardTask(TENANT, 1, expired.getTaskId()) == 1, "cleanup deletes only eligible non-running tasks");
    }

    private static ImportTask task(ImportTaskMapper tasks, long tenantId, long operatorId, String bizType) {
        ImportTask task = new ImportTask();
        task.setTenantId(tenantId); task.setOperatorId(operatorId); task.setOperatorName("数据库校验");
        task.setTaskNo("GDB" + UUID.randomUUID().toString().replace("-", ""));
        task.setBizType(bizType); task.setBizName("导入校验"); task.setFileName("校验.xlsx");
        task.setFileUrl("FILE:1"); task.setFileSize(100L); task.setTotalRows(2);
        task.setValidRows(0); task.setInvalidRows(0); task.setSuccessRows(0); task.setFailRows(0); task.setStatus("UPLOADED");
        tasks.insert(task);
        return task;
    }

    private static void check(boolean condition, String label) {
        if (!condition) throw new AssertionError(label);
        LABELS.add(label);
    }
}
