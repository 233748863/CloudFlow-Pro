package com.cloudflow.finance.checks;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PortalFinanceAttachment;
import com.cloudflow.common.core.domain.PortalFinanceState;
import com.cloudflow.common.core.domain.PortalFinanceVO;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.utils.PortalFinanceRules;
import com.cloudflow.common.security.core.TokenService;
import com.cloudflow.common.security.portal.PortalPaths;
import com.cloudflow.common.security.service.CurrentPermissionService;
import com.cloudflow.common.security.service.PortalFinanceActor;
import com.cloudflow.common.sensitive.config.SensitiveBeanSerializerModifier;
import com.cloudflow.crm.domain.CrmReceivable;
import com.cloudflow.oa.domain.OaInvoice;
import com.fasterxml.jackson.core.JacksonException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.module.SimpleModule;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicReference;

public final class PortalFinanceRulesChecks {
    private static final ObjectMapper JSON = new ObjectMapper().findAndRegisterModules();
    private static int assertions;

    public static void main(String[] arguments) throws Exception {
        changes(); ordinaryWrites(); serialization(); versions(); paths(); actors();
        System.out.println("PORTAL_FINANCE_RULE_CHECKS: passed=" + assertions
                + "; failed=0; actual_product_classes=true; token_store=controlled_fixture; database=false; http=false");
    }

    private static void changes() throws Exception {
        PortalFinanceRules.Change valid = PortalFinanceRules.change(JSON.readTree("{\"version\":0,\"publish\":true,\"fileIds\":[\"9223372036854775807\",\"1\"]}"));
        check(valid.fileIds().equals(List.of(1L, Long.MAX_VALUE)), "BIGINT file selection is exact and sorted");
        check(PortalFinanceRules.jsonFiles(valid.fileIds()).equals("[\"1\",\"9223372036854775807\"]"), "stored file identifiers use JSON strings");
        check(PortalFinanceRules.storedFiles(PortalFinanceRules.jsonFiles(valid.fileIds())).equals(valid.fileIds()), "stored file selection round trip");
        for (String version : List.of("-1", "1.0", "1e0", "2147483648", "\"1\"", "true", "null", "[]")) {
            JsonNode invalid = JSON.readTree("{\"version\":" + version + ",\"publish\":true,\"fileIds\":[]}");
            expect(400, () -> PortalFinanceRules.change(invalid));
        }
        for (String value : List.of("null", "{}", "true", "[null]", "[0]", "[-1]", "[1.0]", "[\"01\"]", "[\" 1\"]",
                "[\"9223372036854775808\"]", "[1,1]", "[1,\"1\"]", "[true]")) {
            JsonNode invalid = JSON.readTree("{\"version\":0,\"publish\":true,\"fileIds\":" + value + "}");
            expect(400, () -> PortalFinanceRules.change(invalid));
        }
        for (String body : List.of("{}", "null", "[]", "{\"version\":0,\"publish\":true}", "{\"version\":0,\"publish\":\"true\",\"fileIds\":[]}",
                "{\"version\":0,\"publish\":false,\"fileIds\":[1]}", "{\"version\":0,\"publish\":true,\"fileIds\":[],\"tenantId\":2}")) {
            JsonNode invalid = JSON.readTree(body); expect(400, () -> PortalFinanceRules.change(invalid));
        }
        check(PortalFinanceRules.change(JSON.readTree("{\"version\":0,\"publish\":false,\"fileIds\":[]}")).fileIds().isEmpty(), "explicit withdrawal carries no files");
    }

    private static void ordinaryWrites() throws Exception {
        for (Class<?> type : List.of(CrmReceivable.class, OaInvoice.class)) {
            check(JSON.readValue("{}", type) != null, "ordinary body remains valid");
            for (String field : List.of("portalPublicVersion", "portalPublishedBy", "portalPublishedTime", "portalFileIds",
                    "portal_public_version", "portal_published_by", "portal_published_time", "portal_file_ids")) {
                for (String value : List.of("null", "1", "[]", "\"forged\"")) {
                    boolean rejected = false;
                    try { JSON.readValue("{\"" + field + "\":" + value + "}", type); }
                    catch (JacksonException failure) { rejected = true; }
                    check(rejected, "ordinary JSON cannot inject publication fields even with null");
                }
            }
        }
    }

    private static void serialization() throws Exception {
        SimpleModule module = new SimpleModule(); module.setSerializerModifier(new SensitiveBeanSerializerModifier());
        ObjectMapper json = new ObjectMapper().findAndRegisterModules().registerModule(module);
        PortalFinanceAttachment file = new PortalFinanceAttachment(); file.setFileId(Long.MAX_VALUE); file.setFileName("allowed.pdf"); file.setFileSize(10L); file.setExtension("pdf");
        PortalFinanceVO invoice = new PortalFinanceVO(); invoice.setRecordId(Long.toString(Long.MAX_VALUE)); invoice.setKind("INVOICE");
        invoice.setNumber("invoice"); invoice.setGrossAmount("9999999999999999.99"); invoice.setTaxAmount("0.01"); invoice.setAttachments(List.of(file));
        JsonNode encoded = json.valueToTree(invoice);
        check(encoded.get("grossAmount").isTextual() && encoded.get("grossAmount").textValue().equals("9999999999999999.99"), "DECIMAL 18,2 exact with production sensitive serializer");
        check(encoded.path("attachments").get(0).path("fileId").isTextual(), "file id is not a browser floating point number");
        check(encoded.path("attachments").get(0).path("fileId").textValue().equals(Long.toString(Long.MAX_VALUE)), "file id retains all digits");
        Set<String> forbidden = Set.of("tenantId", "customerId", "customerName", "publishedBy", "publishedTime", "filePath", "url", "ownerId", "remark", "contractId");
        for (String field : forbidden) check(!encoded.has(field), "customer projection excludes internal fields");
        PortalFinanceVO restored = json.readValue(json.writeValueAsString(invoice), PortalFinanceVO.class);
        check(restored.getAttachments().get(0).getFileId().equals(Long.MAX_VALUE), "Feign-like round trip preserves file id");
        check(json.valueToTree(restored).path("attachments").get(0).path("fileId").isTextual(), "second serialization still uses string id");
        invoice.setKind("RECEIVABLE"); invoice.setPlannedAmount("99999999999999.99");
        check(json.valueToTree(invoice).path("plannedAmount").textValue().equals("99999999999999.99"), "DECIMAL 16,2 exact");
    }

    private static void versions() {
        PortalFinanceState state = new PortalFinanceState(); state.setVersion(4);
        check(!PortalFinanceRules.published(state), "default private");
        state.setPublicVersion(4); state.setPublishedBy(1L); state.setPublishedTime(LocalDateTime.now()); state.setFileIdsJson("[\"1\"]");
        check(PortalFinanceRules.published(state), "complete current publication readable");
        check(PortalFinanceRules.unchanged(state, new PortalFinanceRules.Change(3, true, List.of(1L))), "lost-response identical retry has no write");
        check(!PortalFinanceRules.unchanged(state, new PortalFinanceRules.Change(2, true, List.of(1L))), "older version is not idempotent");
        check(!PortalFinanceRules.unchanged(state, new PortalFinanceRules.Change(3, true, List.of(2L))), "different file selection is not idempotent");
        expect(409, () -> PortalFinanceRules.version(state, new PortalFinanceRules.Change(3, true, List.of())));
        state.setVersion(5);
        check(!PortalFinanceRules.published(state), "ordinary version change hides published record");
        check(!PortalFinanceRules.unchanged(state, new PortalFinanceRules.Change(4, true, List.of(1L))), "stale publication requires new confirmation");
        state.setVersion(Integer.MAX_VALUE);
        expect(409, () -> PortalFinanceRules.version(state, new PortalFinanceRules.Change(Integer.MAX_VALUE, false, List.of())));
    }

    private static void paths() {
        for (String resource : List.of("receivable", "invoice")) {
            for (String id : List.of("list", "1", "9223372036854775807")) {
                String path = "/portal/crm/" + resource + "/" + id;
                check(PortalPaths.supported("GET", path) && !PortalPaths.publicEndpoint("GET", path), "customer finance read requires portal login");
                for (String method : List.of("POST", "PUT", "DELETE", "HEAD")) check(!PortalPaths.supported(method, path), "no write method alias");
            }
            for (String id : List.of("0", "01", "-1", "1.0", "1;other", "1/files", "12345678901234567890"))
                check(!PortalPaths.supported("GET", "/portal/crm/" + resource + "/" + id), "malformed identifiers rejected before controller");
        }
        for (String action : List.of("access", "content")) {
            String path = "/portal/crm/finance/file/" + action;
            check(PortalPaths.fileEndpoint("POST", path) && PortalPaths.supported("POST", path), "finance file shares portal file rate limit");
            check(!PortalPaths.supported("GET", path) && !PortalPaths.publicEndpoint("POST", path), "file credentials never accepted in public GET");
        }
    }

    private static void actors() {
        Map<String, Object> identity = new HashMap<>(); identity.put("userId", 7L); identity.put("tenantId", 100000L); identity.put("username", "finance");
        AtomicReference<Map<String, Object>> session = new AtomicReference<>(identity);
        AtomicReference<Set<String>> granted = new AtomicReference<>(Set.of("crm:portal-finance:manage"));
        TokenService tokens = new TokenService() {
            @Override public Map<String, Object> verifyToken(String token) { return "valid-fixture-token".equals(token) ? session.get() : null; }
        };
        CurrentPermissionService permissions = new CurrentPermissionService(null) {
            @Override public Set<String> permissions(Map<String, Object> user) { return granted.get(); }
        };
        PortalFinanceActor actor = new PortalFinanceActor(tokens, permissions);
        try {
            UserContext.clear(); UserContext.setUserId(1L); UserContext.setTenantId(100000L); UserContext.setUserName("admin");
            UserContext.setPermissions(Set.of("*:*:*")); expect(401, actor::require);
            UserContext.setAuthToken("valid-fixture-token"); expect(401, actor::require);
            UserContext.setUserId(7L); UserContext.setUserName("finance"); actor.require(); check(true, "live matching finance actor accepted");
            UserContext.setTenantId(100001L); expect(401, actor::require); UserContext.setTenantId(100000L);
            UserContext.setUserName("other"); expect(401, actor::require); UserContext.setUserName("finance");
            granted.set(Set.of("crm:receivable:edit")); expect(403, actor::require);
            granted.set(Set.of("*:*:*")); actor.require(); check(true, "live administrator permission accepted");
            session.set(null); expect(401, actor::require);
        } finally { UserContext.clear(); }
    }

    private static void expect(int code, Runnable action) {
        try { action.run(); } catch (ServiceException failure) { check(Integer.valueOf(code).equals(failure.getCode()), "expected rejection code"); return; }
        throw new AssertionError("Expected rejection " + code);
    }
    private static void check(boolean condition, String label) { if (!condition) throw new AssertionError(label); assertions++; }
}
