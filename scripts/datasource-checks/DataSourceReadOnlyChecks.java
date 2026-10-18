package com.cloudflow.common.datasource.runtime;

import java.lang.reflect.Proxy;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.SQLTimeoutException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

public final class DataSourceReadOnlyChecks {
    private static final String PRINCIPAL = "reports_ro@localhost";
    private static final String USAGE = "GRANT USAGE ON *.* TO `reports_ro`@`localhost`";
    private static final String SELECT = "GRANT SELECT ON `reporting`.* TO `reports_ro`@`localhost`";
    private static final String ROLE = "GRANT `reader`@`localhost` TO `reports_ro`@`localhost`";
    private static int checks;

    public static void main(String[] arguments) throws Exception {
        grants();
        identities();
        connections();
        roleConnections();
        System.out.println("DATASOURCE_READONLY_RULES: checks=" + checks
                + "; failed=0; actual_verifier=true; jdbc_double=true; mysql=false; production_modified=false");
    }

    private static void grants() {
        for (String grant : List.of(SELECT, "GRANT SELECT ON *.* TO `reports_ro`@`localhost`",
                "GRANT SELECT, SHOW VIEW ON `reporting`.* TO `reports_ro`@`localhost`",
                "GRANT SHOW VIEW, SELECT ON `reporting`.`invoice` TO `reports_ro`@`localhost`",
                "GRANT SELECT (`amount`, `id`) ON `reporting`.`invoice` TO `reports_ro`@`localhost`",
                "GRANT SELECT (`column,with,commas`, `quoted``name`) ON `reporting`.`invoice` TO `reports_ro`@`localhost`",
                "GRANT SELECT ON `reporting\\_archive`.* TO 'reports_ro'@'localhost'",
                "GRANT SELECT ON `db TO other`.`ON INSERT,UPDATE` TO `reports_ro`@`localhost`")) {
            MysqlDataSourceReadOnlyVerifier.verifyGrants(List.of(USAGE, grant), PRINCIPAL);
            pass("精确只读授权语法通过");
        }
        for (String privilege : List.of("INSERT", "UPDATE", "DELETE", "CREATE", "DROP", "ALTER", "INDEX", "REFERENCES",
                "TRIGGER", "EVENT", "EXECUTE", "CREATE ROUTINE", "ALTER ROUTINE", "CREATE VIEW", "FILE", "PROCESS",
                "LOCK TABLES", "CREATE TEMPORARY TABLES", "CREATE USER", "CREATE ROLE", "DROP ROLE", "SUPER", "RELOAD",
                "SHUTDOWN", "REPLICATION SLAVE", "REPLICATION CLIENT", "SYSTEM_USER", "SYSTEM_VARIABLES_ADMIN",
                "SESSION_VARIABLES_ADMIN", "CONNECTION_ADMIN", "SET_USER_ID", "GRANT OPTION", "ALL PRIVILEGES",
                "UNKNOWN_FUTURE_PRIVILEGE", "SELECT_INTO_FILE")) {
            String grant = "GRANT " + privilege + " ON `unrelated`.* TO `reports_ro`@`localhost`";
            denied("读取权限不能掩盖其他范围的危险权限", "ACCOUNT_NOT_READ_ONLY",
                    () -> MysqlDataSourceReadOnlyVerifier.verifyGrants(List.of(SELECT, grant), PRINCIPAL));
        }
        for (String grant : List.of(SELECT + " WITH GRANT OPTION", SELECT + " WITH ADMIN OPTION",
                SELECT + ";", SELECT + " REQUIRE SSL", SELECT + " /*comment*/", SELECT + "\nGRANT INSERT",
                "GRANT SELECT, INSERT ON `reporting`.* TO `reports_ro`@`localhost`")) {
            denied("额外权限与尾随内容失败关闭", null,
                    () -> MysqlDataSourceReadOnlyVerifier.verifyGrants(List.of(grant), PRINCIPAL));
        }
        for (String grant : List.of("", " ", "GRANT", "GRANT SELECT", "GRANT SELECT ON report.* TO `reports_ro`@`localhost`",
                "GRANT SELECT ON `reporting`.* TO `other`@`localhost`", "GRANT SELECT ON `reporting`.* TO `reports_ro`@`other`",
                "GRANT SELECT ON *.`invoice` TO `reports_ro`@`localhost`",
                "GRANT USAGE ON `reporting`.* TO `reports_ro`@`localhost`",
                "GRANT USAGE, SELECT ON *.* TO `reports_ro`@`localhost`",
                "GRANT SELECT () ON `reporting`.`invoice` TO `reports_ro`@`localhost`",
                "GRANT SELECT (`amount`,) ON `reporting`.`invoice` TO `reports_ro`@`localhost`",
                "GRANT SELECT (`amount`) ON `reporting`.* TO `reports_ro`@`localhost`",
                "GRANT SELECT ON `reporting`.* TO `reports_ro`@``", "GRANT SELECT ON ``.* TO `reports_ro`@`localhost`",
                "GRANT SELECT ON `reporting`.* TO `reports_ro`@`local\nhost`", SELECT.replace("GRANT ", "GRANT\t"),
                SELECT.toLowerCase(java.util.Locale.ROOT), SELECT.replace("`reporting`", "`unterminated"),
                "REVOKE SELECT ON `reporting`.* FROM `reports_ro`@`localhost`", " ".repeat(16385))) {
            denied("空缺、限制或未知授权格式不能视为已核验", null,
                    () -> MysqlDataSourceReadOnlyVerifier.verifyGrants(List.of(SELECT, grant), PRINCIPAL));
        }
        for (String grant : List.of("GRANT `writer`@`%` TO `reports_ro`@`localhost`",
                "GRANT 'reader'@'%' TO 'reports_ro'@'localhost'",
                "GRANT `reader`@`%`, `writer`@`%` TO `reports_ro`@`localhost`")) {
            denied("未激活的继承角色也不放行", "ACCOUNT_ROLE_PERMISSIONS_UNVERIFIED",
                    () -> MysqlDataSourceReadOnlyVerifier.verifyGrants(List.of(SELECT, grant), PRINCIPAL));
        }
        denied("空清单拒绝", null, () -> MysqlDataSourceReadOnlyVerifier.verifyGrants(List.of(), PRINCIPAL));
        denied("空引用清单拒绝", null, () -> MysqlDataSourceReadOnlyVerifier.verifyGrants(null, PRINCIPAL));
        denied("空授权行拒绝", null, () -> MysqlDataSourceReadOnlyVerifier.verifyGrants(Collections.singletonList(null), PRINCIPAL));
        denied("超出清单行数上限拒绝", null,
                () -> MysqlDataSourceReadOnlyVerifier.verifyGrants(Collections.nCopies(257, SELECT), PRINCIPAL));
        denied("只有USAGE未证明可读取", "ACCOUNT_READ_PERMISSION_MISSING",
                () -> MysqlDataSourceReadOnlyVerifier.verifyGrants(List.of(USAGE), PRINCIPAL));
    }

    private static void identities() {
        MysqlDataSourceReadOnlyVerifier.requireAccount(PRINCIPAL, "NONE", "");
        pass("专用账号无激活及强制角色");
        for (String principal : List.of("root@localhost", "ROOT@127.0.0.1", "@localhost", "reports_ro", "reports_ro@", "reports_ro@local\nhost")) {
            denied("拒绝匿名、管理员或不完整身份", null,
                    () -> MysqlDataSourceReadOnlyVerifier.requireAccount(principal, "NONE", ""));
        }
        for (String role : List.of("`reader`@`%`", "`writer`@`%`")) {
            MysqlDataSourceReadOnlyVerifier.requireAccount(PRINCIPAL, role, "");
            MysqlDataSourceReadOnlyVerifier.requireAccount(PRINCIPAL, "NONE", role);
            pass("激活或强制角色元信息必须继续展开权限才能判定");
        }
        denied("缺少激活角色状态拒绝", null,
                () -> MysqlDataSourceReadOnlyVerifier.requireAccount(PRINCIPAL, "", ""));
        denied("缺少强制角色状态拒绝", null,
                () -> MysqlDataSourceReadOnlyVerifier.requireAccount(PRINCIPAL, "NONE", null));
    }

    private static void roleConnections() throws Exception {
        MysqlDataSourceReadOnlyVerifier verifier = new MysqlDataSourceReadOnlyVerifier();
        for (String active : List.of("NONE", "`reader`@`localhost`")) {
            JdbcProbe reader = new JdbcProbe();
            reader.active = active;
            reader.grants = List.of(USAGE, ROLE);
            reader.expansions = Map.of("reader@localhost", List.of(USAGE, SELECT, ROLE));
            verifier.verify(reader.connection(), "reporting");
            require(reader.queries.size() == 3 && reader.queries.get(2).equals("SHOW GRANTS FOR CURRENT_USER USING ?@?"),
                    "未激活及已激活只读角色使用固定参数化查询核验");
            require(reader.closedStatements.get() == 3 && reader.closedResults.get() == 3, "角色查询关闭全部资源");
        }
        JdbcProbe mandatory = new JdbcProbe();
        mandatory.mandatory = "reader@localhost";
        mandatory.grants = List.of(USAGE, ROLE);
        mandatory.expansions = Map.of("reader@localhost", List.of(USAGE, SELECT, ROLE));
        verifier.verify(mandatory.connection(), "reporting");
        pass("强制只读角色也必须取得完整展开证据");
        JdbcProbe writer = new JdbcProbe();
        writer.grants = List.of(SELECT, ROLE);
        writer.expansions = Map.of("reader@localhost", List.of(SELECT, ROLE, "GRANT INSERT ON `other`.* TO `reports_ro`@`localhost`"));
        denied("直接读取权限不能掩盖未激活角色的写权限", "ACCOUNT_NOT_READ_ONLY",
                () -> verifier.verify(writer.connection(), "reporting"));
        JdbcProbe changed = new JdbcProbe();
        changed.grants = List.of(SELECT, ROLE);
        changed.expansions = Map.of("reader@localhost", List.of(SELECT));
        denied("角色授权集合在查询期间变化拒绝", "ACCOUNT_ROLE_PERMISSIONS_UNVERIFIED",
                () -> verifier.verify(changed.connection(), "reporting"));
        JdbcProbe unavailable = new JdbcProbe();
        unavailable.grants = List.of(SELECT, ROLE);
        denied("无法展开角色时不能仅凭直接权限放行", "ACCOUNT_VERIFICATION_FAILED",
                () -> verifier.verify(unavailable.connection(), "reporting"));
        JdbcProbe administrator = new JdbcProbe();
        administrator.grants = List.of(SELECT, ROLE + " WITH ADMIN OPTION");
        denied("只有读取权限的角色也不能转授权", "ACCOUNT_NOT_READ_ONLY",
                () -> verifier.verify(administrator.connection(), "reporting"));
        JdbcProbe manyRoles = new JdbcProbe();
        List<String> roleNames = new ArrayList<>();
        for (int index = 0; index < 65; index++) roleNames.add("`role" + index + "`@`localhost`");
        manyRoles.grants = List.of(SELECT, "GRANT " + String.join(", ", roleNames) + " TO `reports_ro`@`localhost`");
        denied("超过64个角色必须完整拒绝而非截断核验", "ACCOUNT_ROLE_PERMISSIONS_UNVERIFIED",
                () -> verifier.verify(manyRoles.connection(), "reporting"));
        JdbcProbe quotedRole = new JdbcProbe();
        String role = "GRANT `reader' OR 1=1`@`localhost` TO `reports_ro`@`localhost`";
        quotedRole.grants = List.of(SELECT, role);
        quotedRole.expansions = Map.of("reader' OR 1=1@localhost", List.of(SELECT, role));
        verifier.verify(quotedRole.connection(), "reporting");
        require(quotedRole.queries.get(2).equals("SHOW GRANTS FOR CURRENT_USER USING ?@?"), "角色名称仅作为绑定值而不拼入SQL");
    }

    private static void connections() throws Exception {
        MysqlDataSourceReadOnlyVerifier verifier = new MysqlDataSourceReadOnlyVerifier();
        JdbcProbe success = new JdbcProbe();
        verifier.verify(success.connection(), "reporting");
        require(success.queries.equals(List.of("SELECT DATABASE(), CURRENT_USER(), CURRENT_ROLE(), @@GLOBAL.mandatory_roles",
                "SHOW GRANTS FOR CURRENT_USER")), "只执行两条固定只读元信息查询");
        require(success.timeouts.equals(List.of(5, 5)), "每条权限查询五秒超时");
        require(success.closedStatements.get() == 2 && success.closedResults.get() == 2, "成功后关闭全部查询资源");
        require(!success.connectionClosed, "核验不关闭调用方连接");
        JdbcProbe wrongDatabase = new JdbcProbe();
        wrongDatabase.database = "wrong";
        denied("实际数据库不匹配拒绝", null, () -> verifier.verify(wrongDatabase.connection(), "reporting"));
        require(wrongDatabase.queries.size() == 1, "身份不符即停止后续查询");
        JdbcProbe mandatory = new JdbcProbe();
        mandatory.mandatory = "`writer`@`%`";
        denied("真实核验链读取强制角色并拒绝", "ACCOUNT_ROLE_PERMISSIONS_UNVERIFIED",
                () -> verifier.verify(mandatory.connection(), "reporting"));
        JdbcProbe unsafe = new JdbcProbe();
        unsafe.grants = List.of(SELECT, "GRANT INSERT ON `other`.* TO `reports_ro`@`localhost`");
        denied("真实核验链拒绝写权限", "ACCOUNT_NOT_READ_ONLY", () -> verifier.verify(unsafe.connection(), "reporting"));
        for (SQLException failure : List.of(new SQLException("secret-password-and-jdbc-url"),
                new SQLTimeoutException("secret-password-and-jdbc-url"))) {
            JdbcProbe unavailable = new JdbcProbe();
            unavailable.failure = failure;
            denied("读取失败与超时均失败关闭且不泄露驱动信息", failure instanceof SQLTimeoutException
                    ? "ACCOUNT_VERIFICATION_TIMEOUT" : "ACCOUNT_VERIFICATION_FAILED",
                    () -> verifier.verify(unavailable.connection(), "reporting"));
            require(unavailable.closedStatements.get() == 1, "查询失败仍关闭语句");
        }
        JdbcProbe incomplete = new JdbcProbe();
        incomplete.grants = Collections.nCopies(257, SELECT);
        denied("驱动返回超限权限不截断后放行", null, () -> verifier.verify(incomplete.connection(), "reporting"));
        JdbcProbe oversized = new JdbcProbe();
        oversized.grants = List.of(SELECT + " ".repeat(16385));
        denied("驱动返回超长权限不截断后放行", null, () -> verifier.verify(oversized.connection(), "reporting"));
    }

    private static final class JdbcProbe {
        private String database = "reporting";
        private String mandatory = "";
        private String active = "NONE";
        private List<String> grants = List.of(USAGE, SELECT);
        private Map<String, List<String>> expansions = Map.of();
        private SQLException failure;
        private final List<String> queries = new ArrayList<>();
        private final List<Integer> timeouts = new ArrayList<>();
        private final AtomicInteger closedStatements = new AtomicInteger();
        private final AtomicInteger closedResults = new AtomicInteger();
        private boolean connectionClosed;

        private Connection connection() {
            return (Connection) Proxy.newProxyInstance(Connection.class.getClassLoader(), new Class<?>[] {Connection.class},
                    (proxy, method, arguments) -> switch (method.getName()) {
                        case "getMetaData" -> Proxy.newProxyInstance(DatabaseMetaData.class.getClassLoader(),
                                new Class<?>[] {DatabaseMetaData.class}, (metadata, accessor, values) -> switch (accessor.getName()) {
                                    case "getDatabaseProductName" -> "MySQL";
                                    case "getDatabaseMajorVersion" -> 8;
                                    default -> throw new AssertionError(accessor.getName());
                                });
                        case "createStatement" -> statement();
                        case "prepareStatement" -> prepared((String) arguments[0]);
                        case "close" -> { connectionClosed = true; yield null; }
                        default -> throw new AssertionError(method.getName());
                    });
        }

        private Statement statement() {
            return (Statement) Proxy.newProxyInstance(Statement.class.getClassLoader(), new Class<?>[] {Statement.class},
                    (proxy, method, arguments) -> switch (method.getName()) {
                        case "setQueryTimeout" -> { timeouts.add((Integer) arguments[0]); yield null; }
                        case "setMaxRows" -> null;
                        case "executeQuery" -> {
                            String query = (String) arguments[0];
                            queries.add(query);
                            if (failure != null) throw failure;
                            List<List<String>> rows = query.equals("SHOW GRANTS FOR CURRENT_USER")
                                    ? grants.stream().map(Collections::singletonList).toList()
                                    : List.of(List.of(database, PRINCIPAL, active, mandatory));
                            yield results(rows);
                        }
                        case "close" -> { closedStatements.incrementAndGet(); yield null; }
                        default -> throw new AssertionError(method.getName());
                    });
        }

        private PreparedStatement prepared(String sql) {
            Map<Integer, String> parameters = new java.util.HashMap<>();
            return (PreparedStatement) Proxy.newProxyInstance(PreparedStatement.class.getClassLoader(), new Class<?>[] {PreparedStatement.class},
                    (proxy, method, arguments) -> switch (method.getName()) {
                        case "setQueryTimeout" -> { timeouts.add((Integer) arguments[0]); yield null; }
                        case "setMaxRows" -> null;
                        case "setString" -> { parameters.put((Integer) arguments[0], (String) arguments[1]); yield null; }
                        case "executeQuery" -> {
                            require("SHOW GRANTS FOR CURRENT_USER USING ?@?".equals(sql), "角色展开只使用固定查询");
                            queries.add(sql);
                            List<String> rows = expansions.get(parameters.get(1) + "@" + parameters.get(2));
                            if (rows == null) throw new SQLException("Role expansion unavailable");
                            yield results(rows.stream().map(Collections::singletonList).toList());
                        }
                        case "close" -> { closedStatements.incrementAndGet(); yield null; }
                        default -> throw new AssertionError(method.getName());
                    });
        }

        private ResultSet results(List<List<String>> rows) {
            AtomicInteger cursor = new AtomicInteger(-1);
            return (ResultSet) Proxy.newProxyInstance(ResultSet.class.getClassLoader(), new Class<?>[] {ResultSet.class},
                    (proxy, method, arguments) -> switch (method.getName()) {
                        case "next" -> cursor.incrementAndGet() < rows.size();
                        case "getString" -> rows.get(cursor.get()).get((Integer) arguments[0] - 1);
                        case "close" -> { closedResults.incrementAndGet(); yield null; }
                        default -> throw new AssertionError(method.getName());
                    });
        }
    }

    private static void denied(String label, String expected, CheckedAction action) {
        try { action.run(); throw new AssertionError(label); }
        catch (DataSourceFailure failure) {
            require(expected == null || expected.equals(failure.getErrorCode()), label);
            require(!failure.getMessage().contains("secret-password-and-jdbc-url") && failure.getCause() == null,
                    "拒绝结果不携带驱动秘密信息");
        } catch (Exception failure) { throw new AssertionError(label, failure); }
    }

    private static void require(boolean condition, String label) {
        if (!condition) throw new AssertionError(label);
        pass(label);
    }

    private static void pass(String label) {
        checks++;
        System.out.println("PASS " + label);
    }

    private interface CheckedAction { void run() throws Exception; }
}
