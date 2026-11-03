import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.cloudflow.common.config.MybatisPlusConfig;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.tenant.TenantConfigProperties;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.workflow.domain.WfTaskHistory;
import com.cloudflow.workflow.domain.vo.WorkflowUrgeTiming;
import com.cloudflow.workflow.mapper.WfTaskUrgeMapper;
import com.cloudflow.workflow.mapper.WfUrgeEffectMapper;
import java.io.InputStream;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.apache.ibatis.builder.xml.XMLMapperBuilder;
import org.apache.ibatis.datasource.unpooled.UnpooledDataSource;
import org.apache.ibatis.mapping.Environment;
import org.apache.ibatis.session.SqlSession;
import org.apache.ibatis.session.SqlSessionFactory;
import org.apache.ibatis.session.SqlSessionFactoryBuilder;
import org.apache.ibatis.transaction.jdbc.JdbcTransactionFactory;

/** 只在专用验证库中以回滚事务运行真实 Mapper；不创建、清空或重建任何表。 */
public final class WorkflowUrgeDatabaseChecks {
    private static int checks;

    public static void main(String[] arguments) throws Exception {
        String url = required("WF_QUALITY_JDBC_URL");
        String user = required("WF_QUALITY_JDBC_USER");
        String password = System.getenv().getOrDefault("WF_QUALITY_JDBC_PASSWORD", "");
        if (!url.matches("jdbc:mysql://[^/]+/quality_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalArgumentException("仅允许显式 quality_ 前缀的专用验证数据库");
        }
        UnpooledDataSource source = new UnpooledDataSource("com.mysql.cj.jdbc.Driver", url, user, password);
        MybatisConfiguration configuration = new MybatisConfiguration();
        configuration.setMapUnderscoreToCamelCase(true);
        configuration.setLogImpl(org.apache.ibatis.logging.nologging.NoLoggingImpl.class);
        configuration.setEnvironment(new Environment("workflow-quality", new JdbcTransactionFactory(), source));
        configuration.addInterceptor(new MybatisPlusConfig(new TenantConfigProperties()).mybatisPlusInterceptor());
        for (String mapper : List.of("WfUrgeEffectMapper", "WfTaskUrgeMapper")) {
            String resource = "mapper/workflow/" + mapper + ".xml";
            try (InputStream input = WorkflowUrgeDatabaseChecks.class.getClassLoader().getResourceAsStream(resource)) {
                if (input == null) throw new AssertionError("Missing production mapper: " + resource);
                new XMLMapperBuilder(input, configuration, resource, configuration.getSqlFragments()).parse();
            }
        }
        SqlSessionFactory factory = new SqlSessionFactoryBuilder().build(configuration);
        String marker = "wfquality-" + UUID.randomUUID();
        try (SqlSession session = factory.openSession(false)) {
            identity(910000001L);
            try {
                verify(session, marker);
            } finally {
                session.rollback(true);
            }
        } finally {
            UserContext.clear();
            TenantContext.clear();
        }
        try (Connection connection = source.getConnection(); PreparedStatement statement = connection.prepareStatement(
                "SELECT (SELECT COUNT(*) FROM wf_task_history WHERE instance_id = ?) + (SELECT COUNT(*) FROM wf_task_urge WHERE task_id = ?)")) {
            statement.setString(1, marker); statement.setString(2, marker);
            try (ResultSet result = statement.executeQuery()) {
                result.next(); equal(0L, result.getLong(1), "all fixture writes were rolled back");
            }
        }
        System.out.println("PASS: Workflow urge MySQL checks=" + checks + "; production_mappers_and_tenant_interceptor=true; committed_rows=0");
    }

    private static void verify(SqlSession session, String task) throws Exception {
        Connection connection = session.getConnection();
        WfUrgeEffectMapper effects = session.getMapper(WfUrgeEffectMapper.class);
        WfTaskUrgeMapper reminders = session.getMapper(WfTaskUrgeMapper.class);
        LocalDateTime completedAt = LocalDateTime.of(2026, 11, 3, 12, 0);
        String firstHistory = task + "-1";
        WfTaskHistory completion = history(connection, firstHistory, 910000001L, task, completedAt);
        equal(0, effects.recordCompletion(completion), "no reminder creates no fabricated association");
        urge(connection, 910000001L, task, completedAt.minusMinutes(10));
        urge(connection, 910000001L, task, completedAt.minusMinutes(1));
        long lastUrge = urge(connection, 910000001L, task, completedAt.minusMinutes(1));
        urge(connection, 910000002L, task, completedAt.minusSeconds(5));
        urge(connection, 910000001L, task, completedAt.plusSeconds(5));
        effects.recordCompletion(completion);
        equal(lastUrge, effectUrge(connection, firstHistory), "latest same-tenant reminder selected with stable same-time ordering");
        List<WorkflowUrgeTiming> timings = effects.selectTimings(910000001L, List.of(firstHistory));
        equal(1, timings.size(), "one completion produces one timing");
        equal(60L, timings.get(0).getElapsedSeconds(), "elapsed time uses persisted completion and reminder timestamps");
        equal(completedAt.minusMinutes(1), timings.get(0).getUrgeTime(), "real latest reminder time returned");
        urge(connection, 910000001L, task, completedAt.minusSeconds(10));
        effects.recordCompletion(completion);
        equal(lastUrge, effectUrge(connection, firstHistory), "repeated completion preserves its original association");
        identity(910000002L);
        equal(0, effects.selectTimings(910000002L, List.of(firstHistory)).size(), "foreign tenant cannot query completion timing");
        equal(0, effects.selectTimings(910000001L, List.of(firstHistory)).size(), "tenant interceptor prevents a forged explicit tenant");
        WfTaskHistory foreign = history(connection, task + "-2", 910000002L, task, completedAt);
        identity(910000001L);
        foreign.setTenantId(910000001L);
        equal(0, effects.recordCompletion(foreign), "foreign completion cannot be associated by forged request metadata");
        String automatic = "auto:" + task;
        reminders.recordReminder(910000001L, task, 11L, automatic, "自动提醒");
        try (PreparedStatement statement = connection.prepareStatement("UPDATE wf_task_urge SET create_time = ? WHERE tenant_id = ? AND source_key = ?")) {
            statement.setTimestamp(1, Timestamp.valueOf(completedAt)); statement.setLong(2, 910000001L); statement.setString(3, automatic); statement.executeUpdate();
        }
        reminders.recordReminder(910000001L, task, 11L, automatic, "自动提醒");
        try (PreparedStatement statement = connection.prepareStatement("SELECT COUNT(*), MIN(create_time), COUNT(sender_id) FROM wf_task_urge WHERE tenant_id = ? AND source_key = ?")) {
            statement.setLong(1, 910000001L); statement.setString(2, automatic);
            try (ResultSet result = statement.executeQuery()) {
                result.next(); equal(1L, result.getLong(1), "automatic retry retains one reminder");
                equal(completedAt, result.getTimestamp(2).toLocalDateTime(), "automatic retry preserves first registration time");
                equal(0L, result.getLong(3), "system reminder does not fabricate a human sender");
            }
        }
        identity(910000002L);
        reminders.recordReminder(910000002L, task, 12L, automatic, "自动提醒");
        try (PreparedStatement statement = connection.prepareStatement("SELECT COUNT(*) FROM wf_task_urge WHERE source_key = ?")) {
            statement.setString(1, automatic);
            try (ResultSet result = statement.executeQuery()) { result.next(); equal(2L, result.getLong(1), "reminder deduplication is tenant-local"); }
        }
    }

    private static WfTaskHistory history(Connection connection, String id, Long tenant, String task, LocalDateTime time) throws Exception {
        try (PreparedStatement statement = connection.prepareStatement("INSERT INTO wf_task_history (history_id,tenant_id,task_id,instance_id,action,create_time) VALUES (?,?,?,?,?,?)")) {
            statement.setString(1, id); statement.setLong(2, tenant); statement.setString(3, task); statement.setString(4, task); statement.setString(5, "APPROVE"); statement.setTimestamp(6, Timestamp.valueOf(time)); statement.executeUpdate();
        }
        WfTaskHistory result = new WfTaskHistory(); result.setHistoryId(id); result.setTenantId(tenant); return result;
    }

    private static long urge(Connection connection, Long tenant, String task, LocalDateTime time) throws Exception {
        try (PreparedStatement statement = connection.prepareStatement("INSERT INTO wf_task_urge (tenant_id,task_id,sender_id,recipient_id,create_time) VALUES (?,?,?,?,?)", Statement.RETURN_GENERATED_KEYS)) {
            statement.setLong(1, tenant); statement.setString(2, task); statement.setLong(3, 10L); statement.setLong(4, 11L); statement.setTimestamp(5, Timestamp.valueOf(time)); statement.executeUpdate();
            try (ResultSet keys = statement.getGeneratedKeys()) { keys.next(); return keys.getLong(1); }
        }
    }

    private static long effectUrge(Connection connection, String history) throws Exception {
        try (PreparedStatement statement = connection.prepareStatement("SELECT urge_id FROM wf_urge_effect WHERE history_id = ?")) {
            statement.setString(1, history);
            try (ResultSet result = statement.executeQuery()) { if (!result.next()) throw new AssertionError("Completion association missing"); return result.getLong(1); }
        }
    }

    private static void identity(Long tenant) { UserContext.setTenantId(tenant); TenantContext.setTenantId(tenant); }
    private static String required(String key) { String value = System.getenv(key); if (value == null || value.isBlank()) throw new IllegalArgumentException("Missing environment variable: " + key); return value; }
    private static void equal(Object expected, Object actual, String label) { if (!Objects.equals(expected, actual)) throw new AssertionError(label + ": expected=" + expected + ", actual=" + actual); checks++; }
}
