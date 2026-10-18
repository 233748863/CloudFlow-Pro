import cn.dev33.satoken.annotation.SaCheckPermission;
import cn.dev33.satoken.annotation.SaMode;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.cloudflow.common.audit.domain.SysAuditLogEntity;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.redis.core.SysConfigHelper;
import com.cloudflow.common.security.annotation.Inner;
import com.cloudflow.workflow.config.CacheConfig;
import com.cloudflow.workflow.controller.WorkflowController;
import com.cloudflow.workflow.controller.WorkflowFormFileController;
import com.cloudflow.workflow.controller.WorkflowTaskReferenceController;
import com.cloudflow.workflow.service.WorkflowTaskReferenceService;
import com.cloudflow.workflow.domain.vo.WorkflowFormReferenceVO;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.workflow.domain.WfFormDefinition;
import com.cloudflow.workflow.domain.WfFormFieldPermission;
import com.cloudflow.workflow.domain.WfProcessCopy;
import com.cloudflow.workflow.domain.WfProcessDefinition;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.domain.WfTaskHistory;
import com.cloudflow.workflow.domain.vo.FieldPermissionVO;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.exception.PermissionDeniedException;
import com.cloudflow.workflow.exception.WorkflowFormValidationException;
import com.cloudflow.workflow.mapper.WfFormDefinitionMapper;
import com.cloudflow.workflow.mapper.WfFormFieldPermissionMapper;
import com.cloudflow.workflow.mapper.WfProcessCopyMapper;
import com.cloudflow.workflow.mapper.WfProcessDefinitionMapper;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.cloudflow.workflow.mapper.WfTaskHistoryMapper;
import com.cloudflow.workflow.mapper.WfTaskMapper;
import com.cloudflow.workflow.mapper.WorkflowFormFileMapper;
import com.cloudflow.workflow.mapper.WorkflowFormReferenceMapper;
import com.cloudflow.workflow.model.WorkflowGraphModelResolver;
import com.cloudflow.workflow.security.WorkflowFormResponseAdvice;
import com.cloudflow.workflow.service.FormDataPermissionFilter;
import com.cloudflow.workflow.service.WorkflowDraftJson;
import com.cloudflow.workflow.service.WorkflowFieldPermissionCache;
import com.cloudflow.workflow.service.WorkflowFormAccessService;
import com.cloudflow.workflow.service.WorkflowFormFileService;
import com.cloudflow.workflow.service.WorkflowFormInputService;
import com.cloudflow.workflow.service.WorkflowImSummaryService;
import com.cloudflow.workflow.service.WorkflowImSummaryPolicy;
import com.cloudflow.workflow.service.WorkflowAgentService;
import com.cloudflow.workflow.service.WorkflowFormSecurityAudit;
import com.cloudflow.workflow.service.WorkflowPermissionService;
import com.cloudflow.workflow.service.remote.RemoteWorkflowFormFileService;
import com.cloudflow.workflow.validator.JsonSchemaValidator;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.lang.reflect.Field;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.springframework.cache.concurrent.ConcurrentMapCache;
import org.springframework.cache.transaction.TransactionAwareCacheDecorator;
import org.springframework.core.MethodParameter;
import org.springframework.data.redis.cache.RedisCache;
import org.springframework.data.redis.cache.RedisCacheManager;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.serializer.RedisSerializationContext;
import org.springframework.http.MediaType;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

public final class FormResponseChecks {
    private static final ObjectMapper JSON = new ObjectMapper().findAndRegisterModules();
    private static final WorkflowDraftJson DRAFT_JSON = new WorkflowDraftJson(JSON);
    private static final List<WfTask> TASKS = new ArrayList<>();
    private static final List<WfTaskHistory> HISTORY = new ArrayList<>();
    private static final List<WfProcessCopy> COPIES = new ArrayList<>();
    private static final List<WfFormFieldPermission> PERMISSIONS = new ArrayList<>();
    private static final List<SysAuditLogEntity> AUDITS = new ArrayList<>();
    private static final WfProcessDefinition DEFINITION = new WfProcessDefinition();
    private static final WfFormDefinition FORM = new WfFormDefinition();
    private static WfFormDefinition newerForm;
    private static final WfProcessInstance INSTANCE = new WfProcessInstance();
    private static boolean designer;
    private static boolean canView = true;
    private static boolean canStart = true;
    private static boolean auditAvailable = true;
    private static int viewChecks;
    private static int checks;
    private static WorkflowFormAccessService access;
    private static WorkflowFormResponseAdvice advice;
    private static WorkflowFieldPermissionCache permissionCache;

    public static void main(String[] arguments) throws Exception {
        UserContext.setTenantId(100000L);
        UserContext.setUserId(5L);
        UserContext.setUserName("permission-reader");
        try {
            endpointGuards();
            initialize();
            imSummary();
            responseShapes();
            historicalVersions();
            readers();
            approvalAudit();
            files();
            cacheRoundtrip();
            taskReferences();
            System.out.println("Batch C form response integration checks passed: " + checks
                    + "; real response advice/access/filter/audit/cache configuration; mapper test doubles; database writes=0");
        } finally { UserContext.clear(); }
    }

    private static void endpointGuards() throws Exception {
        Set<String> readers = Set.of("workflow:form:view", "workflow:process:start", "workflow:process:view");
        SaCheckPermission form = WorkflowController.class.getMethod("getFormDefinition", String.class, String.class, String.class, String.class).getAnnotation(SaCheckPermission.class);
        equal(Set.of(form.value()), readers);
        equal(form.mode(), SaMode.OR);
        SaCheckPermission metadata = WorkflowFormFileController.class.getMethod("metadata", Long.class, String.class, String.class, String.class, String.class).getAnnotation(SaCheckPermission.class);
        equal(Set.of(metadata.value()), readers);
        equal(metadata.mode(), SaMode.OR);
        SaCheckPermission content = WorkflowFormFileController.class.getMethod("content", Long.class, String.class, String.class, String.class, String.class, jakarta.servlet.http.HttpServletResponse.class).getAnnotation(SaCheckPermission.class);
        equal(Set.of(content.value()), readers);
        equal(content.mode(), SaMode.OR);
        SaCheckPermission upload = WorkflowFormFileController.class.getMethod("upload", org.springframework.web.multipart.MultipartFile.class, String.class, String.class, String.class, String.class).getAnnotation(SaCheckPermission.class);
        equal(Set.of(upload.value()), Set.of("workflow:process:start", "workflow:task:complete"));
        equal(upload.mode(), SaMode.OR);
        SaCheckPermission task = WorkflowController.class.getMethod("getTodoTask", String.class).getAnnotation(SaCheckPermission.class);
        equal(Set.of(task.value()), Set.of("workflow:task:todo", "workflow:process:view"));
        equal(task.mode(), SaMode.AND);
    }

    private static void imSummary() {
        String original = FORM.getFieldsJson();
        WorkflowImSummaryService summaries = new WorkflowImSummaryService(
                proxy(WfTaskMapper.class, (target, method, arguments) -> TASKS.stream().filter(task -> Objects.equals(task.getTaskId(), arguments[0])).findFirst().orElse(null)),
                proxy(WfFormDefinitionMapper.class, (target, method, arguments) -> newerForm == null ? FORM : newerForm),
                access, new JsonSchemaValidator(), new WorkflowImSummaryPolicy());
        try {
            equal(summaries.forTask("manager-task"), List.of());
            FORM.setFieldsJson(original.replace("\"type\":\"TEXT\",\"label\":\"Note\"", "\"type\":\"TEXT\",\"imSummaryAllowed\":true,\"label\":\"Note\"")
                    .replace("\"type\":\"AMOUNT\",\"label\":\"Private salary\"", "\"type\":\"AMOUNT\",\"imSummaryAllowed\":true,\"label\":\"Private salary\""));
            equal(summaries.forTask("manager-task"), List.of(new WorkflowImSummaryPolicy.Field("Note", "initial")));
            canView = false;
            rejected(() -> summaries.forTask("manager-task"), "summary enforces instance access");
            canView = true;
            UserContext.setUserId(99L);
            rejected(() -> summaries.forTask("manager-task"), "summary enforces task receiver access");
            UserContext.setUserId(5L);
            UserContext.setTenantId(100001L);
            rejected(() -> summaries.forTask("manager-task"), "summary enforces tenant access");
            UserContext.setTenantId(100000L);
            INSTANCE.setFormVersion(null);
            equal(summaries.forTask("manager-task"), List.of());
            INSTANCE.setFormVersion(3);
            newerForm = new WfFormDefinition(); newerForm.setTenantId(100000L); newerForm.setFieldsJson(original);
            equal(summaries.forTask("manager-task"), List.of());
            newerForm = null;
            TASKS.get(0).setStatus("COMPLETED");
            equal(summaries.forTask("manager-task"), List.of());
        } finally {
            FORM.setFieldsJson(original); newerForm = null; canView = true;
            INSTANCE.setFormVersion(3); TASKS.get(0).setStatus("TODO");
            UserContext.setTenantId(100000L); UserContext.setUserId(5L);
        }
    }

    private static void initialize() throws Exception {
        for (Class<?> entity : List.of(WfTask.class, WfTaskHistory.class, WfProcessCopy.class, WfProcessDefinition.class, WfFormFieldPermission.class)) {
            TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), entity.getName()), entity);
        }
        DEFINITION.setDefinitionId("definition"); DEFINITION.setTenantId(100000L); DEFINITION.setProcessKey("expense");
        DEFINITION.setVersion(2); DEFINITION.setProcessName("Expense"); DEFINITION.setFormId("form"); DEFINITION.setStatus("PUBLISHED");
        DEFINITION.setModelJson("""
                {"nodes":[{"id":"start","type":"START"},{"id":"manager","type":"APPROVAL"},
                {"id":"hr","type":"APPROVAL"},{"id":"copy","type":"COPY"},{"id":"end","type":"END"}],
                "edges":[{"id":"a","source":"start","target":"manager"},{"id":"b","source":"manager","target":"hr"},
                {"id":"c","source":"hr","target":"copy"},{"id":"d","source":"copy","target":"end"}]}
                """);
        FORM.setId(301L); FORM.setFormId("form"); FORM.setTenantId(100000L); FORM.setFormName("Expense form"); FORM.setVersion(3); FORM.setVersionLock(7);
        FORM.setFieldsJson("""
                [{"id":"note","type":"TEXT","label":"Note"},{"id":"salary","type":"AMOUNT","label":"Private salary"},
                 {"id":"items","type":"SUB_TABLE","label":"Items","columns":[{"id":"name","type":"TEXT","label":"Name"},
                 {"id":"cost","type":"AMOUNT","label":"Private cost"}]}]
                """);
        FORM.setFormSchema(FORM.getFieldsJson());
        INSTANCE.setInstanceId("instance"); INSTANCE.setDefinitionId("definition"); INSTANCE.setTenantId(100000L); INSTANCE.setStartUserId(7L);
        INSTANCE.setFormVersion(3);
        INSTANCE.setVariables(DRAFT_JSON.canonical(Map.of("note", "initial", "salary", "12345.67", "unknownSecret", "classified",
                "items", List.of(Map.of("_rowId", "row-one", "name", "item", "cost", "12.34")))));
        for (String node : List.of("__START__", "manager", "copy")) {
            permission(node, "salary", false, false); permission(node, "items.cost", false, false);
        }
        permission("manager", "note", true, false);
        TASKS.add(task("manager-task", "manager", 5L));
        WorkflowPermissionService authorization = new WorkflowPermissionService() {
            @Override public void checkViewInstancePermission(WfProcessInstance instance) {
                viewChecks++;
                if (!canView) throw WorkflowException.permissionDenied("Instance access denied");
            }
            @Override public boolean canStartProcess(Long userId, String type, String value) { return canStart; }
            @Override public boolean isAdmin(Long userId) { return designer; }
        };
        Field agentsField = WorkflowPermissionService.class.getDeclaredField("agents");
        agentsField.setAccessible(true);
        agentsField.set(authorization, new WorkflowAgentService(null, null, null, null, null, null, null, null, null, null, JSON));
        permissionCache = new WorkflowFieldPermissionCache(proxy(WfFormFieldPermissionMapper.class, (target, method, parameters) -> {
            if ("selectList".equals(method.getName())) return new ArrayList<>(PERMISSIONS);
            throw new AssertionError(method.getName());
        }));
        WorkflowFormSecurityAudit audit = new WorkflowFormSecurityAudit(proxy(SysAuditLogMapper.class, (target, method, parameters) -> {
            if ("insert".equals(method.getName())) { if (!auditAvailable) return 0; AUDITS.add((SysAuditLogEntity) parameters[0]); return 1; }
            throw new AssertionError(method.getName());
        }), DRAFT_JSON);
        access = new WorkflowFormAccessService(
                proxy(WfProcessInstanceMapper.class, (target, method, parameters) -> Objects.equals(parameters[0], "instance") ? INSTANCE : null),
                proxy(WfProcessDefinitionMapper.class, (target, method, parameters) -> "selectList".equals(method.getName()) ? List.of(DEFINITION) : Objects.equals(parameters[0], "definition") ? DEFINITION : null),
                proxy(WfFormDefinitionMapper.class, (target, method, parameters) -> {
                    if (!Objects.equals(parameters[0], 100000L) || !Objects.equals(parameters[1], "form")) return null;
                    if (method.getName().equals("selectLatest")) return newerForm == null ? FORM : newerForm;
                    if (method.getName().equals("selectVersion")) return Objects.equals(parameters[2], 3) ? FORM : newerForm != null && Objects.equals(parameters[2], 4) ? newerForm : null;
                    throw new AssertionError(method.getName());
                }),
                proxy(WfTaskMapper.class, (target, method, parameters) -> "selectById".equals(method.getName())
                        ? TASKS.stream().filter(task -> Objects.equals(task.getTaskId(), parameters[0])).findFirst().orElse(null)
                        : TASKS.stream().filter(task -> Objects.equals(task.getAssignee(), UserContext.getUserId()) && "TODO".equals(task.getStatus())).toList()),
                proxy(WfTaskHistoryMapper.class, (target, method, parameters) -> HISTORY.stream().filter(history -> Objects.equals(history.getOperatorId(), UserContext.getUserId())).toList()),
                proxy(WfProcessCopyMapper.class, (target, method, parameters) -> COPIES.stream().filter(copy -> Objects.equals(copy.getUserId(), UserContext.getUserId())).toList()),
                authorization, permissionCache, new WorkflowGraphModelResolver(), DRAFT_JSON,
                new WorkflowFormInputService(proxy(WorkflowFormReferenceMapper.class, (target, method, parameters) -> { throw new AssertionError("No reference query expected"); }), DRAFT_JSON, new JsonSchemaValidator()),
                audit, new FormDataPermissionFilter(JSON, new JsonSchemaValidator()));
        advice = new WorkflowFormResponseAdvice(access, DRAFT_JSON, JSON);
    }

    private static void responseShapes() throws Exception {
        int before = viewChecks;
        JsonNode instance = respond(INSTANCE, Map.of());
        equal(viewChecks - before, 1);
        absent(DRAFT_JSON.tree(instance.path("variables").asText()), "salary", "unknownSecret");
        require(!instance.path("formDefinition").toString().contains("salary"), "instance removes hidden definition");
        equal(instance.path("formDefinition").path("version").asInt(), 3);
        equal(instance.path("formDefinition").path("versionLock").asInt(), 7);
        equal(instance.path("formNodeKey").asText(), "manager");
        require(INSTANCE.getVariables().contains("salary"), "response does not mutate engine variables");
        require(FORM.getFieldsJson().contains("salary"), "response does not mutate form definition");
        for (String property : List.of("variables", "formData", "variablesChanged", "formDataSnapshot")) {
            for (Object raw : List.of(INSTANCE.getVariables(), DRAFT_JSON.readData(INSTANCE.getVariables()))) {
                JsonNode safe = respond(Map.of("instanceId", "instance", property, raw), Map.of());
                JsonNode values = safe.path(property).isTextual() ? DRAFT_JSON.tree(safe.path(property).asText()) : safe.path(property);
                absent(values, "salary", "unknownSecret");
                absent(values.path("items").get(0), "cost");
                equal(values.path("note").asText(), "initial");
            }
        }
        for (String property : List.of("snapshotJson", "snapshotData", "activeTasks", "modelJson")) {
            JsonNode safe = respond(Map.of("instanceId", "instance", property, DRAFT_JSON.canonical(Map.of("variables", INSTANCE.getVariables()))), Map.of());
            require(!safe.path(property).asText().contains("salary"), "string snapshot filters " + property);
        }
        JsonNode page = respond(Map.of("records", List.of(Map.of("instanceId", "instance", "variables", INSTANCE.getVariables())), "total", 1), Map.of());
        equal(page.path("total").asInt(), 1);
        require(!page.toString().contains("salary"), "paginated task list is filtered");
        R<?> exact = (R<?>) write(R.ok(Map.of("taskId", "manager-task", "instanceId", "instance", "variables", INSTANCE.getVariables())),
                Map.of("taskId", "hr-task"), Map.of("taskId", "manager-task"));
        JsonNode exactData = JSON.valueToTree(exact.getData());
        require(!exactData.toString().contains("salary"), "exact task path selects permission context before conflicting query parameters");
        equal(exactData.path("formNodeKey").asText(), "manager");
        JsonNode trace = respond(Map.of("instanceId", "instance", "history", List.of(Map.of("variablesChanged", Map.of("salary", "12345.67")))), Map.of());
        equal(trace.path("history").get(0).path("variablesChanged").size(), 0);
        JsonNode boundForm = respond(FORM, Map.of("instanceId", "instance", "taskId", "manager-task"));
        require(!boundForm.toString().contains("salary"), "form endpoint uses explicit instance and task context");
        JsonNode start = respond(Map.of("definitionId", "definition", "formDefinition", Map.of("id", "form", "fields", DRAFT_JSON.tree(FORM.getFieldsJson())), "assigneeNodes", List.of()), Map.of());
        require(!start.toString().contains("salary"), "launch context filters hidden fields");
        canStart = false;
        JsonNode obsoleteDraft = respond(Map.of("definitionId", "definition", "draftId", "draft", "formData", Map.of("salary", "12345.67")), Map.of());
        equal(obsoleteDraft.path("formData").size(), 0);
        canStart = true;
        designer = true;
        require(respond(FORM, Map.of()).toString().contains("salary"), "designer reads complete schema without instance context");
        require(!respond(FORM, Map.of("instanceId", "instance")).toString().contains("salary"), "designer instance reads still honor node visibility");
        designer = false;
        R<?> failure = R.fail(409, "conflict");
        equal(write(failure, Map.of()), failure);
        canView = false;
        equal(respond(Map.of("instanceId", "newly-created", "status", "RUNNING"), Map.of()).path("status").asText(), "RUNNING");
        rejected(() -> respond(INSTANCE, Map.of()), "unauthorized instance data");
        canView = true;
        rejected(() -> respond(Map.of("variables", Map.of("salary", "secret")), Map.of()), "orphan form data");
        require(advice.supports(new MethodParameter(FormResponseChecks.class.getMethod("externalEndpoint"), -1), MappingJackson2HttpMessageConverter.class), "external JSON endpoint is covered");
        require(!advice.supports(new MethodParameter(FormResponseChecks.class.getMethod("internalEndpoint"), -1), MappingJackson2HttpMessageConverter.class), "internal engine endpoint is not projected");
    }

    private static void historicalVersions() throws Exception {
        newerForm = JSON.convertValue(FORM, WfFormDefinition.class);
        newerForm.setId(401L); newerForm.setVersion(4); newerForm.setVersionLock(8);
        newerForm.setFieldsJson("[{\"id\":\"note\",\"type\":\"SELECT\",\"label\":\"Note\",\"options\":[\"new\"]}]");
        newerForm.setFormSchema(newerForm.getFieldsJson());
        JsonNode oldInstance = respond(INSTANCE, Map.of());
        equal(oldInstance.path("formDefinition").path("version").asInt(), 3);
        require(oldInstance.path("formDefinition").path("fields").toString().contains("SUB_TABLE"), "deleted field remains in the historical instance schema");
        equal(oldInstance.path("formDefinition").path("fields").get(0).path("type").asText(), "TEXT");
        equal(access.start("definition").form().getVersion(), 4);
        equal(access.form("form", "instance", null, "manager-task").form().getVersion(), 3);
        JsonNode nested = respond(Map.of("formDefinition", FORM), Map.of("instanceId", "instance"));
        equal(nested.path("formDefinition").path("id").asText(), "form");
        equal(respond(newerForm, Map.of("instanceId", "instance")).path("version").asInt(), 3);
        INSTANCE.setFormVersion(null);
        JsonNode unknown = respond(INSTANCE, Map.of());
        equal(unknown.path("formDefinition").path("version").asInt(), 4);
        require(unknown.path("formDefinition").path("versionUnknownFlag").asBoolean(), "unknown form version explicitly flagged");
        INSTANCE.setFormVersion(2);
        rejected(() -> respond(INSTANCE, Map.of()), "missing bound version is not replaced by latest");
        INSTANCE.setFormVersion(3); newerForm = null;
    }

    private static void readers() {
        equal(access.instance("instance", "manager-task").nodeKey(), "manager");
        WfTask foreign = task("foreign", "hr", 6L); TASKS.add(foreign);
        rejected(() -> access.instance("instance", "foreign"), "another assignee task");
        foreign.setAssignee(5L); foreign.setInstanceId("other-instance");
        rejected(() -> access.instance("instance", "foreign"), "mismatched instance");
        foreign.setInstanceId("instance"); foreign.setTenantId(200000L);
        rejected(() -> access.instance("instance", "foreign"), "mismatched tenant");
        TASKS.remove(foreign);
        TASKS.add(task("hr-task", "hr", 5L));
        equal(access.instance("instance", null).nodeKeys(), Set.of("manager", "hr"));
        require(!access.getVisibleVariables(access.instance("instance", null), DRAFT_JSON.readData(INSTANCE.getVariables())).containsKey("salary"), "multiple task nodes use intersection");
        require(access.getVisibleVariables(access.instance("instance", "hr-task"), DRAFT_JSON.readData(INSTANCE.getVariables())).containsKey("salary"), "explicit authorized HR task can read salary");
        TASKS.removeIf(task -> "hr-task".equals(task.getTaskId()));
        UserContext.setUserId(6L);
        WfTaskHistory history = new WfTaskHistory(); history.setOperatorId(6L); history.setNodeKey("hr"); HISTORY.add(history);
        equal(access.instance("instance", null).nodeKey(), "hr");
        HISTORY.clear();
        WfProcessCopy copy = new WfProcessCopy(); copy.setUserId(6L); copy.setNodeId("copy"); COPIES.add(copy);
        equal(access.instance("instance", null).nodeKey(), "copy");
        COPIES.clear(); UserContext.setUserId(7L);
        equal(access.instance("instance", null).nodeKey(), "__START__");
        UserContext.setUserId(1L); designer = true;
        require(!access.getVisibleVariables(access.instance("instance", null), DRAFT_JSON.readData(INSTANCE.getVariables())).containsKey("salary"), "administrator without node uses intersection");
        designer = false; UserContext.setUserId(5L);
        INSTANCE.setTenantId(200000L);
        rejected(() -> access.instance("instance", null), "cross tenant instance");
        INSTANCE.setTenantId(100000L);
        DEFINITION.setIsArchived(1);
        rejected(() -> access.start("definition"), "archived start context");
        DEFINITION.setIsArchived(0);
    }

    private static void approvalAudit() throws Exception {
        WfTask task = TASKS.get(0);
        equal(access.approval(task, INSTANCE, Map.of(), false).changes(), Map.of());
        equal(access.approval(task, INSTANCE, Map.of("note", "initial"), false).changes(), Map.of());
        rejected(() -> access.approval(task, INSTANCE, Map.of("salary", "99999"), false), "hidden value tampering");
        equal(AUDITS.size(), 1);
        equal(AUDITS.get(0).getTenantId(), 100000L);
        require(AUDITS.get(0).getAfterJson().contains("salary"), "audit identifies tampered field");
        require(!JSON.valueToTree(AUDITS.get(0)).toString().contains("99999"), "audit does not contain rejected value");
        require(!JSON.valueToTree(AUDITS.get(0)).toString().contains("12345.67"), "audit does not contain original value");
        equal(WorkflowFormSecurityAudit.class.getMethod("rejected", WfTask.class, Set.class).getAnnotation(Transactional.class).propagation(), Propagation.REQUIRES_NEW);
        auditAvailable = false;
        try { access.approval(task, INSTANCE, Map.of("note", "tampered"), false); throw new AssertionError("Audit failure must deny operation"); }
        catch (WorkflowFormValidationException unexpected) { throw new AssertionError("Audit failure was ignored", unexpected); }
        catch (WorkflowException expected) { checks++; }
        auditAvailable = true;
        PERMISSIONS.removeIf(permission -> "manager".equals(permission.getNodeKey()) && "note".equals(permission.getFieldId()));
        permission("manager", "note", true, true);
        equal(access.approval(task, INSTANCE, Map.of("note", "approved"), false).changes(), Map.of("note", "approved"));
        require(INSTANCE.getVariables().contains("initial"), "validation does not mutate locked instance");
    }

    private static void cacheRoundtrip() throws Exception {
        CacheConfig configuration = new CacheConfig();
        Field helper = CacheConfig.class.getDeclaredField("sysConfigHelper"); helper.setAccessible(true);
        helper.set(configuration, new SysConfigHelper() { @Override public long getConfigLong(String key, long fallback) { return fallback; } });
        RedisCacheManager manager = (RedisCacheManager) configuration.cacheManager(proxy(RedisConnectionFactory.class, (target, method, arguments) -> { throw new AssertionError("No Redis connection expected"); }));
        manager.afterPropertiesSet(); manager.getCache("workflowFormPermissions");
        require(manager.isTransactionAware(), "cache eviction waits for database commit");
        RedisCache redisCache = (org.springframework.data.redis.cache.RedisCache) ((TransactionAwareCacheDecorator) manager.getCache("workflowFormPermissions")).getTargetCache();
        RedisSerializationContext.SerializationPair<Object> serializer = redisCache.getCacheConfiguration().getValueSerializationPair();
        List<FieldPermissionVO> values = permissionCache.get(100000L, "definition");
        equal(serializer.read(serializer.write(values)), values);
        equal(serializer.read(serializer.write(new ArrayList<>())), List.of());
        ConcurrentMapCache target = new ConcurrentMapCache("workflowFormPermissions");
        TransactionAwareCacheDecorator cache = new TransactionAwareCacheDecorator(target);
        target.put("100000:definition", values);
        TransactionSynchronizationManager.initSynchronization();
        try {
            cache.evict("100000:definition");
            require(target.get("100000:definition") != null, "pending transaction retains committed cache");
            for (TransactionSynchronization synchronization : TransactionSynchronizationManager.getSynchronizations()) synchronization.afterCommit();
            equal(target.get("100000:definition"), null);
        } finally { TransactionSynchronizationManager.clearSynchronization(); }
        target.put("100000:definition", values);
        TransactionSynchronizationManager.initSynchronization();
        try {
            cache.evict("100000:definition");
            for (TransactionSynchronization synchronization : TransactionSynchronizationManager.getSynchronizations()) synchronization.afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK);
            require(target.get("100000:definition") != null, "rolled back permission change retains cache");
        } finally { TransactionSynchronizationManager.clearSynchronization(); }
    }

    private static void files() throws Exception {
        ArrayNode schema = (com.fasterxml.jackson.databind.node.ArrayNode) DRAFT_JSON.tree(FORM.getFieldsJson());
        schema.addObject().put("id", "receipt").put("type", "UPLOAD_FILE").put("label", "Receipt").put("maxSize", 1).put("accept", ".pdf");
        schema.addObject().put("id", "privateDoc").put("type", "UPLOAD_FILE").put("label", "Private");
        FORM.setFieldsJson(schema.toString()); FORM.setFormSchema(schema.toString());
        permission("manager", "receipt", true, true); permission("manager", "privateDoc", false, false);
        Map<Long, Map<String, Object>> metadata = new LinkedHashMap<>();
        Map<String, Object> uploaded = new LinkedHashMap<>(Map.of("fileName", "receipt.pdf", "size", 15L, "extension", "pdf",
                "definitionId", "definition", "businessId", "definition", "fieldPath", "receipt", "owner", "permission-reader"));
        metadata.put(201L, uploaded);
        int[] remoteCalls = {0};
        java.util.concurrent.atomic.AtomicReference<RuntimeException> uploadFailure = new java.util.concurrent.atomic.AtomicReference<>();
        RemoteWorkflowFormFileService storage = proxy(com.cloudflow.workflow.service.remote.RemoteWorkflowFormFileService.class, (target, method, arguments) -> {
            remoteCalls[0]++;
            if ("upload".equals(method.getName()) && uploadFailure.get() != null) throw uploadFailure.get();
            if ("upload".equals(method.getName())) return R.ok(Map.of("fileId", "201", "fileName", "receipt.pdf", "size", 15L, "extension", "pdf"));
            return feign.Response.builder().status(200).reason("OK").headers(Map.of())
                    .request(feign.Request.create(feign.Request.HttpMethod.GET, "http://storage.invalid", Map.of(), null, java.nio.charset.StandardCharsets.UTF_8, new feign.RequestTemplate()))
                    .body("%PDF-1.4\nhello".getBytes(java.nio.charset.StandardCharsets.US_ASCII)).build();
        });
        WorkflowFormFileMapper mapper = proxy(com.cloudflow.workflow.mapper.WorkflowFormFileMapper.class, (target, method, arguments) -> {
            if ("findFile".equals(method.getName())) return metadata.get((Long) arguments[1]);
            if ("bindFiles".equals(method.getName())) {
                equal(arguments[0], 100000L); equal(arguments[1], "definition"); equal(arguments[2], "instance");
                equal(arguments[3], "permission-reader"); equal(arguments[4], "receipt"); equal(arguments[5], List.of(201L));
                uploaded.put("businessId", "instance"); uploaded.put("instanceId", "instance"); return 1;
            }
            throw new AssertionError(method.getName());
        });
        WorkflowFormFileService service = new com.cloudflow.workflow.service.WorkflowFormFileService(access, mapper,
                proxy(WfTaskMapper.class, (target, method, arguments) -> TASKS.stream().filter(task -> Objects.equals(task.getTaskId(), arguments[0])).findFirst().orElse(null)),
                storage, new JsonSchemaValidator(), DRAFT_JSON);
        equal(service.upload(multipart("%PDF-1.4\nhello"), "definition", null, null, "receipt").get("fileId"), "201");
        equal(remoteCalls[0], 1);
        equal(service.metadata(201L, "definition", null, null, "receipt").get("fileName"), "receipt.pdf");
        uploaded.put("owner", "other-user");
        rejected(() -> service.metadata(201L, "definition", null, null, "receipt"), "unbound upload belongs to another user");
        uploaded.put("owner", "permission-reader");
        rejected(() -> service.metadata(201L, "definition", null, null, "privateDoc"), "wrong field upload reference");
        rejected(() -> service.upload(multipart("executable-content"), "definition", null, null, "receipt"), "forged PDF signature");
        rejected(() -> service.upload(multipart("%PDF-1.4\nhello"), null, "instance", "manager-task", "privateDoc"), "hidden field upload");
        rejected(() -> service.upload(multipart("%PDF-1.4\nhello"), null, "instance", null, "receipt"), "upload without active task");
        equal(remoteCalls[0], 1);
        Map<String, Object> values = DRAFT_JSON.readData(INSTANCE.getVariables()); values.put("receipt", List.of("201"));
        fileUploadFailures(service, uploadFailure);
        INSTANCE.setVariables(DRAFT_JSON.canonical(values)); service.bindStart(INSTANCE);
        rejected(() -> service.metadata(201L, "definition", null, null, "receipt"), "bound file cannot be read through draft context");
        uploaded.put("owner", "other-user");
        equal(service.metadata(201L, null, "instance", "manager-task", "receipt").get("fileId"), "201");
        uploaded.put("instanceId", "other-instance");
        rejected(() -> service.metadata(201L, null, "instance", "manager-task", "receipt"), "file from another instance");
        uploaded.put("instanceId", "instance");
        ObjectNode receipt = (com.fasterxml.jackson.databind.node.ObjectNode) schema.get(schema.size() - 2); receipt.put("visibleExpr", "false");
        FORM.setFieldsJson(schema.toString());
        rejected(() -> service.metadata(201L, null, "instance", "manager-task", "receipt"), "expression-hidden file cannot be downloaded");
        receipt.remove("visibleExpr"); FORM.setFieldsJson(schema.toString());
        java.io.ByteArrayOutputStream bytes = new java.io.ByteArrayOutputStream();
        Map<String, String> headers = new LinkedHashMap<>();
        jakarta.servlet.ServletOutputStream output = new jakarta.servlet.ServletOutputStream() {
            public boolean isReady() { return true; }
            public void setWriteListener(jakarta.servlet.WriteListener listener) { }
            public void write(int value) { bytes.write(value); }
        };
        HttpServletResponse response = proxy(jakarta.servlet.http.HttpServletResponse.class, (target, method, arguments) -> switch (method.getName()) {
            case "getOutputStream" -> output;
            case "setHeader" -> { headers.put((String) arguments[0], (String) arguments[1]); yield null; }
            case "setContentType" -> { headers.put("Content-Type", (String) arguments[0]); yield null; }
            default -> throw new AssertionError(method.getName());
        });
        service.download(201L, null, "instance", "manager-task", "receipt", response);
        equal(bytes.toString(java.nio.charset.StandardCharsets.US_ASCII), "%PDF-1.4\nhello");
        equal(headers.get("Cache-Control"), "private, no-store"); equal(headers.get("X-Content-Type-Options"), "nosniff");
        equal(headers.get("Content-Type"), "application/octet-stream");
        require(!service.metadata(201L, null, "instance", "manager-task", "receipt").containsKey("owner"), "file metadata hides internal binding fields");
        newerForm = JSON.convertValue(FORM, WfFormDefinition.class);
        newerForm.setId(401L); newerForm.setVersion(4); newerForm.setVersionLock(8);
        newerForm.setFieldsJson("[{\"id\":\"note\",\"type\":\"TEXT\",\"label\":\"New form without attachment\"}]");
        newerForm.setFormSchema(newerForm.getFieldsJson());
        WfFormFieldPermission receiptPermission = PERMISSIONS.stream()
                .filter(permission -> "manager".equals(permission.getNodeKey()) && "receipt".equals(permission.getFieldId()))
                .findFirst().orElseThrow();
        String originalVariables = INSTANCE.getVariables();
        int historicalChecks = checks;
        try {
            equal(access.start("definition").form().getVersion(), 4);
            equal(access.instance("instance", "manager-task").form().getVersion(), 3);
            equal(service.metadata(201L, null, "instance", "manager-task", "receipt").get("fileId"), "201");
            bytes.reset();
            service.download(201L, null, "instance", "manager-task", "receipt", response);
            equal(bytes.toString(java.nio.charset.StandardCharsets.US_ASCII), "%PDF-1.4\nhello");
            JsonNode snapshot = respond(Map.of("instanceId", "instance", "formDataSnapshot", originalVariables), Map.of());
            equal(DRAFT_JSON.tree(snapshot.path("formDataSnapshot").asText()).path("receipt").get(0).asText(), "201");
            int authorizedCalls = remoteCalls[0];
            receiptPermission.setVisibleFlag(false); receiptPermission.setEditableFlag(false);
            rejected(() -> service.download(201L, null, "instance", "manager-task", "receipt", response), "historical attachment respects revoked node permission");
            JsonNode hiddenSnapshot = respond(Map.of("instanceId", "instance", "formDataSnapshot", originalVariables), Map.of());
            absent(DRAFT_JSON.tree(hiddenSnapshot.path("formDataSnapshot").asText()), "receipt");
            equal(remoteCalls[0], authorizedCalls);
            receiptPermission.setVisibleFlag(true); receiptPermission.setEditableFlag(true);
            INSTANCE.setFormVersion(4);
            rejected(() -> service.metadata(201L, null, "instance", "manager-task", "receipt"), "attachment field absent in bound version");
            INSTANCE.setFormVersion(2);
            rejected(() -> service.download(201L, null, "instance", "manager-task", "receipt", response), "missing historical version does not fall back");
            INSTANCE.setFormVersion(3);
            Map<String, Object> changedValues = DRAFT_JSON.readData(originalVariables); changedValues.remove("receipt");
            INSTANCE.setVariables(DRAFT_JSON.canonical(changedValues));
            rejected(() -> service.download(201L, null, "instance", "manager-task", "receipt", response), "removed attachment cannot be recovered using a stale reference");
            equal(remoteCalls[0], authorizedCalls);
            INSTANCE.setVariables(originalVariables); INSTANCE.setTenantId(200000L);
            rejected(() -> service.download(201L, null, "instance", "manager-task", "receipt", response), "historical attachment rejects another tenant");
            equal(remoteCalls[0], authorizedCalls);
            System.out.println("Batch C historical attachment checks passed: " + (checks - historicalChecks)
                    + "; bound_version=3; latest_version=4; revoked/removed/missing-version/cross-tenant storage requests=0");
        } finally {
            INSTANCE.setVariables(originalVariables); INSTANCE.setFormVersion(3); INSTANCE.setTenantId(100000L);
            receiptPermission.setVisibleFlag(true); receiptPermission.setEditableFlag(true); newerForm = null;
        }
    }

    private static void fileUploadFailures(WorkflowFormFileService service,
            java.util.concurrent.atomic.AtomicReference<RuntimeException> failure) {
        String capacity = "{\"code\":409,\"msg\":\"租户可用存储空间不足，无法新增文件\",\"data\":null}";
        feign.Request request = feign.Request.create(feign.Request.HttpMethod.POST, "http://storage.invalid", Map.of(), null,
                java.nio.charset.StandardCharsets.UTF_8, new feign.RequestTemplate());
        record UploadFailure(int status, String body, boolean capacity, int wrappers) { }
        List<UploadFailure> cases = List.of(
                new UploadFailure(409, capacity, true, 0), new UploadFailure(409, capacity, true, 1),
                new UploadFailure(409, capacity, true, 2), new UploadFailure(503, capacity, false, 1),
                new UploadFailure(409, "{\"code\":409,\"msg\":\"租户存储用量刷新失败\"}", false, 1),
                new UploadFailure(409, "private-transport-diagnostic", false, 0),
                new UploadFailure(409, capacity.replace("409", "200"), false, 0),
                new UploadFailure(409, capacity.replace("无法新增文件", "无法新增文件 private-transport-diagnostic"), false, 0),
                new UploadFailure(409, capacity + " {}", false, 0),
                new UploadFailure(409, capacity.replace("null", "{}"), false, 0),
                new UploadFailure(409, capacity.replace("409", "\"409\""), false, 0),
                new UploadFailure(409, capacity.replace("\"code\":409", "\"code\":200,\"code\":409"), false, 0));
        int before = checks;
        for (UploadFailure sample : cases) {
            RuntimeException upstream = feign.FeignException.errorStatus("upload", feign.Response.builder().status(sample.status())
                    .request(request).headers(Map.of()).body(sample.body(), java.nio.charset.StandardCharsets.UTF_8).build());
            if (sample.wrappers() > 0) upstream = new org.springframework.cloud.client.circuitbreaker.NoFallbackAvailableException(
                    "private-transport-diagnostic", sample.wrappers() == 2 ? new java.util.concurrent.ExecutionException(upstream) : upstream);
            failure.set(upstream);
            try {
                service.upload(multipart("%PDF-1.4\nhello"), "definition", null, null, "receipt");
                throw new AssertionError("failed storage upload accepted");
            } catch (com.cloudflow.common.core.exception.ServiceException rejected) {
                require(sample.capacity(), "only verified capacity rejection becomes a service conflict");
                equal(rejected.getCode(), 409); equal(rejected.getMessage(), "租户可用存储空间不足，无法新增文件");
            } catch (com.cloudflow.workflow.exception.WorkflowException rejected) {
                require(!sample.capacity(), "capacity rejection must remain actionable");
                equal(rejected.getCode(), "FORM_FILE_UNAVAILABLE");
                equal(rejected.getMessage(), "附件存储暂不可用，请稍后重试");
            } finally { failure.set(null); }
        }
        System.out.println("WORKFLOW_FILE_UPLOAD_FAILURES: cases=" + cases.size() + "; checks=" + (checks - before) + "; transport=fixtures");
    }

    private static org.springframework.web.multipart.MultipartFile multipart(String text) {
        byte[] bytes = text.getBytes(java.nio.charset.StandardCharsets.US_ASCII);
        return proxy(org.springframework.web.multipart.MultipartFile.class, (target, method, arguments) -> switch (method.getName()) {
            case "getOriginalFilename" -> "receipt.pdf";
            case "getName" -> "file";
            case "getContentType" -> "application/pdf";
            case "getBytes" -> bytes;
            case "getSize" -> (long) bytes.length;
            case "isEmpty" -> bytes.length == 0;
            case "getInputStream" -> new java.io.ByteArrayInputStream(bytes);
            default -> throw new AssertionError(method.getName());
        });
    }

    private static void taskReferences() throws Exception {
        int before = checks;
        UserContext.setTenantId(100000L); UserContext.setUserId(5L);
        designer = false; canView = true; canStart = false;
        TASKS.clear(); PERMISSIONS.clear(); HISTORY.clear(); COPIES.clear();
        WfTask current = task("reference-task", "manager", 5L); TASKS.add(current);
        DEFINITION.setModelJson(DEFINITION.getModelJson().replace("\"id\":\"manager\",\"type\":\"APPROVAL\"", "\"id\":\"manager\",\"type\":\"APPROVAL\",\"allowEdit\":true"));
        ArrayNode fields = JSON.createArrayNode();
        List<String> types = List.of("EMPLOYEE", "DEPT", "POST", "POSITION", "USER_MULTI", "DEPT_MULTI", "DICT_SELECT");
        for (String type : types) {
            ObjectNode field = fields.addObject().put("id", type.toLowerCase(java.util.Locale.ROOT)).put("type", type).put("label", type).put("onlyActive", false);
            if ("DICT_SELECT".equals(type)) field.put("dictType", "sample_dictionary"); else field.put("scopeDeptId", "7");
        }
        fields.addObject().put("id", "hidden").put("type", "EMPLOYEE").put("label", "Hidden");
        fields.addObject().put("id", "locked").put("type", "EMPLOYEE").put("label", "Locked").put("readonly", true);
        fields.addObject().put("id", "note").put("type", "TEXT").put("label", "Note");
        fields.addObject().put("id", "group").put("type", "GROUP").put("label", "Group").put("readonly", true)
                .putArray("children").addObject().put("id", "nested").put("type", "EMPLOYEE").put("label", "Nested");
        fields.addObject().put("id", "lines").put("type", "SUB_TABLE").put("label", "Lines")
                .putArray("columns").addObject().put("id", "department").put("type", "DEPT").put("label", "Department");
        FORM.setFieldsJson(fields.toString()); FORM.setFormSchema(fields.toString()); INSTANCE.setFormVersion(3);
        newerForm = new WfFormDefinition(); newerForm.setFormId("form"); newerForm.setTenantId(100000L); newerForm.setVersion(4);
        newerForm.setFieldsJson("[{\"id\":\"replacement\",\"type\":\"TEXT\",\"label\":\"Replacement\"}]");
        permission("manager", "hidden", false, false);
        int[] queries = {0};
        WorkflowFormReferenceMapper mapper = proxy(WorkflowFormReferenceMapper.class, (target, method, parameters) -> {
            equal(method.getName(), "pageReferences"); queries[0]++;
            equal(parameters[1], 100000L);
            if (queries[0] <= types.size()) {
                equal(parameters[3], false);
                equal(parameters[4], "DICT_SELECT".equals(parameters[2]) ? null : 7L);
                equal(parameters[5], "DICT_SELECT".equals(parameters[2]) ? "sample_dictionary" : "");
            }
            Page<?> requested = (Page<?>) parameters[0];
            return new Page<WorkflowFormReferenceVO>(requested.getCurrent(), requested.getSize())
                    .setRecords(List.of(new WorkflowFormReferenceVO("9007199254740993", String.valueOf(parameters[2]), null))).setTotal(101);
        });
        WorkflowTaskReferenceService service = new WorkflowTaskReferenceService(proxy(WfTaskMapper.class, (target, method, parameters) ->
                Objects.equals(parameters[0], current.getTaskId()) ? current : null), access, mapper);
        PageQuery query = new PageQuery(); query.setPageNum(-1); query.setPageSize(500);
        for (String type : types) {
            PageResult<WorkflowFormReferenceVO> result = service.options(current.getTaskId(), type.toLowerCase(java.util.Locale.ROOT), query);
            equal(result.getPageNum(), 1L); equal(result.getPageSize(), 100L); equal(result.getTotal(), 101L);
            equal(result.getRows().get(0).id(), "9007199254740993"); equal(result.getRows().get(0).label(), type);
        }
        equal(service.options(current.getTaskId(), "lines.department", query).getRows().get(0).label(), "DEPT");
        int retainedQueries = queries[0];
        for (String field : List.of("hidden", "locked", "nested", "note", "missing", "employee.bad.extra", "lines[0].department")) {
            rejected(() -> service.options(current.getTaskId(), field, query), "hidden/readonly/unknown reference rejected");
        }
        rejected(() -> service.options("missing-task", "employee", query), "missing task rejected");
        UserContext.setUserId(99L); rejected(() -> service.options(current.getTaskId(), "employee", query), "other user rejected"); UserContext.setUserId(5L);
        UserContext.setTenantId(100001L); rejected(() -> service.options(current.getTaskId(), "employee", query), "other tenant rejected"); UserContext.setTenantId(100000L);
        current.setStatus("DONE"); rejected(() -> service.options(current.getTaskId(), "employee", query), "completed task rejected"); current.setStatus("TODO");
        current.setAssignee(null); rejected(() -> service.options(current.getTaskId(), "employee", query), "unclaimed task rejected"); current.setAssignee(5L);
        current.setInstanceId("missing"); rejected(() -> service.options(current.getTaskId(), "employee", query), "mismatched instance rejected"); current.setInstanceId("instance");
        INSTANCE.setFormVersion(4); rejected(() -> service.options(current.getTaskId(), "employee", query), "instance version determines available fields"); INSTANCE.setFormVersion(3);
        equal(queries[0], retainedQueries);
        SaCheckPermission guard = WorkflowTaskReferenceController.class.getMethod("options", String.class, String.class, PageQuery.class, HttpServletResponse.class).getAnnotation(SaCheckPermission.class);
        equal(Set.of(guard.value()), Set.of("workflow:task:complete"));
        Map<String, String> headers = new LinkedHashMap<>();
        HttpServletResponse response = proxy(HttpServletResponse.class, (target, method, parameters) -> {
            if ("setHeader".equals(method.getName())) { headers.put((String) parameters[0], (String) parameters[1]); return null; }
            throw new AssertionError(method.getName());
        });
        new WorkflowTaskReferenceController(service).options(current.getTaskId(), "employee", query, response);
        equal(headers.get("Cache-Control"), "private, no-store");
        System.out.println("TASK_REFERENCE_SCOPE: checks=" + (checks - before) + "; pinned_version=3; latest_version=4; unauthorized_queries=0; database_writes=0");
    }

    public static Object externalEndpoint() { return null; }
    @Inner public static Object internalEndpoint() { return null; }

    private static JsonNode respond(Object data, Map<String, String> parameters) {
        Object result = write(R.ok(data), parameters);
        return JSON.valueToTree(((R<?>) result).getData());
    }
    private static Object write(Object body, Map<String, String> parameters) {
        return write(body, parameters, Map.of());
    }
    private static Object write(Object body, Map<String, String> parameters, Map<String, String> pathVariables) {
        Map<String, Object> attributes = new LinkedHashMap<>();
        attributes.put(org.springframework.web.servlet.HandlerMapping.URI_TEMPLATE_VARIABLES_ATTRIBUTE, pathVariables);
        HttpServletRequest request = proxy(HttpServletRequest.class, (target, method, arguments) -> switch (method.getName()) {
            case "getParameter" -> parameters.get(arguments[0]);
            case "getAttribute" -> attributes.get(arguments[0]);
            case "setAttribute" -> { attributes.put((String) arguments[0], arguments[1]); yield null; }
            default -> throw new AssertionError(method.getName());
        });
        return advice.beforeBodyWrite(body, null, MediaType.APPLICATION_JSON, MappingJackson2HttpMessageConverter.class, new ServletServerHttpRequest(request), null);
    }
    private static void permission(String node, String field, boolean visible, boolean editable) {
        WfFormFieldPermission value = new WfFormFieldPermission(); value.setTenantId(100000L); value.setDefinitionId("definition");
        value.setNodeKey(node); value.setFieldId(field); value.setVisibleFlag(visible); value.setEditableFlag(editable); PERMISSIONS.add(value);
    }
    private static WfTask task(String taskId, String node, Long userId) {
        WfTask task = new WfTask(); task.setTaskId(taskId); task.setInstanceId("instance"); task.setTenantId(100000L);
        task.setNodeKey(node); task.setAssignee(userId); task.setStatus("TODO"); return task;
    }
    private static <Contract> Contract proxy(Class<Contract> contract, InvocationHandler handler) { return contract.cast(Proxy.newProxyInstance(FormResponseChecks.class.getClassLoader(), new Class<?>[]{contract}, handler)); }
    private static void absent(JsonNode object, String... keys) { for (String key : keys) require(!object.has(key), "hidden key absent: " + key); }
    private static void rejected(Runnable operation, String message) { try { operation.run(); throw new AssertionError(message); } catch (WorkflowException | PermissionDeniedException expected) { checks++; } }
    private static void equal(Object actual, Object expected) { require(Objects.equals(actual, expected), "Expected " + expected + ", actual " + actual); }
    private static void require(boolean condition, String message) { checks++; if (!condition) throw new AssertionError(message); }
}
