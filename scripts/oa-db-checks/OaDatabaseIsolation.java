import java.sql.ResultSet;
import net.sf.jsqlparser.parser.CCJSqlParserUtil;
import net.sf.jsqlparser.util.TablesNamesFinder;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

final class OaDatabaseIsolation implements AutoCloseable {
    static final Set<String> REQUIRED = Set.of("oa_consumable", "oa_consumable_ledger", "oa_asset_log",
            "oa_consumable_request", "oa_consumable_request_item", "oa_trace_event", "oa_risk_alert",
            "biz_purchase_request", "biz_purchase_item", "biz_purchase_receipt", "oa_project", "oa_purchase_rfq",
            "sys_user", "sys_dept", "sys_user_role", "sys_role", "sys_role_menu", "sys_menu", "sys_config",
            "sys_message_channel", "sys_message_template", "sys_message_subscribe", "sys_message_record", "sys_message_delivery", "outbox_event");
    final String database = environment("OA08_DB_TARGET");
    final String owner = environment("OA08_DB_OWNER");
    final String source = environment("OA08_DB_SOURCE");
    final String username = environment("OA08_DB_USERNAME");
    final boolean loopback = System.getenv("OA08_DB_DIRECTORY") != null;
    final String password = loopback ? "" : environment("OA08_DB_PASSWORD");
    final Set<String> tables = new LinkedHashSet<>();
    final Connection administration;
    final String url;
    private final Map<String, String> sourceShapes = new LinkedHashMap<>();
    private boolean created;
    private boolean owned;
    private int sourceTableCount;

    OaDatabaseIsolation() throws Exception {
        String host = environment("OA08_DB_HOST");
        String port = environment("OA08_DB_PORT");
        require("cloud_flow_db".equals(source), "FIXED_SOURCE_REQUIRED");
        if (loopback) {
            require("127.0.0.1".equals(host) && port.matches("[0-9]{4,5}") && Integer.parseInt(port) > 1024 && Integer.parseInt(port) < 65536,
                    "ISOLATED_LOOPBACK_REQUIRED");
        } else require("192.168.1.173".equals(host) && "3306".equals(port), "FIXED_SOURCE_REQUIRED");
        require(database.matches("oa08_verify_[a-f0-9]{32}") && !database.equals(source) && owner.matches("[a-f0-9]{32}"), "DEDICATED_TARGET_REQUIRED");
        String base = "jdbc:mysql://" + host + ":" + port + "/";
        String options = "?useSSL=false&allowPublicKeyRetrieval=true&characterEncoding=UTF-8&serverTimezone=Asia/Shanghai"
                + "&allowMultiQueries=false&connectTimeout=10000&socketTimeout=45000&sessionVariables=innodb_lock_wait_timeout=15";
        administration = DriverManager.getConnection(base + options, username, password);
        require(administration.getCatalog() == null || administration.getCatalog().isEmpty(), "ADMINISTRATION_HAS_NO_DEFAULT_SCHEMA");
        if (loopback) {
            Path directory = Path.of(environment("OA08_DB_DIRECTORY")).toRealPath();
            Path runtime = Path.of(environment("OA08_DB_RUNTIME")).toRealPath();
            require(directory.getFileName().toString().equals("mysql-data") && directory.getParent().getFileName().toString().matches("[a-f0-9]{32}")
                    && directory.getParent().getParent().equals(runtime), "OWNED_MYSQL_DIRECTORY_REQUIRED");
            try (Statement query = administration.createStatement(); ResultSet rows = query.executeQuery("SELECT @@datadir")) {
                require(rows.next() && directory.equals(Path.of(rows.getString(1)).toRealPath()), "LIVE_MYSQL_DIRECTORY_MISMATCH");
            }
        }
        url = base + database + options;
    }

    void initialize() throws Exception {
        try (PreparedStatement query = administration.prepareStatement("SELECT table_name,engine FROM information_schema.tables WHERE table_schema=? AND table_type='BASE TABLE' ORDER BY table_name")) {
            query.setString(1, source);
            try (ResultSet rows = query.executeQuery()) {
                while (rows.next()) {
                    sourceTableCount++;
                    String table = rows.getString(1);
                    if (table.startsWith("oa_") || table.startsWith("biz_") || REQUIRED.contains(table)) {
                        require(table.matches("[a-z][a-z0-9_]+") && "InnoDB".equals(rows.getString(2)), "REAL_INNODB_STRUCTURE_REQUIRED");
                        tables.add(table);
                    }
                }
            }
        }
        require(tables.containsAll(REQUIRED), "REQUIRED_REAL_TABLE_MISSING_NO_SYNTHETIC_REPLACEMENT");
        for (String table : tables) {
            require(metadataCount("SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema=? AND event_object_table=?", source, table) == 0, "SOURCE_TRIGGER_REQUIRES_EXPLICIT_CLONING");
            require(metadataCount("SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema=? AND table_name=? AND constraint_type='FOREIGN KEY'", source, table) == 0, "SOURCE_FOREIGN_KEY_REQUIRES_EXPLICIT_CLONING");
            sourceShapes.put(table, shape(source, table));
        }
        try (Statement statement = administration.createStatement()) {
            statement.execute("CREATE DATABASE " + database + " CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci");
            created = true;
        }
        administration.setCatalog(database);
        try (Statement statement = administration.createStatement()) {
            statement.execute("CREATE TABLE " + database + ".oa08_fixture_owner (owner_token CHAR(32) NOT NULL PRIMARY KEY) ENGINE=InnoDB");
            try (PreparedStatement insert = administration.prepareStatement("INSERT INTO oa08_fixture_owner VALUES (?)")) {
                insert.setString(1, owner);
                require(insert.executeUpdate() == 1, "OWNERSHIP_MARKER_RECORDED");
            }
            owned = true;
            requireOwnership();
            for (String table : tables) {
                statement.execute("CREATE TABLE " + database + "." + table + " LIKE " + source + "." + table);
                require(sourceShapes.get(table).equals(shape(database, table)), "CLONED_STRUCTURE_MISMATCH");
            }
            try (ResultSet rows = statement.executeQuery("SELECT VERSION()")) {
                rows.next();
                System.out.println("OA08 ISOLATION: target=" + database + "; MySQL=" + rows.getString(1)
                        + "; source-tables=" + sourceTableCount + "; cloned-empty-real-tables=" + tables.size()
                        + "; source-row-reads=0; source-DML=0.");
            }
        }
    }

    private String shape(String schema, String table) throws Exception {
        List<String> values = new ArrayList<>();
        for (String sql : List.of(
                "SELECT column_name,column_type,is_nullable,column_default,extra,character_set_name,collation_name FROM information_schema.columns WHERE table_schema=? AND table_name=? ORDER BY ordinal_position",
                "SELECT index_name,non_unique,seq_in_index,column_name,collation,sub_part,index_type FROM information_schema.statistics WHERE table_schema=? AND table_name=? ORDER BY index_name,seq_in_index")) {
            try (PreparedStatement query = administration.prepareStatement(sql)) {
                query.setString(1, schema);
                query.setString(2, table);
                try (ResultSet rows = query.executeQuery()) {
                    while (rows.next()) {
                        for (int column = 1; column <= rows.getMetaData().getColumnCount(); column++) {
                            String value = rows.getString(column);
                            values.add(value == null ? "NULL" : value.length() + ":" + value);
                        }
                    }
                }
            }
        }
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(String.join("\n", values).getBytes(StandardCharsets.UTF_8)));
    }

    private long metadataCount(String sql, String... values) throws SQLException {
        try (PreparedStatement query = administration.prepareStatement(sql)) {
            for (int index = 0; index < values.length; index++) query.setString(index + 1, values[index]);
            try (ResultSet rows = query.executeQuery()) {
                require(rows.next(), "METADATA_COUNT_REQUIRED");
                return rows.getLong(1);
            }
        }
    }

    void requireOwnership() throws SQLException {
        require(owned && database.matches("oa08_verify_[a-f0-9]{32}") && !database.equals(source), "OWNERSHIP_REQUIRED");
        require(database.equals(administration.getCatalog()), "MANAGEMENT_CATALOG_MUST_BE_ISOLATED");
        try (Statement query = administration.createStatement(); ResultSet rows = query.executeQuery("SELECT owner_token FROM oa08_fixture_owner")) {
            require(rows.next() && owner.equals(rows.getString(1)) && !rows.next(), "OWNERSHIP_MARKER_MISMATCH");
        }
    }

    void createFailureTrigger(String name, String event, String table, String field, long identifier) throws SQLException {
        requireOwnership();
        require(name.matches("oa08_[a-z_]+") && tables.contains(table) && Set.of("INSERT", "UPDATE").contains(event)
                && Set.of("consumable_id", "ref_id", "request_id", "id", "receiver_id").contains(field) && identifier > 0, "UNSAFE_TRIGGER_ARGUMENT");
        try (Statement statement = administration.createStatement()) {
            statement.execute("CREATE TRIGGER " + database + "." + name + " AFTER " + event + " ON " + database + "." + table
                    + " FOR EACH ROW BEGIN IF NEW." + field + "=" + identifier
                    + " THEN SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO=1644, MESSAGE_TEXT='OA08_INJECTED_DATABASE_FAILURE'; END IF; END");
        }
    }

    void dropFailureTrigger(String name) throws SQLException {
        requireOwnership();
        require(name.matches("oa08_[a-z_]+"), "UNSAFE_TRIGGER_REMOVAL");
        try (Statement statement = administration.createStatement()) {
            statement.execute("DROP TRIGGER " + database + "." + name);
        }
    }

    boolean hasRowWait(String table, long waitingConnection, long blockingConnection) throws SQLException {
        require(tables.contains(table), "WAIT_TABLE_MUST_BE_IN_FIXTURE");
        String sql = "SELECT COUNT(*) FROM performance_schema.data_lock_waits waiting"
                + " JOIN performance_schema.data_locks requested ON requested.ENGINE=waiting.ENGINE AND requested.ENGINE_LOCK_ID=waiting.REQUESTING_ENGINE_LOCK_ID"
                + " JOIN performance_schema.data_locks blocking ON blocking.ENGINE=waiting.ENGINE AND blocking.ENGINE_LOCK_ID=waiting.BLOCKING_ENGINE_LOCK_ID"
                + " JOIN performance_schema.threads requester ON requester.THREAD_ID=requested.THREAD_ID"
                + " JOIN performance_schema.threads blocker ON blocker.THREAD_ID=blocking.THREAD_ID"
                + " WHERE requested.OBJECT_SCHEMA=? AND blocking.OBJECT_SCHEMA=? AND requested.OBJECT_NAME=? AND blocking.OBJECT_NAME=?"
                + " AND requested.LOCK_TYPE='RECORD' AND blocking.LOCK_TYPE='RECORD' AND requester.PROCESSLIST_ID=? AND blocker.PROCESSLIST_ID=?";
        try (PreparedStatement query = administration.prepareStatement(sql)) {
            query.setString(1, database);
            query.setString(2, database);
            query.setString(3, table);
            query.setString(4, table);
            query.setLong(5, waitingConnection);
            query.setLong(6, blockingConnection);
            try (ResultSet rows = query.executeQuery()) {
                return rows.next() && rows.getLong(1) > 0;
            }
        }
    }

    @Override
    public void close() throws Exception {
        try {
            if (owned) {
                requireOwnership();
                String sourceEvidence = "unverified";
                try {
                    boolean structureUnchanged = metadataCount("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=? AND table_type='BASE TABLE'", source) == sourceTableCount;
                    for (String table : tables) structureUnchanged &= sourceShapes.get(table).equals(shape(source, table));
                    sourceEvidence = Boolean.toString(structureUnchanged);
                } finally {
                    requireOwnership();
                    try (Statement statement = administration.createStatement()) {
                        statement.execute("DROP DATABASE " + database);
                    }
                    boolean absent = metadataCount("SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name=?", database) == 0;
                    System.out.println("OA08 CLEANUP: target=" + database + "; ownership=verified; database-absent=" + absent
                            + "; source-table-count=" + sourceTableCount + "; cloned-source-structures-unchanged=" + sourceEvidence
                            + "; source-row-reads=0; source-DML=0.");
                    require(absent, "FIXTURE_DATABASE_CLEANUP_FAILED");
                }
                require("true".equals(sourceEvidence), "SOURCE_STRUCTURE_CHECK_FAILED");
            } else if (created) {
                System.err.println("OA08 CLEANUP: ownership unavailable; automatic drop refused for " + database);
                throw new IllegalStateException("UNOWNED_CREATED_FIXTURE_REQUIRES_REVIEW");
            }
        } finally {
            administration.close();
        }
    }

    static String environment(String name) {
        String value = System.getenv(name);
        require(value != null && !value.isBlank(), "REQUIRED_ENVIRONMENT_MISSING_" + name);
        return value;
    }

    static void require(boolean condition, String label) {
        if (!condition) throw new IllegalStateException(label);
    }

    static final class FixtureDataSource extends DriverManagerDataSource {
        private final String database;
        private final Set<String> tables;
        private final Set<String> approvedSql = ConcurrentHashMap.newKeySet();

        FixtureDataSource(OaDatabaseIsolation isolation) {
            super(isolation.url, isolation.username, isolation.password);
            database = isolation.database;
            tables = Set.copyOf(isolation.tables);
        }

        @Override
        public Connection getConnection(String username, String password) throws SQLException {
            throw new SQLException("OVERRIDE_CREDENTIALS_REFUSED");
        }

        @Override
        public Connection getConnection() throws SQLException {
            Connection actual = super.getConnection();
            if (!database.equals(actual.getCatalog())) {
                actual.close();
                throw new SQLException("NON_FIXTURE_CONNECTION_REFUSED");
            }
            return (Connection) Proxy.newProxyInstance(Connection.class.getClassLoader(), new Class<?>[]{Connection.class}, (proxy, method, arguments) -> {
                if (Set.of("setCatalog", "setSchema").contains(method.getName())) require(database.equals(arguments[0]), "DATABASE_SWITCH_REFUSED");
                if ("unwrap".equals(method.getName())) {
                    require(arguments[0] == Connection.class, "RAW_CONNECTION_UNWRAP_REFUSED");
                    return proxy;
                }
                if ("isWrapperFor".equals(method.getName())) return arguments[0] == Connection.class;
                if (arguments != null && arguments.length > 0 && arguments[0] instanceof String sql
                        && Set.of("prepareStatement", "prepareCall", "nativeSQL").contains(method.getName())) validateSql(sql);
                try {
                    Object result = method.invoke(actual, arguments);
                    if (result instanceof Statement statement) {
                        Class<?> statementType = statement instanceof PreparedStatement ? PreparedStatement.class : Statement.class;
                        return Proxy.newProxyInstance(Statement.class.getClassLoader(), new Class<?>[]{statementType}, (statementProxy, operation, values) -> {
                            if ("getConnection".equals(operation.getName())) return proxy;
                            if ("unwrap".equals(operation.getName())) throw new SQLException("RAW_STATEMENT_UNWRAP_REFUSED");
                            if ("isWrapperFor".equals(operation.getName())) return false;
                            if (values != null && values.length > 0 && values[0] instanceof String sql
                                    && Set.of("execute", "executeQuery", "executeUpdate", "executeLargeUpdate", "addBatch").contains(operation.getName())) validateSql(sql);
                            try { return operation.invoke(statement, values); }
                            catch (InvocationTargetException failure) { throw failure.getCause(); }
                        });
                    }
                    return result;
                } catch (InvocationTargetException failure) {
                    throw failure.getCause();
                }
            });
        }

        void validateSql(String sql) {
            if (approvedSql.contains(sql)) return;
            String normalized = sql.stripLeading().toUpperCase(Locale.ROOT);
            require(normalized.matches("(?s)(SELECT|INSERT|UPDATE|DELETE)\\b.*") && !normalized.contains("CLOUD_FLOW_DB")
                    && !normalized.contains(";") && !normalized.contains("/*") && !normalized.contains("--")
                    && !normalized.contains("OUTFILE") && !normalized.contains("DUMPFILE") && !normalized.contains("LOAD_FILE"), "NON_FIXTURE_SQL_REFUSED");
            try {
                for (String table : new TablesNamesFinder().getTableList(CCJSqlParserUtil.parse(sql))) {
                    String[] pieces = table.replace("`", "").toLowerCase(Locale.ROOT).split("\\.");
                    require(pieces.length == 1 || pieces.length == 2 && database.equals(pieces[0]), "CROSS_SCHEMA_SQL_REFUSED");
                    require(tables.contains(pieces[pieces.length - 1]), "UNCLONED_TABLE_SQL_REFUSED");
                }
            } catch (IllegalStateException failure) {
                throw failure;
            } catch (Exception failure) {
                throw new IllegalStateException("UNPARSEABLE_FIXTURE_SQL_REFUSED");
            }
            approvedSql.add(sql);
        }
    }
}
