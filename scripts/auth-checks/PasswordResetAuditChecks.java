package com.cloudflow.auth.checks;

import com.cloudflow.auth.domain.vo.PasswordResetAuditSnapshot;
import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.auth.service.impl.SysUserServiceImpl;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.audit.domain.SysAuditLogEntity;
import com.cloudflow.common.audit.handle.DefaultAuditLogHandle;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import com.cloudflow.common.audit.support.AuditBizModuleResolver;
import com.cloudflow.common.audit.support.DataAuditor;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.sensitive.config.SensitiveBeanSerializerModifier;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.module.SimpleModule;
import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** Component checks only: production serialization/diff/handler, controlled persistence. */
public final class PasswordResetAuditChecks {
    private static int checks;

    public static void main(String[] args) throws Exception {
        SimpleModule module = new SimpleModule("production-sensitive-module");
        module.setSerializerModifier(new SensitiveBeanSerializerModifier());
        ObjectMapper json = new ObjectMapper().registerModule(module);
        SysUser incoming = json.readValue("{\"userName\":\"credential-check\",\"password\":\"LocalCheck!47\"}", SysUser.class);
        check("LocalCheck!47".equals(incoming.getPassword()), "user input accepts an explicitly supplied password");
        check(!json.readTree(json.writeValueAsString(incoming)).has("password"),
                "user output never exposes a password or its stored hash");
        List<SysAuditLogEntity> saved = new ArrayList<>();
        SysAuditLogMapper mapper = (SysAuditLogMapper) Proxy.newProxyInstance(
                SysAuditLogMapper.class.getClassLoader(), new Class<?>[]{SysAuditLogMapper.class},
                (Object proxy, java.lang.reflect.Method method, Object[] arguments) -> {
                    if ("insert".equals(method.getName()) && arguments.length == 1
                            && arguments[0] instanceof SysAuditLogEntity row) {
                        saved.add(row);
                        return 1;
                    }
                    throw new UnsupportedOperationException(method.getName());
                });
        DefaultAuditLogHandle handler = new DefaultAuditLogHandle(mapper, json, new AuditBizModuleResolver());
        Audit audit = SysUserServiceImpl.class.getMethod("resetPwd", Long.class, String.class)
                .getAnnotation(Audit.class);
        check(audit.highRisk() && audit.diff()
                && "#target.selectCredentialAuditSnapshot(#p0)".equals(audit.spel()),
                "real reset method uses the safe high-risk snapshot");
        PasswordResetAuditSnapshot before = new PasswordResetAuditSnapshot(702L, 100000L, false, null);
        PasswordResetAuditSnapshot first = new PasswordResetAuditSnapshot(702L, 100000L, true, "event-first");
        PasswordResetAuditSnapshot second = new PasswordResetAuditSnapshot(702L, 100000L, true, "event-second");
        try {
            UserContext.setUserId(701L);
            UserContext.setUserName("audit-basic-admin");
            UserContext.setTenantId(100000L);
            handler.handle(audit, DataAuditor.compare(before, first), before, first, SysUserServiceImpl.class);
            check(saved.size() == 2, "first reset emits exactly state and event changes");
            check(fields(saved).equals(Set.of("forceChangeRequired", "resetEventId")),
                    "first reset audits only the two changed safe fields");
            for (SysAuditLogEntity row : saved) {
                JsonNode oldJson = json.readTree(row.getBeforeJson());
                JsonNode newJson = json.readTree(row.getAfterJson());
                check(names(oldJson).equals(Set.of("userId", "tenantId", "forceChangeRequired", "resetEventId"))
                                && names(newJson).equals(names(oldJson)), "snapshots contain exactly four safe fields");
                check(oldJson.path("forceChangeRequired").isBoolean()
                                && !oldJson.path("forceChangeRequired").booleanValue()
                                && newJson.path("forceChangeRequired").isBoolean()
                                && newJson.path("forceChangeRequired").booleanValue(),
                        "sensitive serializer preserves false-to-true state");
                check(paths(json.readTree(row.getDiffJson())).equals(Set.of("/forceChangeRequired", "/resetEventId")),
                        "JSON diff retains both real changes");
                check("audit-basic-admin".equals(row.getCreateBy()) && Long.valueOf(100000L).equals(row.getTenantId())
                                && Integer.valueOf(1).equals(row.getHighRisk()) && "HIGH".equals(row.getRiskLevel())
                                && "auth".equals(row.getBizModule()), "operator, tenant and risk metadata are preserved");
            }
            SysAuditLogEntity state = saved.stream().filter(row -> "forceChangeRequired".equals(row.getAuditField()))
                    .findFirst().orElseThrow();
            check("false".equals(state.getBeforeVal()) && "true".equals(state.getAfterVal()),
                    "field audit agrees with serialized boolean state");
            saved.clear();
            handler.handle(audit, DataAuditor.compare(first, second), first, second, SysUserServiceImpl.class);
            check(saved.size() == 1 && "resetEventId".equals(saved.get(0).getAuditField())
                            && "event-first".equals(saved.get(0).getBeforeVal())
                            && "event-second".equals(saved.get(0).getAfterVal())
                            && paths(json.readTree(saved.get(0).getDiffJson())).equals(Set.of("/resetEventId")),
                    "continuous reset has its own event audit without inventing a state change");
            saved.clear();
            handler.handle(audit, DataAuditor.compare(second, second), second, second, SysUserServiceImpl.class);
            check(saved.isEmpty(), "unchanged snapshots do not invent success audits");
            UserContext.clear();
            handler.handle(audit, DataAuditor.compare(before, first), before, first, SysUserServiceImpl.class);
            check(saved.isEmpty(), "missing operator does not invent operator attribution");
            JsonNode masked = json.readTree(json.writeValueAsString(new CredentialControl("protected-test-value")));
            check("******".equals(masked.path("password").asText()), "ordinary password masking remains active");
        } finally {
            UserContext.clear();
        }
        System.out.println("PASSWORD_RESET_AUDIT_BASIC_CHECKS: passed=" + checks
                + "; scope=production-components; database=false; http=false");
    }

    public record CredentialControl(String password) {}

    private static Set<String> fields(List<SysAuditLogEntity> rows) {
        Set<String> result = new HashSet<>();
        for (SysAuditLogEntity row : rows) result.add(row.getAuditField());
        return result;
    }

    private static Set<String> names(JsonNode node) {
        Set<String> result = new HashSet<>();
        node.fieldNames().forEachRemaining(result::add);
        return result;
    }

    private static Set<String> paths(JsonNode patch) {
        Set<String> result = new HashSet<>();
        for (JsonNode operation : patch) result.add(operation.path("path").asText());
        return result;
    }

    private static void check(boolean condition, String label) {
        if (!condition) throw new AssertionError(label);
        checks++;
    }
}
