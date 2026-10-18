package com.cloudflow.checks;

import java.io.IOException;
import java.io.InputStream;
import java.util.Map;
import java.util.Set;
import org.apache.ibatis.builder.xml.XMLMapperBuilder;
import org.apache.ibatis.session.Configuration;

public final class FixtureInspectionSql {
    private static final Set<String> QUERIES = Set.of("count", "allRows", "tenantRows", "requestRow", "workflowArtifacts");
    private static final Configuration CONFIGURATION = load();

    private FixtureInspectionSql() {
    }

    public static String query(String statement, String table) {
        if (!QUERIES.contains(statement) || table == null || !table.matches("[a-z][a-z0-9_]{0,63}")) {
            throw new IllegalArgumentException("Unsupported fixture inspection query or table identifier");
        }
        return CONFIGURATION.getMappedStatement("fixture.inspection." + statement)
                .getBoundSql(Map.of("table", table)).getSql();
    }

    private static Configuration load() {
        String resource = "mapper/FixtureInspectionMapper.xml";
        try (InputStream input = FixtureInspectionSql.class.getClassLoader().getResourceAsStream(resource)) {
            if (input == null) throw new IllegalStateException("Fixture inspection XML is required");
            Configuration configuration = new Configuration();
            new XMLMapperBuilder(input, configuration, resource, configuration.getSqlFragments()).parse();
            return configuration;
        } catch (IOException exception) {
            throw new IllegalStateException("Fixture inspection XML could not be loaded", exception);
        }
    }

    public static void main(String[] arguments) {
        int checks = 0;
        for (String statement : QUERIES) {
            String sql = query(statement, "wf_task");
            if (!sql.contains("`wf_task`") || sql.contains("${")) throw new AssertionError("Fixture table was not rendered from XML");
            checks++;
        }
        for (String table : new String[]{"", "hr_request;drop", "cloud_flow_db.hr_request", "hr_request`", "hr_request --", "hr request", "x".repeat(65)}) {
            try { query("count", table); throw new AssertionError("Unsafe table identifier accepted"); }
            catch (IllegalArgumentException expected) { checks++; }
        }
        try { query("remove", "wf_task"); throw new AssertionError("Non-read inspection accepted"); }
        catch (IllegalArgumentException expected) { checks++; }
        if (query("tenantRows", "hr_comp_change").chars().filter(value -> value == '?').count() != 1
                || query("requestRow", "hr_shift_request").chars().filter(value -> value == '?').count() != 2
                || query("workflowArtifacts", "wf_task").chars().filter(value -> value == '?').count() != 2) {
            throw new AssertionError("Fixture values must remain prepared-statement parameters");
        }
        System.out.println("Fixture inspection SQL checks passed: " + (checks + 3));
    }
}
