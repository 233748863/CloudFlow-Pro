package com.cloudflow.common.staticrules;

import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

public final class StaticRuleScannerChecks {
    private static int checks;
    private static final Set<String> testedRules = new TreeSet<>();

    public static void main(String[] arguments) throws Exception {
        Map<String, String> fixtures = new LinkedHashMap<>();
        fixtures.put("PERMISSION_GUARD", "@GetMapping\npublic void list() {}\n");
        fixtures.put("POST_NO_REPEAT", "@PostMapping\n@SaCheckPermission(\"oa:item:add\")\npublic void add() {}\n");
        fixtures.put("HIGH_RISK_AUDIT_REQUIRED", "@HighRiskAction\npublic void remove() {}\n");
        fixtures.put("TXN_WORKFLOW", "@Transactional\npublic void submit() {\nremote.startProcess();\n}\n");
        fixtures.put("SQL_CONCAT", "public void query() {\nString sql = %s + value;\n}\n".formatted("\"SELECT id FROM sample WHERE id = \""));
        fixtures.put("MP_SQL_LAST", "public void query() {\nquery." + "last(\"LIMIT 1\");\n}\n");
        fixtures.put("MP_SQL_APPLY", "public void query() {\nquery." + "apply(\"id = 1\");\n}\n");
        fixtures.put("AUDIT_LOG_DELETE_CALL", "public void remove() {\nsysAuditLogMapper.deleteById(1L);\n}\n");
        for (Map.Entry<String, String> fixture : fixtures.entrySet()) {
            verify("FixtureController.java", fixture.getValue(), fixture.getKey());
        }
        verify("AuthController.java", "@PostMapping\n@SaCheckPermission(\"system:auth:login\")\n@RepeatSubmit\npublic void login() {}\n", "AUTH_NO_RATE");
        for (String annotation : List.of("Select", "Update", "Insert", "Delete", "SelectProvider",
                "UpdateProvider", "InsertProvider", "DeleteProvider")) {
            for (String prefix : List.of("@%s(\"unused\")", "@%s (\"unused\")", "@org.apache.ibatis.annotations.%s(\"unused\")")) {
                verify("FixtureMapper.java", prefix.formatted(annotation) + "\npublic void query();\n", "MYBATIS_ANNOTATION_SQL");
            }
        }
        verify("FixtureController.java", "@GetMapping\n@SaCheckPermission(\"oa:item:list\")\npublic void list() {}\n", null);
        verify("FixtureController.java", "@PostMapping\n@SaCheckPermission(\"oa:item:add\")\n@RepeatSubmit\npublic void add() {}\n", null);
        verify("FixtureMapper.java", "@Mapper\npublic void query();\n", null);
        if (testedRules.size() != 10) throw new AssertionError("All ten rules must reject a fixture");
        System.out.println("Static rule scanner checks passed: " + checks + "; rules=" + testedRules.size() + "; annotation variants=24");
        System.out.println("Verified rules: " + String.join(",", testedRules));
    }

    private static void verify(String filename, String body, String expectedRule) throws Exception {
        Path directory = Files.createTempDirectory("static-rule-checks-").toRealPath();
        Path source = directory.resolve(filename);
        PrintStream original = System.out;
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        boolean rejected = false;
        try {
            Files.writeString(source, "public class FixtureController {\n" + body + "}\n", StandardCharsets.UTF_8);
            try (PrintStream capture = new PrintStream(output, true, StandardCharsets.UTF_8)) {
                System.setOut(capture);
                try { new StaticRuleScanner(directory).scan(); }
                catch (IllegalStateException expected) { rejected = true; }
                finally { System.setOut(original); }
            }
            String diagnostics = output.toString(StandardCharsets.UTF_8);
            if (expectedRule == null) {
                if (rejected || !diagnostics.contains("[static-rules] no findings")) throw new AssertionError("Allowed fixture was rejected");
            } else {
                if (!rejected || !diagnostics.contains(expectedRule)) throw new AssertionError("Rule failed to reject fixture: " + expectedRule);
                testedRules.add(expectedRule);
            }
            checks++;
        } finally {
            System.setOut(original);
            Files.deleteIfExists(source);
            Files.delete(directory);
        }
    }
}
