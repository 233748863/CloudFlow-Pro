import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.audit.domain.SysAuditLogEntity;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.workflow.domain.WfFormDefinition;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.mapper.WfFormDefinitionMapper;
import com.cloudflow.workflow.security.WorkflowSecurityUtils;
import com.cloudflow.workflow.service.IWorkflowCacheService;
import com.cloudflow.workflow.service.WorkflowConfigurationLockService;
import com.cloudflow.workflow.service.WorkflowDraftJson;
import com.cloudflow.workflow.service.WorkflowFormVersionDiff;
import com.cloudflow.workflow.service.WorkflowFormVersionService;
import com.cloudflow.workflow.service.WorkflowPermissionService;
import com.cloudflow.workflow.validator.JsonSchemaValidator;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.lang.reflect.Method;
import org.springframework.transaction.annotation.Transactional;

import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;

public final class FormVersionChecks {
    private static final ObjectMapper JSON = new ObjectMapper().findAndRegisterModules();
    private static final WorkflowDraftJson DRAFT_JSON = new WorkflowDraftJson(JSON);
    private static final WorkflowFormVersionDiff DIFF = new WorkflowFormVersionDiff(DRAFT_JSON, new JsonSchemaValidator());
    private static final String ORIGINAL = """
            [{"id":"name","type":"TEXT","label":"Name"},{"id":"age","type":"NUMBER","label":"Age","min":1}]
            """;
    private static int checks;

    public static void main(String[] arguments) throws Exception {
        UserContext.setTenantId(100000L); UserContext.setUserId(1L); UserContext.setUserName("form-admin");
        try {
            differences(); writes(); security(); cleanup();
            for (String name : List.of("save", "rollback", "cleanupForm")) {
                Method method = java.util.Arrays.stream(WorkflowFormVersionService.class.getMethods()).filter(candidate -> candidate.getName().equals(name)).findFirst().orElseThrow();
                require(method.isAnnotationPresent(Transactional.class), name + " is transactional");
                require(List.of(method.getAnnotation(Transactional.class).rollbackFor()).contains(Exception.class), name + " rolls back audit or write failure");
            }
            System.out.println("Batch C form version checks passed: " + checks + "; real version/diff service; mapper test doubles; database writes=0");
        } finally { UserContext.clear(); }
    }

    private static void differences() {
        String reordered = """
                [{"label":"Name","type":"TEXT","id":"name","_rowId":"runtime"},{"min":1.0,"label":"Age","id":"age","type":"NUMBER"}]
                """;
        equal(DIFF.checksum(ORIGINAL), DIFF.checksum(reordered), "property order, decimal representation and runtime row ID do not create versions");
        reject(() -> DIFF.checksum("{\"fields\":" + ORIGINAL + "}"), null, "stored field schema requires an array");
        equal("UNCHANGED", DIFF.compare(ORIGINAL, reordered, 1, 2).changeType(), "normalized structures have no differences");
        String added = ORIGINAL.trim().replaceFirst("\\]$", ",{\"id\":\"extra\",\"type\":\"TEXT\",\"label\":\"Extra\"}]");
        equal("ADD_FIELD", DIFF.compare(ORIGINAL, added, 1, 2).changeType(), "appended field is addition only");
        String removed = "[{\"id\":\"age\",\"type\":\"NUMBER\",\"label\":\"Age\",\"min\":1}]";
        equal("REMOVE_FIELD", DIFF.compare(ORIGINAL, removed, 1, 2).changeType(), "deleting first sibling is not a layout movement");
        String reversed = "[" + DRAFT_JSON.tree(ORIGINAL).get(1) + "," + DRAFT_JSON.tree(ORIGINAL).get(0) + "]";
        equal("LAYOUT_CHANGE", DIFF.compare(ORIGINAL, reversed, 1, 2).changeType(), "relative sibling movement is layout change");
        require(!DIFF.checksum(ORIGINAL).equals(DIFF.checksum(reversed)), "array order remains meaningful");
        WorkflowFormVersionDiff.Difference modified = DIFF.compare(ORIGINAL, ORIGINAL.replace("\"TEXT\"", "\"TEXTAREA\""), 1, 2);
        equal("MODIFY_FIELD", modified.changeType(), "type modification is explicit");
        equal("TEXT", modified.modified().get(0).properties().get("type").before().asText(), "difference retains old attribute");
        equal("TEXTAREA", modified.modified().get(0).properties().get("type").after().asText(), "difference retains new attribute");
        String table = "[{\"id\":\"items\",\"type\":\"SUB_TABLE\",\"label\":\"Items\",\"columns\":[{\"id\":\"cost\",\"type\":\"AMOUNT\",\"label\":\"Cost\"}]}]";
        WorkflowFormVersionDiff.Difference columns = DIFF.compare(table, table.replace("\"Cost\"", "\"Total cost\""), 3, 4);
        equal("items.cost", columns.modified().get(0).fieldId(), "subtable columns carry qualified identifiers");
        equal(1, columns.modified().size(), "column change does not duplicate the parent table");
        String grouped = "[{\"id\":\"group\",\"type\":\"GROUP\",\"label\":\"Group\",\"children\":" + ORIGINAL + "}]";
        equal("LAYOUT_CHANGE", DIFF.compare(ORIGINAL, grouped, 1, 2).changeType(), "container insertion and child movement are layout changes");
        equal("MIXED", DIFF.compare(ORIGINAL, added.replace("\"Name\"", "\"Full name\""), 1, 2).changeType(), "multiple change categories are retained");
    }

    private static void writes() {
        Fixture fixture = new Fixture();
        WfFormDefinition first = fixture.service.save(request("form-one", null, ORIGINAL));
        equal(1, first.getVersion(), "initial content version"); equal(0, first.getVersionLock(), "initial optimistic lock");
        equal("form-one", first.getFormId(), "business ID remains separate from physical row ID");
        require(first.getId() != null, "new version has physical ID"); equal(1, fixture.audits.size(), "version audit is written");
        require(!fixture.audits.get(0).getAfterJson().contains("Name"), "version audit contains metadata rather than field content");
        WfFormDefinition unchanged = fixture.service.save(request("form-one", 0, "  " + ORIGINAL + "  "));
        equal(1, unchanged.getVersion(), "same structure retains version"); equal(1, unchanged.getVersionLock(), "same structure advances lock");
        equal(1, fixture.rows.size(), "same structure does not insert history"); equal(1, fixture.audits.size(), "same content does not create a version audit");
        reject(() -> fixture.service.save(request("form-one", 0, ORIGINAL)), "FORM_VERSION_CONFLICT", "stale writer rejected");
        reject(() -> fixture.service.save(request("form-one", null, ORIGINAL)), "FORM_VERSION_CONFLICT", "existing form requires version lock");
        WfFormDefinition changed = fixture.service.save(request("form-one", 1, ORIGINAL.replace("\"TEXT\"", "\"TEXTAREA\"")));
        equal(2, changed.getVersion(), "content change creates new version"); equal(2, changed.getVersionLock(), "new version advances lock once");
        equal(2, fixture.rows.size(), "previous row retained"); equal(0, fixture.rows.get(0).getIsLatest(), "previous version loses latest flag");
        equal("TEXT", DRAFT_JSON.tree(fixture.service.version("business-key", 1).getFieldsJson()).get(0).path("type").asText(), "old version preserves field type");
        equal("MODIFY_FIELD", fixture.service.compare("business-key", 1, 2).changeType(), "comparison resolves business key");
        equal(2L, fixture.service.versions("form-one", new PageQuery()).getTotal(), "version list includes both rows");
        WfFormDefinition rollback = fixture.service.rollback("business-key", 1, 2, "Rollback original");
        equal(3, rollback.getVersion(), "rollback creates next version"); equal(1, rollback.getIsRollback(), "rollback marker");
        equal(1, rollback.getRollbackFromVersion(), "rollback origin retained"); equal(first.getChecksum(), rollback.getChecksum(), "rollback restores exact structure");
        equal(3, fixture.rows.size(), "rollback keeps intermediate rows");
        reject(() -> fixture.service.rollback("form-one", 1, 2, "stale"), "FORM_VERSION_CONFLICT", "stale rollback rejected");
        WfFormDefinition repeated = fixture.service.rollback("form-one", 1, 3, null);
        equal(4, repeated.getVersion(), "explicit rollback still creates a new version with same content");
        fixture.writeFails = true;
        reject(() -> fixture.service.save(request("form-one", 4, ORIGINAL)), "FORM_VERSION_CONFLICT", "zero row metadata update rejected");
        WfFormDefinition newRequest = request("new-form", null, ORIGINAL); newRequest.setFormKey("new-key");
        reject(() -> fixture.service.save(newRequest), "FORM_VERSION_CONFLICT", "zero row insert rejected");
        fixture.writeFails = false; fixture.auditFails = true;
        reject(() -> fixture.service.save(request("form-one", 4, ORIGINAL.replace("\"Name\"", "\"Renamed\""))), null, "audit failure cannot report success");
        require(fixture.evictions >= 5, "successful saves invalidate form cache");
    }

    private static void security() {
        Fixture fixture = new Fixture(); fixture.service.save(request("protected-form", null, ORIGINAL));
        fixture.admin = false;
        reject(() -> fixture.service.save(request("protected-form", 0, ORIGINAL)), "PERMISSION_DENIED", "employee cannot save form version");
        reject(() -> fixture.service.version("protected-form", 1), "PERMISSION_DENIED", "employee cannot enumerate form history");
        reject(() -> fixture.service.rollback("protected-form", 1, 0, null), "PERMISSION_DENIED", "employee cannot rollback form history");
        fixture.admin = true;
        WfFormDefinition foreign = request("protected-form", 0, ORIGINAL); foreign.setTenantId(200000L);
        reject(() -> fixture.service.save(foreign), "PERMISSION_DENIED", "foreign tenant write blocked");
        UserContext.setTenantId(200000L);
        reject(() -> fixture.service.version("protected-form", 1), null, "foreign tenant history absent");
        UserContext.setTenantId(100000L);
        WfFormDefinition keyChange = request("protected-form", 0, ORIGINAL); keyChange.setFormKey("other-key");
        reject(() -> fixture.service.save(keyChange), null, "business key immutable across versions");
        WfFormDefinition invalid = request("protected-form", 0, ORIGINAL); invalid.setFormName("x".repeat(65));
        reject(() -> fixture.service.save(invalid), null, "form name bound matches DDL");
        invalid.setFormName("valid"); invalid.setChangeLog("x".repeat(501));
        reject(() -> fixture.service.save(invalid), null, "change log bounded");
        reject(() -> fixture.service.version("protected-form", 0), null, "nonpositive history version rejected");
        reject(() -> fixture.service.version("protected-form", 99), null, "missing version does not silently use latest");
        reject(() -> fixture.service.save(request("other-form", null, ORIGINAL)), null, "another form cannot reuse an existing business key");
    }

    private static void cleanup() {
        Fixture fixture = new Fixture();
        for (int version = 1; version <= 25; version++) {
            WfFormDefinition form = request("cleanup-form", version - 1, ORIGINAL); form.setId((long) version); form.setVersion(version); form.setIsLatest(version == 25 ? 1 : 0); form.setTenantId(100000L); fixture.rows.add(form);
        }
        fixture.referenced.add(1); fixture.referenced.add(3);
        equal(List.of("cleanup-form"), fixture.service.cleanupFormIds(), "cleanup is tenant scoped");
        equal(3, fixture.service.cleanupForm("cleanup-form"), "only old unreferenced versions removed");
        require(fixture.rows.stream().anyMatch(row -> row.getVersion() == 1) && fixture.rows.stream().anyMatch(row -> row.getVersion() == 3), "referenced versions retained");
        equal(20L, fixture.rows.stream().filter(row -> row.getVersion() >= 6).count(), "all recent twenty versions retained");
        equal(0, fixture.service.cleanupForm("missing"), "absent forms are safe to clean");
    }

    private static WfFormDefinition request(String formId, Integer lock, String schema) {
        WfFormDefinition form = new WfFormDefinition(); form.setFormId(formId); form.setFormKey("business-key"); form.setFormName("Expense form"); form.setVersionLock(lock); form.setFieldsJson(schema); return form;
    }
    private static WfFormDefinition copy(WfFormDefinition form) { return form == null ? null : JSON.convertValue(form, WfFormDefinition.class); }

    private static final class Fixture {
        final List<WfFormDefinition> rows = new ArrayList<>(); final List<SysAuditLogEntity> audits = new ArrayList<>(); final Set<Integer> referenced = new HashSet<>();
        boolean admin = true; boolean writeFails; boolean auditFails; int evictions;
        final WfFormDefinitionMapper mapper = proxy(WfFormDefinitionMapper.class, (target, method, values) -> {
            String name = method.getName();
            if (name.equals("insert")) {
                if (writeFails) return 0;
                WfFormDefinition row = (WfFormDefinition) values[0]; row.setId((long) rows.size() + 1); rows.add(copy(row)); return 1;
            }
            Long tenant = (Long) values[0];
            if (name.equals("selectVersions")) throw new AssertionError("pagination handled separately");
            if (name.equals("resolveIdentifier")) return rows.stream().filter(row -> tenant.equals(row.getTenantId()) && row.getIsLatest() == 1 && (values[1].equals(row.getFormId()) || values[1].equals(row.getFormKey()))).map(FormVersionChecks::copy).toList();
            if (name.equals("selectLatest") || name.equals("lockLatest")) return latest(tenant, (String) values[1]);
            if (name.equals("selectVersion")) return rows.stream().filter(row -> tenant.equals(row.getTenantId()) && values[1].equals(row.getFormId()) && values[2].equals(row.getVersion())).findFirst().map(FormVersionChecks::copy).orElse(null);
            if (name.equals("latestFormIds")) return rows.stream().filter(row -> tenant.equals(row.getTenantId()) && row.getIsLatest() == 1).map(WfFormDefinition::getFormId).toList();
            if (name.equals("cleanupCandidates")) return rows.stream().filter(row -> tenant.equals(row.getTenantId()) && values[1].equals(row.getFormId()) && row.getIsLatest() == 0 && row.getVersion() < (Integer) values[2] && !referenced.contains(row.getVersion())).map(FormVersionChecks::copy).toList();
            if (name.equals("deleteUnusedVersion")) return rows.removeIf(row -> tenant.equals(row.getTenantId()) && values[1].equals(row.getId()) && row.getIsLatest() == 0 && !referenced.contains(row.getVersion())) ? 1 : 0;
            if (name.equals("updateVersionLockOnly") || name.equals("markNotLatest")) {
                if (writeFails) return 0;
                WfFormDefinition row = rows.stream().filter(candidate -> tenant.equals(candidate.getTenantId()) && values[1].equals(candidate.getId()) && values[2].equals(candidate.getVersionLock()) && candidate.getIsLatest() == 1).findFirst().orElse(null);
                if (row == null) return 0;
                if (name.equals("markNotLatest")) row.setIsLatest(0);
                else { row.setVersionLock(row.getVersionLock() + 1); row.setFormName((String) values[3]); row.setFormKey((String) values[4]); row.setChecksum((String) values[5]); }
                return 1;
            }
            throw new AssertionError(name);
        });
        final WorkflowFormVersionService service = new WorkflowFormVersionService(
                proxy(WfFormDefinitionMapper.class, (target, method, values) -> {
                    if (method.getName().equals("selectVersions")) {
                        @SuppressWarnings("unchecked") Page<WfFormDefinition> page = (Page<WfFormDefinition>) values[0];
                        List<WfFormDefinition> found = rows.stream().filter(row -> values[1].equals(row.getTenantId()) && values[2].equals(row.getFormId())).sorted(java.util.Comparator.comparing(WfFormDefinition::getVersion).reversed()).map(FormVersionChecks::copy).toList();
                        page.setRecords(found); page.setTotal(found.size()); return page;
                    }
                    return java.lang.reflect.Proxy.getInvocationHandler(mapper).invoke(mapper, method, values);
                }), new WorkflowConfigurationLockService(null) { @Override public WfFormDefinition lockForm(String formId) { return latest(UserContext.getTenantId(), formId); } },
                new WorkflowPermissionService() { @Override public void checkDefinitionPermission(String operation) { if (!admin) throw WorkflowException.permissionDenied(operation); } },
                new JsonSchemaValidator(), DIFF, new WorkflowSecurityUtils(), DRAFT_JSON,
                proxy(SysAuditLogMapper.class, (target, method, values) -> { if (!method.getName().equals("insert")) throw new AssertionError(method.getName()); if (auditFails) return 0; audits.add((SysAuditLogEntity) values[0]); return 1; }),
                proxy(IWorkflowCacheService.class, (target, method, values) -> { if (!method.getName().equals("evictForm")) throw new AssertionError(method.getName()); evictions++; return null; }));
        WfFormDefinition latest(Long tenant, String formId) { return rows.stream().filter(row -> tenant.equals(row.getTenantId()) && formId.equals(row.getFormId()) && row.getIsLatest() == 1).findFirst().map(FormVersionChecks::copy).orElse(null); }
    }

    private static <Type> Type proxy(Class<Type> type, InvocationHandler handler) { return type.cast(Proxy.newProxyInstance(type.getClassLoader(), new Class<?>[]{type}, handler)); }
    private static void require(boolean condition, String message) { checks++; if (!condition) throw new AssertionError(message); }
    private static void equal(Object expected, Object actual, String message) { require(Objects.equals(expected, actual), message + ": expected=" + expected + " actual=" + actual); }
    private static void reject(Runnable action, String code, String message) {
        try { action.run(); throw new AssertionError(message); }
        catch (WorkflowException failure) { require(code == null || code.equals(failure.getCode()), message + ": " + failure.getCode()); }
    }
}
