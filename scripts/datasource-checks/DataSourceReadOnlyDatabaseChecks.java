package com.cloudflow.common.datasource.runtime;

import com.cloudflow.common.datasource.domain.RuntimeDataSourceConfig;
import com.zaxxer.hikari.HikariDataSource;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;
import java.net.InetAddress;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.function.BooleanSupplier;
import org.springframework.beans.factory.support.StaticListableBeanFactory;

public final class DataSourceReadOnlyDatabaseChecks {
    private static final String DATABASE = "cf_ds_readonly_probe";
    private static final String PASSWORD = "DsProbe-" + UUID.randomUUID();
    private static final List<String> USERS = new ArrayList<>();
    private static final List<String> ROLES = new ArrayList<>();
    private static final MysqlDataSourceReadOnlyVerifier VERIFIER = new MysqlDataSourceReadOnlyVerifier();
    private static int checks;
    private static int accounts;
    private static int permissionQueries;
    private static String jdbcUrl;
    private static String serverUrl;
    private static Connection root;

    public static void main(String[] arguments) throws Exception {
        if (arguments.length != 3 || !arguments[0].matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/cloud_flow_db\\?.+")) {
            throw new IllegalArgumentException("Owned loopback database required");
        }
        Path workspace = Path.of(arguments[2]).toRealPath();
        Path expected = Path.of(arguments[1]).toRealPath();
        if (!expected.startsWith(workspace.resolve(".cloudflow-runtime/batch-g-integration"))) {
            throw new IllegalArgumentException("Owned integration data directory required");
        }
        serverUrl = arguments[0].substring(0, arguments[0].indexOf("/cloud_flow_db"));
        jdbcUrl = arguments[0].replace("/cloud_flow_db?", "/cf_ds_readonly_probe?");
        boolean probeCreated = false;
        boolean otherCreated = false;
        try (Connection administrator = DriverManager.getConnection(arguments[0], "root", "")) {
            root = administrator;
            require(expected.equals(Path.of(value(root, "SELECT @@datadir")).toRealPath()), "核验实际自有MySQL数据目录");
            require("0".equals(value(root, "SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name IN ('cf_ds_readonly_probe','cf_ds_readonly_other')")),
                    "两张专项数据库名无冲突");
            try {
                execute("CREATE DATABASE cf_ds_readonly_probe");
                probeCreated = true;
                execute("CREATE DATABASE cf_ds_readonly_other");
                otherCreated = true;
                execute("CREATE TABLE cf_ds_readonly_probe.probe (id INT PRIMARY KEY, marker VARCHAR(30) NOT NULL)");
                execute("INSERT INTO cf_ds_readonly_probe.probe (id,marker) VALUES (1,'unchanged')");
                execute("CREATE VIEW cf_ds_readonly_probe.probe_view AS SELECT marker FROM cf_ds_readonly_probe.probe");
                runAccounts();
                require("unchanged".equals(value(root, "SELECT marker FROM cf_ds_readonly_probe.probe WHERE id=1")),
                        "只读核验与写入拒绝测试未修改目标数据");
            } finally {
                for (String username : USERS) execute("DROP USER ?@'127.0.0.1'", username);
                for (String role : ROLES) execute("DROP ROLE ?@'127.0.0.1'", role);
                if (otherCreated) execute("DROP DATABASE cf_ds_readonly_other");
                if (probeCreated) execute("DROP DATABASE cf_ds_readonly_probe");
            }
            require("0".equals(value(root, "SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name IN ('cf_ds_readonly_probe','cf_ds_readonly_other')")),
                    "专项数据库清理完毕");
            for (String username : USERS) require("0".equals(value(root, "SELECT COUNT(*) FROM mysql.user WHERE User=? AND Host='127.0.0.1'", username)), "自有测试账号清理完毕");
            for (String role : ROLES) require("0".equals(value(root, "SELECT COUNT(*) FROM mysql.user WHERE User=? AND Host='127.0.0.1'", role)), "自有测试角色清理完毕");
        }
        System.out.println("DATASOURCE_READONLY_DATABASE: checks=" + checks + "; failed=0; account_cases=" + accounts + "; accounts_created=" + USERS.size()
                + "; permission_queries=" + permissionQueries + "; permission_write_queries=0; actual_verifier=true; actual_pool_factory=true; held_connection_retirement=true; mysql=true; http=false; fixtures_cleaned=true; production_modified=false");
    }

    private static void runAccounts() throws Exception {
        String direct = account("schema", "GRANT SELECT ON cf_ds_readonly_probe.* TO ?@'127.0.0.1'");
        verify(direct, null);
        String views = account("views", "GRANT SELECT, SHOW VIEW ON cf_ds_readonly_probe.* TO ?@'127.0.0.1'");
        verify(views, null);
        String table = account("table", "GRANT SELECT ON cf_ds_readonly_probe.probe TO ?@'127.0.0.1'");
        verify(table, null);
        String column = account("column", "GRANT SELECT (marker) ON cf_ds_readonly_probe.probe TO ?@'127.0.0.1'");
        verify(column, null);
        String global = account("global", "GRANT SELECT ON *.* TO ?@'127.0.0.1'");
        verify(global, null);
        String writer = account("writer", "GRANT SELECT, INSERT, UPDATE, DELETE ON cf_ds_readonly_probe.* TO ?@'127.0.0.1'");
        verify(writer, "ACCOUNT_NOT_READ_ONLY");
        for (String grant : List.of("GRANT INSERT ON cf_ds_readonly_other.* TO ?@'127.0.0.1'",
                "GRANT EXECUTE ON cf_ds_readonly_probe.* TO ?@'127.0.0.1'",
                "GRANT CREATE TEMPORARY TABLES ON cf_ds_readonly_probe.* TO ?@'127.0.0.1'",
                "GRANT LOCK TABLES ON cf_ds_readonly_probe.* TO ?@'127.0.0.1'",
                "GRANT CREATE USER ON *.* TO ?@'127.0.0.1'", "GRANT FILE ON *.* TO ?@'127.0.0.1'",
                "GRANT SYSTEM_VARIABLES_ADMIN ON *.* TO ?@'127.0.0.1'",
                "GRANT SELECT ON cf_ds_readonly_probe.* TO ?@'127.0.0.1' WITH GRANT OPTION")) {
            String dangerous = account("danger", "GRANT SELECT ON cf_ds_readonly_probe.* TO ?@'127.0.0.1'");
            execute(grant, dangerous);
            verify(dangerous, "ACCOUNT_NOT_READ_ONLY");
        }
        String proxy = account("proxy", "GRANT SELECT ON cf_ds_readonly_probe.* TO ?@'127.0.0.1'");
        execute("GRANT PROXY ON ?@'127.0.0.1' TO ?@'127.0.0.1'", direct, proxy);
        verify(proxy, "ACCOUNT_NOT_READ_ONLY");
        String inactiveRole = role();
        execute("GRANT INSERT ON cf_ds_readonly_probe.* TO ?@'127.0.0.1'", inactiveRole);
        String inheritor = account("inactive", "GRANT SELECT ON cf_ds_readonly_probe.* TO ?@'127.0.0.1'");
        execute("GRANT ?@'127.0.0.1' TO ?@'127.0.0.1'", inactiveRole, inheritor);
        verify(inheritor, "ACCOUNT_NOT_READ_ONLY");
        execute("SET DEFAULT ROLE ?@'127.0.0.1' TO ?@'127.0.0.1'", inactiveRole, inheritor);
        verify(inheritor, "ACCOUNT_NOT_READ_ONLY");
        String readerRole = role();
        execute("GRANT SELECT ON cf_ds_readonly_probe.* TO ?@'127.0.0.1'", readerRole);
        String readerInheritor = account("readerrole", "GRANT SELECT ON cf_ds_readonly_probe.* TO ?@'127.0.0.1'");
        execute("GRANT ?@'127.0.0.1' TO ?@'127.0.0.1'", readerRole, readerInheritor);
        expandedRole(readerInheritor, readerRole, false);
        verify(readerInheritor, null);
        String roleOnly = account("roleonly", "GRANT USAGE ON *.* TO ?@'127.0.0.1'");
        execute("GRANT ?@'127.0.0.1' TO ?@'127.0.0.1'", readerRole, roleOnly);
        execute("SET DEFAULT ROLE ?@'127.0.0.1' TO ?@'127.0.0.1'", readerRole, roleOnly);
        verify(roleOnly, null);
        String roleAdministrator = account("roleadmin", "GRANT SELECT ON cf_ds_readonly_probe.* TO ?@'127.0.0.1'");
        execute("GRANT ?@'127.0.0.1' TO ?@'127.0.0.1' WITH ADMIN OPTION", readerRole, roleAdministrator);
        verify(roleAdministrator, "ACCOUNT_NOT_READ_ONLY");
        execute("GRANT ?@'127.0.0.1' TO ?@'127.0.0.1'", inactiveRole, readerRole);
        expandedRole(readerInheritor, readerRole, true);
        verify(readerInheritor, "ACCOUNT_NOT_READ_ONLY");
        try (Connection connection = connect(direct)) {
            connection.setReadOnly(false);
            try (Statement statement = connection.createStatement()) {
                statement.executeUpdate("UPDATE probe SET marker='changed' WHERE id=1");
                throw new AssertionError("Dedicated account unexpectedly wrote data");
            } catch (SQLException failure) {
                require(failure.getErrorCode() == 1142, "关闭驱动只读标志后服务器仍拒绝实际写入");
            }
        }
        try (Connection connection = connect(direct)) {
            VERIFIER.verify(connection, DATABASE);
            execute("GRANT INSERT ON cf_ds_readonly_other.* TO ?@'127.0.0.1'", direct);
            rejected(connection, "ACCOUNT_NOT_READ_ONLY");
            execute("REVOKE INSERT ON cf_ds_readonly_other.* FROM ?@'127.0.0.1'", direct);
            VERIFIER.verify(connection, DATABASE);
            pass("后续核验读取当前授权而非缓存旧结果");
        }
        pools(direct, writer);
    }

    private static void expandedRole(String username, String role, boolean writable) throws Exception {
        try (Connection connection = connect(username);
                PreparedStatement statement = connection.prepareStatement("SHOW GRANTS FOR CURRENT_USER USING ?@?")) {
            statement.setString(1, role);
            statement.setString(2, "127.0.0.1");
            statement.setQueryTimeout(5);
            boolean hasSelect = false;
            boolean hasInsert = false;
            try (ResultSet result = statement.executeQuery()) {
                while (result.next()) {
                    String grant = result.getString(1);
                    hasSelect |= grant.contains("SELECT");
                    hasInsert |= grant.contains("INSERT");
                }
            }
            require(hasSelect && hasInsert == writable, "参数化权限展开能够读取未激活角色及嵌套写权限");
        }
    }

    private static void pools(String direct, String writer) throws Exception {
        DataSourceRuntimeProperties properties = new DataSourceRuntimeProperties();
        properties.setEnabled(true);
        properties.setManagementTenantId(100000L);
        properties.setSecretKey(UUID.randomUUID().toString());
        properties.setControlKey(UUID.randomUUID().toString());
        properties.setAllowedAuthAddresses(Set.of("127.0.0.1"));
        properties.setAllowedServices(Set.of("cloudflow-auth"));
        DataSourceRuntimeProperties.Target target = new DataSourceRuntimeProperties.Target();
        target.setHost("127.0.0.1");
        target.setPort(Integer.parseInt(serverUrl.substring(serverUrl.lastIndexOf(':') + 1)));
        target.setDatabase(DATABASE);
        target.setAddresses(Set.of("127.0.0.1"));
        target.setUsernames(Set.of(direct, writer));
        properties.setTargets(List.of(target));
        DataSourceSecretCipher cipher = new DataSourceSecretCipher(properties);
        StaticListableBeanFactory beans = new StaticListableBeanFactory();
        beans.addBean("mysqlReadOnlyVerifier", VERIFIER);
        DataSourcePoolFactory factory = new DataSourcePoolFactory(properties,
                new DataSourceNetworkPolicy(properties, host -> new InetAddress[] {InetAddress.getByName("127.0.0.1")}),
                cipher, beans.getBeanProvider(DataSourceReadOnlyVerifier.class));
        RuntimeDataSourceConfig config = new RuntimeDataSourceConfig();
        config.setConfigId(982092801L);
        config.setVersion(1);
        config.setDriverClass("com.mysql.cj.jdbc.Driver");
        config.setInitSize(0);
        config.setMaxActive(5);
        config.setUrl(serverUrl + "/" + DATABASE);
        config.setUsername(direct);
        config.setPasswordEncrypted(cipher.encrypt(PASSWORD));
        require(factory.accountVerificationReady(), "真实只读核验器接入连接池工厂");
        try (HikariDataSource pool = factory.createVerified(config); Connection connection = pool.getConnection()) {
            require(pool.getMinimumIdle() == 0 && pool.getMaximumPoolSize() == 5 && pool.getConnectionTimeout() == 5000,
                    "真实池保持初始零连接与最大五连接和五秒超时");
            require(connection.isReadOnly() && "unchanged".equals(value(connection, "SELECT marker FROM probe WHERE id=1")),
                    "真实连接池完成核验后可读取指定数据");
        }
        lifecycle(factory, config);
        config.setUsername(writer);
        try (HikariDataSource ignored = factory.createVerified(config)) {
            throw new AssertionError("Write-capable pool accepted");
        } catch (DataSourceFailure failure) {
            require("ACCOUNT_NOT_READ_ONLY".equals(failure.getErrorCode()), "工厂拒绝可写账号且不生成成功连接池");
        }
        properties.setEnabled(false);
        try (HikariDataSource ignored = factory.createVerified(config)) {
            throw new AssertionError("Disabled pool accepted");
        } catch (DataSourceFailure failure) {
            require("FEATURE_DISABLED".equals(failure.getErrorCode()), "提供核验器仍不能绕过默认关闭开关");
        }
    }

    private static void lifecycle(DataSourcePoolFactory factory, RuntimeDataSourceConfig config) throws Exception {
        ScheduledExecutorService retirement = Executors.newSingleThreadScheduledExecutor();
        ManagedRuntimeDataSource route = new ManagedRuntimeDataSource(config.getConfigId(), retirement);
        List<HikariDataSource> created = new ArrayList<>();
        try {
            HikariDataSource first = factory.createVerified(config);
            created.add(first);
            route.exchange(new ManagedRuntimeDataSource.State(first, 1));
            try (Connection held = route.getConnection()) {
                String oldId = value(held, "SELECT CONNECTION_ID()");
                config.setVersion(2);
                HikariDataSource second = factory.createVerified(config);
                created.add(second);
                route.retire(route.exchange(new ManagedRuntimeDataSource.State(second, 2)));
                require(!first.isClosed() && first.getHikariPoolMXBean().getActiveConnections() == 1,
                        "新池替换后旧池保留正在使用的真实连接");
                try (Connection fresh = route.getConnection()) {
                    require(!oldId.equals(value(fresh, "SELECT CONNECTION_ID()")) && route.state().version() == 2,
                            "新请求使用新版本真实连接而非旧池");
                    require("unchanged".equals(value(held, "SELECT marker FROM probe WHERE id=1")),
                            "替换前借出的旧连接仍能完成读取");
                }
            }
            waitFor(first::isClosed, 5000);
            require(first.isClosed(), "归还旧连接后旧池及时关闭");
            HikariDataSource second = created.get(1);
            try (Connection overdue = route.getConnection()) {
                String overdueId = value(overdue, "SELECT CONNECTION_ID()");
                config.setVersion(3);
                HikariDataSource third = factory.createVerified(config);
                created.add(third);
                long started = System.nanoTime();
                route.retire(route.exchange(new ManagedRuntimeDataSource.State(third, 3)));
                require(!second.isClosed() && "unchanged".equals(value(overdue, "SELECT marker FROM probe WHERE id=1")),
                        "开始退役时真实持有连接仍可读取");
                Thread.sleep(55000);
                require(!second.isClosed(), "持续持有55秒的旧连接未提前强退");
                waitFor(second::isClosed, 10000);
                long elapsed = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started);
                require(second.isClosed() && elapsed >= 60000 && elapsed <= 65000,
                        "60秒退役期限到达后旧池关闭并在5秒观察容差内确认");
                boolean refused = false;
                try { value(overdue, "SELECT 1"); } catch (SQLException failure) { refused = true; }
                require(refused, "强制退役后的旧连接不能继续读取");
                require("0".equals(value(root, "SELECT COUNT(*) FROM information_schema.PROCESSLIST WHERE ID=?", overdueId)),
                        "强制退役已关闭MySQL服务器上的真实连接");
                try (Connection fresh = route.getConnection()) {
                    require("unchanged".equals(value(fresh, "SELECT marker FROM probe WHERE id=1")) && route.state().version() == 3,
                            "旧池强退不影响新版本真实读取");
                }
                System.out.println("DATASOURCE_POOL_RETIREMENT: held_at_ms=55000; observed_closed_ms=" + elapsed
                        + "; configured_deadline_ms=60000; observation_tolerance_ms=5000; mysql_connection_closed=true; new_pool_usable=true");
            }
            HikariDataSource third = created.get(2);
            try (Connection finishing = route.getConnection()) {
                route.retire(route.exchange(new ManagedRuntimeDataSource.State(null, 4)));
                try (Connection unexpected = route.getConnection()) { throw new AssertionError("Disabled route returned a connection"); }
                catch (SQLException failure) { require("08003".equals(failure.getSQLState()), "停用入口立即拒绝新连接且不回落主库"); }
                require("unchanged".equals(value(finishing, "SELECT marker FROM probe WHERE id=1")),
                        "停用前正在执行的连接仍能完成读取");
            }
            waitFor(third::isClosed, 5000);
            require(third.isClosed() && route.state().version() == 4 && route.state().pool() == null,
                    "停用连接归还后实际池关闭且保留停用版本");
        } finally {
            route.close();
            for (HikariDataSource pool : created) pool.close();
            retirement.shutdownNow();
        }
    }

    private static void waitFor(BooleanSupplier condition, long milliseconds) throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(milliseconds);
        while (!condition.getAsBoolean() && System.nanoTime() < deadline) Thread.sleep(50);
    }

    private static String account(String name, String grant) throws Exception {
        String username = "ds_" + name + "_" + UUID.randomUUID().toString().substring(0, 8);
        require("0".equals(value(root, "SELECT COUNT(*) FROM mysql.user WHERE User=? AND Host='127.0.0.1'", username)), "随机专用测试账号无冲突");
        execute("CREATE USER ?@'127.0.0.1' IDENTIFIED WITH mysql_native_password BY ?", username, PASSWORD);
        USERS.add(username);
        execute(grant, username);
        return username;
    }

    private static String role() throws Exception {
        String role = "ds_role_" + UUID.randomUUID().toString().substring(0, 8);
        execute("CREATE ROLE ?@'127.0.0.1'", role);
        ROLES.add(role);
        return role;
    }

    private static Connection connect(String username) throws SQLException {
        return DriverManager.getConnection(jdbcUrl, username, PASSWORD);
    }

    private static void verify(String username, String errorCode) throws Exception {
        try (Connection actual = connect(username)) {
            actual.setReadOnly(true);
            require("1".equals(value(actual, "SELECT 1")), "固定查询成功不作为只读权限证明");
            Connection recording = (Connection) Proxy.newProxyInstance(Connection.class.getClassLoader(), new Class<?>[] {Connection.class},
                    (proxy, method, arguments) -> {
                        try {
                            Object result = method.invoke(actual, arguments);
                            boolean prepared = method.getName().equals("prepareStatement");
                            if (!method.getName().equals("createStatement") && !prepared) return result;
                            if (prepared && !"SHOW GRANTS FOR CURRENT_USER USING ?@?".equals(arguments[0])) throw new AssertionError("Unexpected prepared permission query");
                            Statement statement = (Statement) result;
                            return Proxy.newProxyInstance(Statement.class.getClassLoader(), new Class<?>[] {prepared ? PreparedStatement.class : Statement.class},
                                    (statementProxy, operation, values) -> {
                                        if (operation.getName().startsWith("execute")) {
                                            if (!operation.getName().equals("executeQuery") || prepared && values != null && values.length != 0
                                                    || !prepared && (values == null || values.length != 1
                                                    || !Set.of("SELECT DATABASE(), CURRENT_USER(), CURRENT_ROLE(), @@GLOBAL.mandatory_roles",
                                                            "SHOW GRANTS FOR CURRENT_USER").contains(values[0]))) {
                                                throw new AssertionError("Unexpected privilege query");
                                            }
                                            permissionQueries++;
                                        }
                                        try { return operation.invoke(statement, values); }
                                        catch (InvocationTargetException failure) { throw failure.getCause(); }
                                    });
                        } catch (InvocationTargetException failure) { throw failure.getCause(); }
                    });
            if (errorCode == null) {
                VERIFIER.verify(recording, DATABASE);
                pass("真实MySQL直接读取授权通过");
            } else {
                rejected(recording, errorCode);
            }
            accounts++;
        }
    }

    private static void rejected(Connection connection, String expected) throws Exception {
        try { VERIFIER.verify(connection, DATABASE); throw new AssertionError("Account unexpectedly accepted"); }
        catch (DataSourceFailure failure) {
            require(expected.equals(failure.getErrorCode()), "真实MySQL危险或未能证明的授权拒绝：" + expected);
            require(!failure.getMessage().contains(PASSWORD) && failure.getCause() == null, "拒绝不泄露驱动凭据与原始异常");
        }
    }

    private static void execute(String sql, String... values) throws SQLException {
        try (PreparedStatement statement = root.prepareStatement(sql)) {
            for (int index = 0; index < values.length; index++) statement.setString(index + 1, values[index]);
            statement.execute();
        }
    }

    private static String value(Connection connection, String sql, String... values) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            for (int index = 0; index < values.length; index++) statement.setString(index + 1, values[index]);
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()) throw new AssertionError("Missing database result");
                String value = result.getString(1);
                if (result.next()) throw new AssertionError("Multiple database results");
                return value;
            }
        }
    }

    private static void require(boolean condition, String label) {
        if (!condition) throw new AssertionError(label);
        pass(label);
    }

    private static void pass(String label) {
        checks++;
        System.out.println("PASS " + label);
    }
}
