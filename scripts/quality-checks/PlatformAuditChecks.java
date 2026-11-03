package com.cloudflow.auth.checks;

import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.audit.aop.AuditAspect;
import com.cloudflow.common.audit.domain.SysAuditLogEntity;
import com.cloudflow.common.audit.handle.DefaultAuditLogHandle;
import com.cloudflow.common.audit.handle.JaversCompareHandle;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import com.cloudflow.common.audit.support.AuditBizModuleResolver;
import com.cloudflow.common.audit.support.AuditSnapshotContext;
import com.cloudflow.common.audit.support.DataAuditor;
import com.cloudflow.common.core.context.UserContext;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.flipkart.zjsonpatch.JsonPatch;
import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.aop.aspectj.annotation.AspectJProxyFactory;

/** Real audit aspect, JaVers and JSON diff; persistence is a recording mapper. */
public final class PlatformAuditChecks {
    private static int checks;

    public static void main(String[] arguments) throws Exception {
        try {
            UserContext.setTenantId(91001L);
            UserContext.setUserId(91L);
            UserContext.setUserName("platform-audit-check");
            Fixture fixture = new Fixture();
            snapshots(fixture);
            scopes(fixture);
            failures(fixture);
            System.out.println("PLATFORM_AUDIT_CHECKS: passed=" + checks
                    + "; real_spring_aspect=true; real_javers=true; json_patch=true; mysql=false; http=false");
        } finally {
            UserContext.clear();
        }
    }

    private static void snapshots(Fixture fixture) throws Exception {
        HrSnapshot before = new HrSnapshot(15L, Map.of("status", "DRAFT", "salary", "****"), List.of());
        HrSnapshot after = new HrSnapshot(15L, Map.of("status", "ACTIVE", "salary", "****"), List.of("salary"));
        fixture.changed(before, after);
        check(fixture.rows.stream().anyMatch(row -> "data".equals(row.getAuditField())
                && row.getBeforeVal().contains("DRAFT") && row.getAfterVal().contains("ACTIVE")),
                "HR Map snapshot change retains the exact old and new business values");
        check(fixture.rows.stream().anyMatch(row -> "changedSensitiveFields".equals(row.getAuditField())
                && row.getAfterVal().contains("salary")), "masked field change remains visible by its field name");
        check(fixture.json.treeConversions == 2, "multi-field audit serializes each full snapshot exactly once");
        fixture.changed(null, after);
        fixture.changed(after, null);
        fixture.changed(Map.of("one", 1), Map.of("one", 2, "two", 3));
        fixture.changed(List.of("one"), List.of("one", "two"));
        fixture.changed("before", "after");
        fixture.changed(4, 5);
        fixture.changed(new String[]{"a"}, new String[]{"a", "b"});
        fixture.rows.clear();
        fixture.service.change(before, before);
        fixture.service.change(null, null);
        fixture.service.change(Map.of("one", 1), Map.of("one", 1));
        fixture.service.change(List.of("one"), List.of("one"));
        check(fixture.rows.isEmpty(), "unchanged structured and simple values produce no invented audit");
        check(DataAuditor.compare(before, after).size() > 0, "direct HR snapshots do not require additional reads");
    }

    private static void scopes(Fixture fixture) {
        fixture.rows.clear();
        fixture.service.outer(fixture.service);
        check(fixture.rows.stream().anyMatch(row -> "outer".equals(row.getAuditName()))
                && fixture.rows.stream().anyMatch(row -> "provided".equals(row.getAuditName())),
                "nested audited operations keep both changes");
        check(AuditSnapshotContext.current() == null, "successful proxy call releases its snapshot scope");
        fixture.rows.clear();
        boolean rejected = false;
        try { fixture.service.failure(); }
        catch (IllegalStateException expected) { rejected = true; }
        check(rejected && fixture.rows.isEmpty(), "failed business call produces no successful audit");
        check(AuditSnapshotContext.current() == null, "failed proxy call releases its snapshot scope");
        AuditSnapshotContext.record("outside", "ignored");
        check(AuditSnapshotContext.current() == null, "direct calls do not leak a scope into later requests");
    }

    private static void failures(Fixture fixture) {
        fixture.rows.clear();
        check(fixture.service.failedOldSnapshot() == 1, "failure reading an audit snapshot still executes the main operation exactly once");
        check(fixture.rows.size() == 1 && "COMPARISON_FAILED".equals(fixture.rows.get(0).getAuditField()),
                "old-snapshot read failure cannot be mistaken for a new object");
        fixture.rows.clear();
        fixture.service.change(new Unreadable("before"), new Unreadable("after"));
        check(fixture.rows.size() == 1 && "COMPARISON_FAILED".equals(fixture.rows.get(0).getAuditField()),
                "serialization failure is explicit and does not abort the completed business call");
        check(fixture.rows.get(0).getBeforeJson() == null && fixture.rows.get(0).getAfterJson() == null
                && !fixture.rows.get(0).getAfterVal().contains("sensitive"), "failure row stores only the error type");
        fixture.rows.clear();
        UserContext.setTenantId(null);
        fixture.service.change("before", "after");
        check(fixture.rows.isEmpty(), "missing tenant never assigns changes to the default tenant");
        UserContext.setTenantId(91001L);
        UserContext.setUserName(null);
        fixture.service.change("before", "after");
        check(fixture.rows.isEmpty(), "missing operator never invents an audit identity");
        UserContext.setUserName("platform-audit-check");
        fixture.failPersistence = true;
        fixture.service.change("before", "after");
        check(AuditSnapshotContext.current() == null, "audit persistence failure preserves main-business policy and cleanup");
        fixture.failPersistence = false;
    }

    public record HrSnapshot(Long id, Map<String, Object> data, List<String> changedSensitiveFields) { }
    public record Unreadable(String state) { }

    public static class ProvidedService {
        private int businessCalls;

        @Audit(name = "old snapshot failed", spel = "#target.unreadableSnapshot()", diff = true)
        public int failedOldSnapshot() { return ++businessCalls; }

        public Object unreadableSnapshot() { throw new IllegalStateException("sensitive snapshot fixture detail"); }

        @Audit(name = "provided", providedSnapshots = true, diff = true)
        public void change(Object before, Object after) {
            AuditSnapshotContext.record(before, after);
        }

        @Audit(name = "outer", providedSnapshots = true, diff = true)
        public void outer(ProvidedService inner) {
            AuditSnapshotContext.record("outer-before", "outer-middle");
            inner.change("inner-before", "inner-after");
            check("outer-before".equals(AuditSnapshotContext.current().before()), "inner scope restores the outer snapshot");
            AuditSnapshotContext.record("outer-before", "outer-after");
        }

        @Audit(name = "failed", providedSnapshots = true, diff = true)
        public void failure() {
            AuditSnapshotContext.record("before", "after");
            throw new IllegalStateException("expected business failure");
        }
    }

    private static final class CountingJson extends ObjectMapper {
        private int treeConversions;

        @Override
        public <T extends JsonNode> T valueToTree(Object value) {
            treeConversions++;
            if (value instanceof Unreadable) throw new IllegalArgumentException("sensitive fixture detail");
            return super.valueToTree(value);
        }
    }

    private static final class Fixture {
        private final List<SysAuditLogEntity> rows = new ArrayList<>();
        private final CountingJson json = new CountingJson();
        private final ProvidedService service;
        private boolean failPersistence;

        private Fixture() {
            SysAuditLogMapper mapper = (SysAuditLogMapper) Proxy.newProxyInstance(SysAuditLogMapper.class.getClassLoader(),
                    new Class<?>[]{SysAuditLogMapper.class}, (proxy, method, values) -> {
                        if ("insert".equals(method.getName()) && values[0] instanceof SysAuditLogEntity row) {
                            if (failPersistence) throw new IllegalStateException("controlled persistence failure");
                            rows.add(row);
                            return 1;
                        }
                        throw new AssertionError("unexpected mapper operation: " + method.getName());
                    });
            DefaultAuditLogHandle handler = new DefaultAuditLogHandle(mapper, json, new AuditBizModuleResolver());
            AspectJProxyFactory factory = new AspectJProxyFactory(new ProvidedService());
            factory.setProxyTargetClass(true);
            factory.addAspect(new AuditAspect(new JaversCompareHandle(Optional.of(handler))));
            service = factory.getProxy();
        }

        private void changed(Object before, Object after) throws Exception {
            rows.clear();
            json.treeConversions = 0;
            service.change(before, after);
            check(!rows.isEmpty(), "provided change creates an audit row: " + (after == null ? "delete" : after.getClass().getSimpleName()));
            for (SysAuditLogEntity row : rows) {
                check(!"COMPARISON_FAILED".equals(row.getAuditField()), "supported snapshot must be comparable");
                JsonNode oldJson = json.readTree(row.getBeforeJson());
                JsonNode newJson = json.readTree(row.getAfterJson());
                check(JsonPatch.apply(json.readTree(row.getDiffJson()), oldJson).equals(newJson),
                        "saved JSON patch reconstructs the complete after snapshot");
                check(row.getTenantId().equals(91001L) && "platform-audit-check".equals(row.getCreateBy()),
                        "changes retain current tenant and operator");
            }
        }
    }

    private static void check(boolean condition, String label) {
        if (!condition) throw new AssertionError(label);
        checks++;
    }
}
