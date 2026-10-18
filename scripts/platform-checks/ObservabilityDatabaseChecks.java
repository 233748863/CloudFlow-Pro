package com.cloudflow.auth.storage;

import com.baomidou.mybatisplus.annotation.DbType;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.extension.plugins.MybatisPlusInterceptor;
import com.baomidou.mybatisplus.extension.plugins.inner.PaginationInnerInterceptor;
import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.cloudflow.auth.domain.SysFile;
import com.cloudflow.auth.domain.vo.ObservabilityModels;
import com.cloudflow.auth.mapper.ObservabilityMapper;
import com.cloudflow.auth.mapper.SysFileConfigMapper;
import com.cloudflow.auth.mapper.SysFileMapper;
import com.cloudflow.auth.service.ObservabilityService;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.log.domain.SysApiErrorLog;
import com.cloudflow.common.log.mapper.SysApiErrorLogMapper;
import com.cloudflow.common.log.mapper.SysLogMapper;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import java.sql.Connection;
import java.sql.Statement;
import java.time.LocalDate;
import java.util.List;

public class ObservabilityDatabaseChecks {
    private static int checks;
    private static final String TRACE = "db0123456789abcdef0123456789abcdef";

    public static void main(String[] arguments) throws Exception {
        if (arguments.length != 1 || !arguments[0].startsWith("jdbc:mysql://127.0.0.1:")) throw new IllegalArgumentException("isolated loopback database required");
        DriverManagerDataSource dataSource = new DriverManagerDataSource(arguments[0], "root", "");
        MybatisConfiguration configuration = new MybatisConfiguration();
        configuration.setMapUnderscoreToCamelCase(true);
        configuration.addMapper(SysLogMapper.class);
        configuration.addMapper(SysApiErrorLogMapper.class);
        configuration.addMapper(ObservabilityMapper.class);
        configuration.addMapper(SysFileMapper.class);
        configuration.addMapper(SysFileConfigMapper.class);
        MybatisPlusInterceptor interceptor = new MybatisPlusInterceptor();
        interceptor.addInnerInterceptor(new PaginationInnerInterceptor(DbType.MYSQL));
        MybatisSqlSessionFactoryBean factory = new MybatisSqlSessionFactoryBean();
        factory.setDataSource(dataSource);
        factory.setConfiguration(configuration);
        factory.setPlugins(interceptor);
        factory.setMapperLocations(new ClassPathResource("mapper/ObservabilityMapper.xml"),
                new ClassPathResource("mapper/SysFileMapper.xml"), new ClassPathResource("mapper/SysFileConfigMapper.xml"));
        SqlSessionTemplate session = new SqlSessionTemplate(factory.getObject());
        ObservabilityService service = new ObservabilityService(session.getMapper(SysApiErrorLogMapper.class),
                session.getMapper(SysLogMapper.class), session.getMapper(ObservabilityMapper.class));
        UserContext.setTenantId(100000L);
        UserContext.setUserId(1L);
        UserContext.setUserName("batch-g-check");
        try (Connection connection = dataSource.getConnection()) {
            long ownedError = insertTrace(connection, 100000L, 2001);
            long otherError = insertTrace(connection, 100001L, 9999);
            ObservabilityModels.TraceBundle trace = service.trace(TRACE, 1, 100);
            check(trace.operations().getTotal() == 1 && trace.operations().getRows().get(0).getTenantId().equals(100000L), "request query isolates tenant without global plugin");
            check(trace.errors().getTotal() == 1 && trace.errors().getRows().get(0).getErrorId().equals(ownedError), "API errors isolate tenant");
            check(trace.frontend().getTotal() == 1, "frontend trace isolates tenant");
            PageResult<SysApiErrorLog> page = service.errors(1, 20, "cloudflow-auth", null, "TODO", TRACE, LocalDate.now(), LocalDate.now());
            check(page.getTotal() == 1, "error page filter excludes other tenant");
            check(page.getRows().get(0).getExceptionStack() == null, "list omits heavy exception stack");
            rejects(() -> service.detail(otherError), "cannot read another tenant error");
            rejects(() -> service.process(otherError, "TODO", "DONE", "attempt"), "cannot process another tenant error");
            service.process(ownedError, "TODO", "DONE", "phone=13800138000");
            check("DONE".equals(service.detail(ownedError).getProcessStatus()), "error processing persisted");
            check(!service.detail(ownedError).getProcessRemark().contains("13800138000"), "processing remark sanitized");
            rejects(() -> service.process(ownedError, "TODO", "IGNORED", "stale"), "concurrent stale processing rejected");
            ObservabilityModels.SlowEndpoint slow = service.slowTop(LocalDate.now(), LocalDate.now(), "duration").stream()
                    .filter(row -> "/checks/batch-g".equals(row.getRequestUrl())).findFirst().orElseThrow();
            check(slow.getRequestCount() == 1 && slow.getAverageDuration().intValue() == 2001, "slow ranking tenant boundaries");
            check(service.trend(LocalDate.now(), LocalDate.now()).get(0).getErrorCount() == 1, "daily error count excludes other tenant");
            try (Statement statement = connection.createStatement()) {
                statement.executeUpdate("INSERT INTO sys_file_config (tenant_id, config_code, config_name, storage_type, deleted) VALUES (100000, 'G_CHECK_RETIRED', 'retired', 'LOCAL', 1)");
            }
            check(session.getMapper(SysFileConfigMapper.class).countCode(100000L, "G_CHECK_RETIRED", null) == 1, "deleted storage code remains reserved");
            fileSqlChecks(session.getMapper(SysFileMapper.class));
            check(session.getMapper(SysFileConfigMapper.class).countCode(100001L, "G_CHECK_RETIRED", null) == 0, "storage code reservation stays per tenant");
        } finally { UserContext.clear(); }
        System.out.println("Batch G isolated database checks passed: " + checks);
    }

    private static long insertTrace(Connection connection, long tenantId, long duration) throws Exception {
        try (PreparedStatement statement = connection.prepareStatement("INSERT INTO sys_log (tenant_id, trace_id, service_name, request_method, request_url, duration_ms, slow_flag, create_time) VALUES (?, ?, 'cloudflow-auth', 'GET', '/checks/batch-g', ?, 1, NOW())")) {
            statement.setLong(1, tenantId); statement.setString(2, TRACE); statement.setLong(3, duration); statement.executeUpdate();
        }
        long errorId;
        try (PreparedStatement statement = connection.prepareStatement("INSERT INTO sys_api_error_log (tenant_id, trace_id, service_name, exception_class, exception_message, exception_stack, occur_time) VALUES (?, ?, 'cloudflow-auth', 'CheckFailure', 'test-only', 'test-stack', NOW())", Statement.RETURN_GENERATED_KEYS)) {
            statement.setLong(1, tenantId); statement.setString(2, TRACE); statement.executeUpdate();
            try (ResultSet keys = statement.getGeneratedKeys()) { keys.next(); errorId = keys.getLong(1); }
        }
        try (PreparedStatement statement = connection.prepareStatement("INSERT INTO oa_frontend_error_log (tenant_id, trace_id, message, level, create_time) VALUES (?, ?, 'test-only', 'error', NOW())")) {
            statement.setLong(1, tenantId); statement.setString(2, TRACE); statement.executeUpdate();
        }
        return errorId;
    }

    private static void fileSqlChecks(SysFileMapper mapper) {
        long before = physicalSize(mapper, 100000L);
        SysFile lower = file(100000L, "g-check/case.txt", 17L);
        SysFile upper = file(100000L, "g-check/CASE.txt", 31L);
        mapper.insert(lower); mapper.insert(upper);
        check(mapper.countReferences(lower) == 1 && mapper.countReferences(upper) == 1, "object keys compare case sensitively");
        SysFile duplicate = file(100000L, lower.getFilePath(), 17L);
        mapper.insert(duplicate);
        mapper.updateReferenceCount(lower, 2);
        check(mapper.selectById(lower.getFileId()).getRefCount() == 2 && mapper.selectById(duplicate.getFileId()).getRefCount() == 2, "shared object reference counts updated together");
        check(mapper.selectById(upper.getFileId()).getRefCount() == 1, "reference update does not touch case-distinct object");
        check(physicalSize(mapper, 100000L) - before == 48L, "quota counts physical objects rather than references");
        SysFile other = file(100001L, lower.getFilePath(), 17L);
        mapper.insert(other);
        check(mapper.countReferences(other) == 1 && mapper.countReferences(lower) == 2, "references never cross tenants");
    }

    private static SysFile file(Long tenantId, String path, Long size) {
        SysFile file = new SysFile();
        file.setTenantId(tenantId); file.setFileName("check.txt"); file.setFilePath(path);
        file.setFileSize(size); file.setStorageType("LOCAL"); file.setDeleted(0); file.setRefCount(1);
        file.setAccessType("PRIVATE"); file.setCreateBy("batch-g-check");
        return file;
    }

    private static long physicalSize(SysFileMapper mapper, Long tenantId) {
        return mapper.countPhysicalStorage(List.of(tenantId)).stream()
                .mapToLong(row -> ((Number) row.get("total_bytes")).longValue()).sum();
    }

    private static void rejects(Runnable action, String message) {
        try { action.run(); } catch (ServiceException expected) { checks++; return; }
        throw new AssertionError(message);
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
        checks++;
    }
}
