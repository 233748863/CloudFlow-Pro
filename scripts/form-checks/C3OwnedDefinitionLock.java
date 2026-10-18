import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;

public final class C3OwnedDefinitionLock {
    public static void main(String[] arguments) throws Exception {
        try { hold(arguments); }
        catch (Exception | AssertionError failure) {
            System.err.println("C3_OWNED_LOCK_FAILED: type=" + failure.getClass().getSimpleName());
            throw new IllegalStateException("Owned definition lock failed; private diagnostics omitted");
        }
    }

    private static void hold(String[] arguments) throws Exception {
        require(arguments.length == 3);
        Path root = Path.of("D:\\CloudFlowPro").toRealPath();
        Path stateFile = Path.of(arguments[0]).toRealPath(), run = stateFile.getParent();
        require(run.getParent().equals(root.resolve(".cloudflow-runtime/batch-g-integration").toRealPath())
                && run.getFileName().toString().matches("[a-f0-9]{32}") && stateFile.getFileName().toString().equals("state.json"));
        String definitionId = arguments[1], processKey = arguments[2];
        require(definitionId.matches("[a-f0-9-]{36}") && processKey.matches("C-LIVE-[a-f0-9]{8}-race-[ab]"));
        JsonNode state = new ObjectMapper().readTree(Files.readString(stateFile).replaceFirst("^\\uFEFF", ""));
        require("RUNNING".equals(state.path("status").asText()) && Path.of(state.path("run").asText()).toRealPath().equals(run));
        int port = state.path("mysqlPort").asInt(); require(port > 1024 && port < 65536);
        String url = "jdbc:mysql://127.0.0.1:" + port + "/cloud_flow_db?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai&connectTimeout=10000&socketTimeout=20000";
        try (Connection connection = DriverManager.getConnection(url, "root", "")) {
            try (PreparedStatement query = connection.prepareStatement("SELECT @@datadir, CONNECTION_ID(), @@performance_schema"); ResultSet result = query.executeQuery()) {
                require(result.next() && Path.of(result.getString(1)).toRealPath().equals(run.resolve("mysql-data").toRealPath()) && result.getInt(3) == 1);
                long connectionId = result.getLong(2);
                connection.setAutoCommit(false);
                try {
                    try (PreparedStatement lock = connection.prepareStatement("SELECT definition_id FROM wf_process_definition WHERE tenant_id=100000 AND definition_id=? AND process_key=? AND status='DRAFT' FOR UPDATE")) {
                        lock.setString(1, definitionId); lock.setString(2, processKey); lock.setQueryTimeout(20);
                        try (ResultSet selected = lock.executeQuery()) { require(selected.next() && definitionId.equals(selected.getString(1)) && !selected.next()); }
                    }
                    System.out.println("C3_OWNED_LOCK_READY=" + connectionId); System.out.flush();
                    try (BufferedReader input = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8))) {
                        require("RELEASE".equals(input.readLine()));
                    }
                } finally { connection.rollback(); }
            }
        }
        System.out.println("C3_OWNED_LOCK_RELEASED: database_writes=0");
    }

    private static void require(boolean condition) { if (!condition) throw new AssertionError("Owned lock precondition failed"); }
}
