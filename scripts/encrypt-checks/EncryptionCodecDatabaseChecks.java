import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.MybatisSqlSessionFactoryBuilder;
import com.baomidou.mybatisplus.core.config.GlobalConfig;
import com.baomidou.mybatisplus.core.toolkit.GlobalConfigUtils;
import com.baomidou.mybatisplus.extension.plugins.MybatisPlusInterceptor;
import com.baomidou.mybatisplus.extension.plugins.inner.OptimisticLockerInnerInterceptor;
import com.cloudflow.common.encrypt.core.EncryptUtils.EncryptException;
import com.cloudflow.common.encrypt.interceptor.MybatisDecryptInterceptor;
import com.cloudflow.common.encrypt.interceptor.MybatisEncryptInterceptor;
import com.cloudflow.common.encrypt.properties.EncryptorProperties;
import com.cloudflow.hr.domain.entity.HrEmployeeComp;
import com.cloudflow.hr.domain.entity.HrTaxProfile;
import com.cloudflow.hr.mapper.HrEmployeeCompMapper;
import com.cloudflow.hr.mapper.HrTaxProfileMapper;
import org.apache.ibatis.executor.statement.StatementHandler;
import org.apache.ibatis.mapping.Environment;
import org.apache.ibatis.plugin.Interceptor;
import org.apache.ibatis.plugin.Intercepts;
import org.apache.ibatis.plugin.Invocation;
import org.apache.ibatis.plugin.Signature;
import org.apache.ibatis.session.LocalCacheScope;
import org.apache.ibatis.session.SqlSession;
import org.apache.ibatis.session.SqlSessionFactory;
import org.apache.ibatis.transaction.jdbc.JdbcTransactionFactory;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.math.BigDecimal;
import com.cloudflow.checks.FixtureInspectionSql;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

public final class EncryptionCodecDatabaseChecks {
    private EncryptionCodecDatabaseChecks() {}

    static void run(EncryptorProperties properties) throws Throwable {
        try (Isolation isolation = new Isolation()) {
            isolation.initialize();
            SqlSessionFactory factory = sessions(isolation, properties);
            EncryptionCodecChecks.group("MySQL formal JSON columns and real Mapper round trips", () -> roundTrips(isolation, factory));
            EncryptionCodecChecks.group("MySQL write and SQL failure transaction rollback", () -> rollbackChecks(isolation, factory));
            EncryptionCodecChecks.group("MySQL legacy masking and explicit fixture replacement", () -> legacyReplacement(isolation, factory));
        }
    }

    private static SqlSessionFactory sessions(Isolation isolation, EncryptorProperties properties) {
        DriverManagerDataSource dataSource = new DriverManagerDataSource(isolation.url, isolation.username, isolation.password);
        MybatisConfiguration configuration = new MybatisConfiguration();
        configuration.setEnvironment(new Environment("isolated-codec", new JdbcTransactionFactory(), dataSource));
        configuration.setMapUnderscoreToCamelCase(true);
        configuration.setCacheEnabled(false);
        configuration.setLocalCacheScope(LocalCacheScope.STATEMENT);
        configuration.setDefaultStatementTimeout(15);
        configuration.setLogImpl(org.apache.ibatis.logging.nologging.NoLoggingImpl.class);
        GlobalConfig global = new GlobalConfig();
        global.setBanner(false);
        global.setDbConfig(new GlobalConfig.DbConfig());
        GlobalConfigUtils.setGlobalConfig(configuration, global);
        MybatisPlusInterceptor optimistic = new MybatisPlusInterceptor();
        optimistic.addInnerInterceptor(new OptimisticLockerInnerInterceptor());
        configuration.addInterceptor(optimistic);
        configuration.addInterceptor(new MybatisEncryptInterceptor(properties));
        configuration.addInterceptor(new MybatisDecryptInterceptor(properties));
        configuration.addInterceptor(new IsolatedStatementGuard(isolation.database, isolation.source));
        configuration.addMapper(HrEmployeeCompMapper.class);
        configuration.addMapper(HrTaxProfileMapper.class);
        return new MybatisSqlSessionFactoryBuilder().build(configuration);
    }

    private static void roundTrips(Isolation isolation, SqlSessionFactory factory) throws Throwable {
        HrEmployeeComp assignment = EncryptionCodecChecks.assignment(1);
        HrTaxProfile profile = EncryptionCodecChecks.profile(1);
        List<EncryptionCodecChecks.Original> originals = EncryptionCodecChecks.snapshot(assignment, profile);
        try (SqlSession session = factory.openSession(false)) {
            EncryptionCodecChecks.check(!session.getConnection().getAutoCommit(), "real JDBC transaction has autoCommit disabled");
            EncryptionCodecChecks.equal(1, session.getMapper(HrEmployeeCompMapper.class).insert(assignment), "real assignment insert");
            EncryptionCodecChecks.equal(1, session.getMapper(HrTaxProfileMapper.class).insert(profile), "real profile insert");
            EncryptionCodecChecks.restored(originals, "real inserts restore entity plaintext");
            session.commit();
        }
        Map<String, String> raw = raw(isolation, 1);
        EncryptionCodecChecks.equal("STRING", raw.get("assignmentType"), "formal assignment JSON stores a JSON string");
        EncryptionCodecChecks.equal("STRING", raw.get("profileType"), "formal profile JSON stores a JSON string");
        EncryptionCodecChecks.jsonCipher(raw.get("componentValues"), assignment.getComponentValuesText(), "real assignment JSON");
        EncryptionCodecChecks.jsonCipher(raw.get("taxConfig"), profile.getTaxConfigText(), "real profile JSON");
        EncryptionCodecChecks.check(!"12800.00".equals(raw.get("totalSalary")), "salary stored encrypted");
        EncryptionCodecChecks.check(!"5000.00".equals(raw.get("threshold")), "threshold stored encrypted");
        try (SqlSession session = factory.openSession(false)) {
            HrEmployeeComp loadedAssignment = session.getMapper(HrEmployeeCompMapper.class).selectById(1L);
            HrTaxProfile loadedProfile = session.getMapper(HrTaxProfileMapper.class).selectById(1L);
            EncryptionCodecChecks.equal(assignment.getComponentValues(), loadedAssignment.getComponentValues(), "real assignment business map decoded");
            EncryptionCodecChecks.equal(profile.getTaxConfig(), loadedProfile.getTaxConfig(), "real profile business map decoded");
            EncryptionCodecChecks.equal(assignment.getTotalSalary(), loadedAssignment.getTotalSalary(), "real salary decimal decoded");
            EncryptionCodecChecks.equal(profile.getThreshold(), loadedProfile.getThreshold(), "real threshold decimal decoded");
            List<EncryptionCodecChecks.Original> loadedOriginals = EncryptionCodecChecks.snapshot(loadedAssignment, loadedProfile);
            for (int repeat = 0; repeat < 2; repeat++) {
                EncryptionCodecChecks.equal(1, session.getMapper(HrEmployeeCompMapper.class).updateById(loadedAssignment), "real repeated assignment update");
                EncryptionCodecChecks.equal(1, session.getMapper(HrTaxProfileMapper.class).updateById(loadedProfile), "real repeated profile update");
                EncryptionCodecChecks.restored(loadedOriginals, "real repeated updates restore originals");
            }
            EncryptionCodecChecks.equal(2, loadedAssignment.getVersion(), "encrypted field restoration preserves optimistic version changes");
            session.commit();
        }
        EncryptionCodecChecks.equal(raw, raw(isolation, 1), "repeat updates retain single-layer ciphertext exactly");
    }

    private static void rollbackChecks(Isolation isolation, SqlSessionFactory factory) throws Throwable {
        Map<String, String> baseline = raw(isolation, 1);
        for (String invalid : List.of("***", "{broken", "{} []", "")) {
            try (SqlSession session = factory.openSession(false)) {
                HrEmployeeComp assignment = session.getMapper(HrEmployeeCompMapper.class).selectById(1L);
                HrTaxProfile profile = session.getMapper(HrTaxProfileMapper.class).selectById(1L);
                assignment.setTotalSalary(new BigDecimal("19999.00"));
                assignment.setComponentValues(Map.of("replacement", 19999));
                profile.setThreshold(new BigDecimal("9000.00"));
                profile.setTaxConfigText(invalid);
                List<EncryptionCodecChecks.Original> originals = EncryptionCodecChecks.snapshot(assignment, profile);
                EncryptionCodecChecks.equal(1, session.getMapper(HrEmployeeCompMapper.class).updateById(assignment), "prior transaction write really executes");
                EncryptionCodecChecks.rejects(EncryptException.class,
                        () -> session.getMapper(HrTaxProfileMapper.class).updateById(profile), "bad profile blocks transaction");
                EncryptionCodecChecks.restored(originals, "rejected transaction parameters restored");
                session.rollback(true);
            }
            EncryptionCodecChecks.equal(baseline, raw(isolation, 1), "failed JSON or placeholder does not pollute either table");
        }
        try (SqlSession session = factory.openSession(false)) {
            HrEmployeeComp assignment = session.getMapper(HrEmployeeCompMapper.class).selectById(1L);
            assignment.setTotalSalary(new BigDecimal("20000.00"));
            HrTaxProfile duplicate = EncryptionCodecChecks.profile(1);
            List<EncryptionCodecChecks.Original> originals = EncryptionCodecChecks.snapshot(assignment, duplicate);
            EncryptionCodecChecks.equal(1, session.getMapper(HrEmployeeCompMapper.class).updateById(assignment), "prior write before real SQL failure");
            EncryptionCodecChecks.rejects(SQLException.class,
                    () -> session.getMapper(HrTaxProfileMapper.class).insert(duplicate), "real MySQL duplicate key failure");
            EncryptionCodecChecks.restored(originals, "real SQL failure restores values");
            session.rollback(true);
        }
        EncryptionCodecChecks.equal(baseline, raw(isolation, 1), "real SQL failure rolls back previous encrypted update");
        HrEmployeeComp invalid = EncryptionCodecChecks.assignment(3);
        invalid.setTotalSalaryText("***");
        List<EncryptionCodecChecks.Original> originals = EncryptionCodecChecks.snapshot(invalid);
        try (SqlSession session = factory.openSession(false)) {
            EncryptionCodecChecks.rejects(EncryptException.class,
                    () -> session.getMapper(HrEmployeeCompMapper.class).insert(invalid), "legacy amount placeholder refuses insert");
            EncryptionCodecChecks.restored(originals, "failed insert restores prior JSON transformation");
            session.rollback(true);
        }
        try (Connection connection = isolation.connect(); PreparedStatement statement = connection.prepareStatement("SELECT COUNT(*) FROM hr_employee_comp WHERE id=3")) {
            try (ResultSet rows = statement.executeQuery()) {
                rows.next();
                EncryptionCodecChecks.equal(0L, rows.getLong(1), "rejected insert leaves no row");
            }
        }
    }

    private static void legacyReplacement(Isolation isolation, SqlSessionFactory factory) throws Throwable {
        try (Connection connection = isolation.connect()) {
            connection.setAutoCommit(false);
            try (PreparedStatement assignment = connection.prepareStatement("INSERT INTO hr_employee_comp (id,tenant_id,employee_id,component_values,total_salary,effective_date) VALUES (2,990001,2,?,?,'2026-09-14')");
                    PreparedStatement profile = connection.prepareStatement("INSERT INTO hr_tax_profile (id,tenant_id,employee_id,tax_config,threshold) VALUES (2,990001,2,?,?)")) {
                assignment.setString(1, "{\"legacy\":1}");
                assignment.setString(2, "1000.00");
                profile.setString(1, "{\"legacy\":true}");
                profile.setString(2, "5000.00");
                EncryptionCodecChecks.equal(1, assignment.executeUpdate(), "synthetic legacy assignment exists only in isolated database");
                EncryptionCodecChecks.equal(1, profile.executeUpdate(), "synthetic legacy profile exists only in isolated database");
                connection.commit();
            }
        }
        Map<String, String> legacy = raw(isolation, 2);
        try (SqlSession session = factory.openSession(false)) {
            HrEmployeeComp assignment = session.getMapper(HrEmployeeCompMapper.class).selectById(2L);
            HrTaxProfile profile = session.getMapper(HrTaxProfileMapper.class).selectById(2L);
            EncryptionCodecChecks.equal("***", assignment.getComponentValuesText(), "real legacy JSON masked");
            EncryptionCodecChecks.equal("***", assignment.getTotalSalaryText(), "real legacy amount masked");
            EncryptionCodecChecks.equal("***", profile.getTaxConfigText(), "real legacy profile JSON masked");
            EncryptionCodecChecks.equal("***", profile.getThresholdText(), "real legacy profile threshold masked");
            EncryptionCodecChecks.check(assignment.getComponentValues() == null && assignment.getTotalSalary() == null,
                    "legacy data is not silently exposed through typed getters");
            EncryptionCodecChecks.rejects(EncryptException.class,
                    () -> session.getMapper(HrEmployeeCompMapper.class).updateById(assignment), "generic legacy read then write rejected");
            session.rollback(true);
        }
        EncryptionCodecChecks.equal(legacy, raw(isolation, 2), "rejected read-modify-write preserves isolated legacy bytes");
        try (SqlSession session = factory.openSession(false)) {
            HrEmployeeComp assignment = session.getMapper(HrEmployeeCompMapper.class).selectById(2L);
            HrTaxProfile profile = session.getMapper(HrTaxProfileMapper.class).selectById(2L);
            assignment.setComponentValues(Map.of("knownFixture", 16000));
            assignment.setTotalSalary(new BigDecimal("16000.00"));
            profile.setTaxConfig(Map.of("knownFixture", true));
            profile.setThreshold(new BigDecimal("5000.00"));
            List<EncryptionCodecChecks.Original> originals = EncryptionCodecChecks.snapshot(assignment, profile);
            EncryptionCodecChecks.equal(1, session.getMapper(HrEmployeeCompMapper.class).updateById(assignment), "explicit assignment full replacement succeeds");
            EncryptionCodecChecks.equal(1, session.getMapper(HrTaxProfileMapper.class).updateById(profile), "explicit profile full replacement succeeds");
            EncryptionCodecChecks.restored(originals, "explicit known fixture replacement restores business objects");
            session.commit();
        }
        Map<String, String> encrypted = raw(isolation, 2);
        EncryptionCodecChecks.equal("STRING", encrypted.get("assignmentType"), "rewritten legacy assignment uses JSON ciphertext");
        EncryptionCodecChecks.equal("STRING", encrypted.get("profileType"), "rewritten legacy profile uses JSON ciphertext");
        try (SqlSession session = factory.openSession(false)) {
            HrEmployeeComp assignment = session.getMapper(HrEmployeeCompMapper.class).selectById(2L);
            HrTaxProfile profile = session.getMapper(HrTaxProfileMapper.class).selectById(2L);
            EncryptionCodecChecks.equal(new BigDecimal("16000.00"), assignment.getTotalSalary(), "known fixture amount reads after full replacement");
            EncryptionCodecChecks.equal(Map.of("knownFixture", 16000), assignment.getComponentValues(), "known fixture assignment JSON reads");
            EncryptionCodecChecks.equal(Map.of("knownFixture", true), profile.getTaxConfig(), "known fixture profile JSON reads");
            EncryptionCodecChecks.equal(new BigDecimal("5000.00"), profile.getThreshold(), "known fixture threshold reads");
        }
    }

    private static Map<String, String> raw(Isolation isolation, long id) throws SQLException {
        Map<String, String> values = new LinkedHashMap<>();
        try (Connection connection = isolation.connect();
                PreparedStatement assignment = connection.prepareStatement("SELECT component_values,total_salary,JSON_TYPE(component_values) FROM hr_employee_comp WHERE id=?");
                PreparedStatement profile = connection.prepareStatement("SELECT tax_config,threshold,JSON_TYPE(tax_config) FROM hr_tax_profile WHERE id=?")) {
            assignment.setLong(1, id);
            profile.setLong(1, id);
            try (ResultSet rows = assignment.executeQuery()) {
                EncryptionCodecChecks.check(rows.next(), "isolated assignment exists");
                values.put("componentValues", rows.getString(1));
                values.put("totalSalary", rows.getString(2));
                values.put("assignmentType", rows.getString(3));
            }
            try (ResultSet rows = profile.executeQuery()) {
                EncryptionCodecChecks.check(rows.next(), "isolated profile exists");
                values.put("taxConfig", rows.getString(1));
                values.put("threshold", rows.getString(2));
                values.put("profileType", rows.getString(3));
            }
        }
        return values;
    }

    @Intercepts(@Signature(type = StatementHandler.class, method = "prepare", args = {Connection.class, Integer.class}))
    public static final class IsolatedStatementGuard implements Interceptor {
        private final String database;
        private final String source;
        IsolatedStatementGuard(String database, String source) { this.database = database; this.source = source; }
        @Override public Object intercept(Invocation invocation) throws Throwable {
            Connection connection = (Connection) invocation.getArgs()[0];
            if (!database.equals(connection.getCatalog())) throw new SecurityException("Mapper escaped isolated database");
            String sql = ((StatementHandler) invocation.getTarget()).getBoundSql().getSql().toLowerCase(Locale.ROOT);
            if (sql.contains(source.toLowerCase(Locale.ROOT)) || sql.contains(";")
                    || !(sql.stripLeading().startsWith("select ") || sql.stripLeading().startsWith("insert ") || sql.stripLeading().startsWith("update "))) {
                throw new SecurityException("Unexpected isolated Mapper statement");
            }
            return invocation.proceed();
        }
    }

    private static final class Isolation implements AutoCloseable {
        final String source = environment("ENCRYPT_CHECK_DB_SOURCE");
        final String database = environment("ENCRYPT_CHECK_DB_TARGET");
        final String owner = environment("ENCRYPT_CHECK_DB_OWNER");
        final String username = environment("ENCRYPT_CHECK_DB_USERNAME");
        final String password = environment("ENCRYPT_CHECK_DB_PASSWORD");
        final Connection management;
        final String url;
        boolean created;
        boolean owned;

        Isolation() throws SQLException {
            EncryptionCodecChecks.check("192.168.1.173".equals(environment("ENCRYPT_CHECK_DB_HOST"))
                    && "3306".equals(environment("ENCRYPT_CHECK_DB_PORT")) && "cloud_flow_db".equals(source), "fixed source database identity");
            EncryptionCodecChecks.check(database.matches("encrypt_codec_verify_[a-f0-9]{32}")
                    && owner.matches("[a-f0-9]{32}") && !database.equals(source), "random isolated database identity");
            String base = "jdbc:mysql://192.168.1.173:3306/";
            String options = "?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai&characterEncoding=UTF-8"
                    + "&connectTimeout=10000&socketTimeout=30000&allowMultiQueries=false&sessionVariables=innodb_lock_wait_timeout=10";
            management = DriverManager.getConnection(base + options, username, password);
            url = base + database + options;
        }

        void initialize() throws SQLException {
            try (Statement statement = management.createStatement()) {
                statement.execute("CREATE DATABASE `" + database + "` CHARACTER SET utf8mb4");
                created = true;
            }
            management.setCatalog(database);
            try (Statement statement = management.createStatement()) {
                statement.execute("CREATE TABLE `" + database + "`.codec_fixture_owner (owner_token CHAR(32) NOT NULL PRIMARY KEY) ENGINE=InnoDB");
                try (PreparedStatement insert = management.prepareStatement("INSERT INTO codec_fixture_owner (owner_token) VALUES (?)")) {
                    insert.setString(1, owner);
                    EncryptionCodecChecks.equal(1, insert.executeUpdate(), "isolated database ownership recorded");
                    owned = true;
                }
                for (String table : List.of("hr_employee_comp", "hr_tax_profile")) {
                    statement.execute("CREATE TABLE `" + database + "`." + table + " LIKE `" + source + "`." + table);
                }
            }
            try (PreparedStatement columns = management.prepareStatement("SELECT TABLE_NAME,COLUMN_NAME,DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND ((TABLE_NAME='hr_employee_comp' AND COLUMN_NAME='component_values') OR (TABLE_NAME='hr_tax_profile' AND COLUMN_NAME='tax_config'))")) {
                columns.setString(1, database);
                int count = 0;
                try (ResultSet rows = columns.executeQuery()) {
                    while (rows.next()) {
                        EncryptionCodecChecks.equal("json", rows.getString(3), "copied formal column really uses native MySQL JSON");
                        count++;
                    }
                }
                EncryptionCodecChecks.equal(2, count, "both formal JSON columns copied");
            }
            try (Connection connection = connect(); Statement statement = connection.createStatement()) {
                for (String table : List.of("hr_employee_comp", "hr_tax_profile")) {
                    try (ResultSet rows = statement.executeQuery(FixtureInspectionSql.query("count", table))) {
                        rows.next();
                        EncryptionCodecChecks.equal(0L, rows.getLong(1), "CREATE TABLE LIKE copied no runtime rows");
                    }
                }
            }
        }

        Connection connect() throws SQLException {
            Connection connection = DriverManager.getConnection(url, username, password);
            if (!database.equals(connection.getCatalog())) {
                connection.close();
                throw new SecurityException("Unexpected test connection database");
            }
            return connection;
        }

        @Override public void close() throws SQLException {
            try {
                if (created) {
                    if (!database.matches("encrypt_codec_verify_[a-f0-9]{32}") || database.equals(source)) {
                        throw new SecurityException("Unsafe database cleanup target");
                    }
                    if (owned) {
                        EncryptionCodecChecks.check(database.equals(management.getCatalog()), "fixture management catalog remains isolated");
                        try (Statement statement = management.createStatement();
                                ResultSet rows = statement.executeQuery("SELECT owner_token FROM codec_fixture_owner")) {
                            EncryptionCodecChecks.check(rows.next() && owner.equals(rows.getString(1)) && !rows.next(), "exact ownership verified before cleanup");
                        }
                    }
                    try (Statement statement = management.createStatement()) { statement.execute("DROP DATABASE `" + database + "`"); }
                    try (PreparedStatement statement = management.prepareStatement("SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=?")) {
                        statement.setString(1, database);
                        try (ResultSet rows = statement.executeQuery()) {
                            rows.next();
                            EncryptionCodecChecks.equal(0L, rows.getLong(1), "owned isolated database fully removed");
                        }
                    }
                }
            } finally { management.close(); }
        }
    }

    private static String environment(String name) {
        String value = System.getenv(name);
        if (value == null || value.isBlank()) throw new IllegalStateException("Missing protected test setting: " + name);
        return value;
    }
}
