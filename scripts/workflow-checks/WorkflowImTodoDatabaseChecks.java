import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.security.im.ImTaskTodos;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.workflow.domain.WfFormDefinition;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.mapper.WfFormDefinitionMapper;
import com.cloudflow.workflow.mapper.WfFormFieldPermissionMapper;
import com.cloudflow.workflow.mapper.WfProcessCopyMapper;
import com.cloudflow.workflow.mapper.WfProcessDefinitionMapper;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.cloudflow.workflow.mapper.WfTaskHistoryMapper;
import com.cloudflow.workflow.mapper.WfTaskMapper;
import com.cloudflow.workflow.model.WorkflowGraphModelResolver;
import com.cloudflow.workflow.service.FormDataPermissionFilter;
import com.cloudflow.workflow.service.WorkflowDraftJson;
import com.cloudflow.workflow.service.WorkflowFieldPermissionCache;
import com.cloudflow.workflow.service.WorkflowFormAccessService;
import com.cloudflow.workflow.service.WorkflowImButtonPolicy;
import com.cloudflow.workflow.service.WorkflowImSummaryPolicy;
import com.cloudflow.workflow.service.WorkflowImSummaryService;
import com.cloudflow.workflow.service.WorkflowImTodoService;
import com.cloudflow.workflow.service.WorkflowNodePolicy;
import com.cloudflow.workflow.service.WorkflowPermissionService;
import com.cloudflow.workflow.validator.JsonSchemaValidator;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Supplier;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.jdbc.core.JdbcTemplate;

public final class WorkflowImTodoDatabaseChecks {
    private final JdbcTemplate jdbc;
    private final SqlSessionTemplate sessions;
    private final WorkflowImTodoService service;
    private final AtomicReference<ImTaskTodos.Actor> actor = new AtomicReference<>();
    private final AtomicInteger verification = new AtomicInteger();
    private boolean rejectSecond;
    private int assertions;

    WorkflowImTodoDatabaseChecks(JdbcTemplate jdbc, SqlSessionTemplate sessions, WorkflowPermissionService permissions, WorkflowNodePolicy nodes) {
        this.jdbc = jdbc; this.sessions = sessions;
        ObjectMapper json = new ObjectMapper().findAndRegisterModules();
        JsonSchemaValidator validator = new JsonSchemaValidator();
        WorkflowFormAccessService forms = new WorkflowFormAccessService(mapper(WfProcessInstanceMapper.class), mapper(WfProcessDefinitionMapper.class),
                mapper(WfFormDefinitionMapper.class), mapper(WfTaskMapper.class), mapper(WfTaskHistoryMapper.class), mapper(WfProcessCopyMapper.class),
                permissions, new WorkflowFieldPermissionCache(mapper(WfFormFieldPermissionMapper.class)), new WorkflowGraphModelResolver(),
                new WorkflowDraftJson(json), null, null, new FormDataPermissionFilter(json, validator));
        WorkflowImSummaryService summaries = new WorkflowImSummaryService(mapper(WfTaskMapper.class), mapper(WfFormDefinitionMapper.class), forms, validator, new WorkflowImSummaryPolicy());
        service = new WorkflowImTodoService(mapper(WfTaskMapper.class), mapper(WfTaskHistoryMapper.class), mapper(WfProcessInstanceMapper.class), forms, summaries, permissions,
                new WorkflowImButtonPolicy(mapper(WfProcessInstanceMapper.class), nodes, forms), request -> {
                    int calls = verification.incrementAndGet();
                    if (rejectSecond && calls % 2 == 0) return R.fail(403, "controlled revocation");
                    return R.ok(actor.get());
                });
    }

    void run(Supplier<WfTask> taskFactory) {
        WfTask task = taskFactory.get();
        long tenant = task.getTenantId();
        ImTaskTodos.Request request = new ImTaskTodos.Request(tenant, 993901L);
        actor.set(identity(request, task, task.getAssignee(), task.getVersion()));
        jdbc.update("UPDATE wf_task SET task_type='APPROVAL' WHERE task_id=?", task.getTaskId());
        UserContext.setTenantId(100000L); UserContext.setUserId(1L); UserContext.setAuthToken("forged-identity"); TenantContext.setTenantSkip();
        ImTaskTodos.Projection initial = service.project(request);
        check("ACTIVE".equals(initial.state()) && initial.fields().isEmpty() && initial.directAction(), "plain task has buttons and no default summary");
        check(verification.get() == 2, "current recipient identity checked before and after projection");
        check(UserContext.getUserId() == null && UserContext.getAuthToken() == null && TenantContext.getTenantId() == null && !TenantContext.getTenantSkip(), "inbound forged context and outgoing recipient context cleared");
        ImTaskTodos.Status status = service.status(request);
        check("ACTIVE".equals(status.state()) && request.equals(status.request()), "reconciliation reads current task state without form projection");
        try { String statusJson = new ObjectMapper().writeValueAsString(status); check(!statusJson.contains("fields") && !statusJson.contains("title"), "status response contains no form content or title"); }
        catch (Exception failure) { throw new IllegalStateException(failure); }
        identityContext(tenant, task.getAssignee());
        WfProcessInstance instance = mapper(WfProcessInstanceMapper.class).selectById(task.getInstanceId());
        WfFormDefinition form = new WfFormDefinition();
        form.setFormId(UUID.randomUUID().toString()); form.setTenantId(tenant); form.setFormKey(form.getFormId());
        form.setFormName("外发授权测试"); form.setVersion(1); form.setVersionLock(0); form.setIsLatest(1); form.setStatus("ACTIVE");
        String schema = """
                [{"id":"approved","label":"批准摘要","type":"TEXT","imSummaryAllowed":true},
                 {"id":"hidden","label":"隐藏金额","type":"AMOUNT","imSummaryAllowed":true},
                 {"id":"private","label":"未授权内容","type":"TEXT"}]
                """;
        form.setFieldsJson(schema); form.setFormSchema(schema);
        mapper(WfFormDefinitionMapper.class).insert(form);
        jdbc.update("UPDATE wf_process_definition SET form_id=? WHERE definition_id=?", form.getFormId(), instance.getDefinitionId());
        jdbc.update("UPDATE wf_process_instance SET form_version=1,variables=? WHERE instance_id=?", "{\"approved\":\"allowed-value\",\"hidden\":\"17000.10\",\"private\":\"private-value\",\"undeclared\":\"internal-value\"}", instance.getInstanceId());
        jdbc.update("INSERT INTO wf_form_field_permission(permission_id,tenant_id,definition_id,node_key,field_id,visible_flag,editable_flag,required_flag) VALUES (?,?,?,'review','hidden',0,0,0)", UUID.randomUUID().toString(), tenant, instance.getDefinitionId());
        ImTaskTodos.Projection filtered = service.project(request);
        check(filtered.fields().equals(List.of(new ImTaskTodos.Field("批准摘要", "allowed-value"))), "real recipient projection removes hidden and unapproved content");
        check(filtered.directAction(), "readonly approved field retains ordinary buttons");
        check(!filtered.toString().contains("allowed-value"), "projection diagnostic text excludes form content");
        jdbc.update("UPDATE wf_form_definition SET fields_json=?,form_schema=? WHERE id=?", schema.replace("\"imSummaryAllowed\":true", "\"imSummaryAllowed\":false"), schema, form.getId());
        check(service.project(request).fields().isEmpty(), "current administrator withdrawal prevents later summary generation");
        jdbc.update("UPDATE wf_form_definition SET fields_json=? WHERE id=?", schema, form.getId());
        jdbc.update("UPDATE wf_process_instance SET form_version=NULL WHERE instance_id=?", instance.getInstanceId());
        ImTaskTodos.Projection unknown = service.project(request);
        check(unknown.fields().isEmpty() && !unknown.directAction(), "unknown bound version exposes no summary and requires details");
        jdbc.update("UPDATE wf_process_instance SET form_version=1 WHERE instance_id=?", instance.getInstanceId());
        jdbc.update("UPDATE wf_task SET task_type='ADD_SIGN' WHERE task_id=?", task.getTaskId());
        check(!service.project(request).directAction(), "complex task exposes details without action buttons");
        jdbc.update("UPDATE wf_task SET task_type='APPROVAL' WHERE task_id=?", task.getTaskId());
        actor.set(identity(request, task, task.getAssignee() + 100000L, task.getVersion()));
        rejected(() -> service.project(request), "forged recipient cannot read summary even when verifier grants task permissions");
        actor.set(identity(request, task, task.getAssignee(), task.getVersion() + 1));
        check("CANCELLED".equals(service.project(request).state()), "stale assignment has no active projection");
        check("CANCELLED".equals(service.status(request).state()), "status-only query cancels stale assignment");
        actor.set(identity(request, task, task.getAssignee(), task.getVersion()));
        verification.set(0); rejectSecond = true;
        try { rejected(() -> service.project(request), "recipient revocation during projection returns no content"); }
        finally { rejectSecond = false; }
        jdbc.update("UPDATE wf_task SET status='COMPLETED',lock_version=lock_version+1 WHERE task_id=?", task.getTaskId());
        ImTaskTodos.Projection completed = service.project(request);
        check("COMPLETED".equals(completed.state()) && completed.fields().isEmpty() && completed.title() == null, "completed task retains terminal display despite version increment and exposes no content");
        check("COMPLETED".equals(service.status(request).state()), "status-only query confirms completed task without form values");
        check(jdbc.queryForObject("SELECT COUNT(*) FROM wf_task_history WHERE task_id=?", Integer.class, task.getTaskId()) == 0, "projection performs no task action");
        historical(task, request);
        feignHeaders();
        System.out.println("G4_IM_TODO_PROJECTION_DATABASE: assertions=" + assertions + "; failed=0; real_mysql=true; real_task_and_form_permissions=true; identity_transport=controlled; external_sends=0");
    }

    private void historical(WfTask task, ImTaskTodos.Request request) {
        jdbc.update("DELETE FROM wf_task WHERE tenant_id=? AND task_id=?", task.getTenantId(), task.getTaskId());
        check("CANCELLED".equals(service.status(request).state()), "missing task without completion history is cancelled");
        String identifier = UUID.randomUUID().toString();
        jdbc.update("INSERT INTO wf_task_history(history_id,tenant_id,task_id,instance_id,operator_id,action,create_time) VALUES (?,?,?,?,?,'APPROVE',NOW())",
                identifier, task.getTenantId() + 1, task.getTaskId(), task.getInstanceId(), task.getAssignee());
        check("CANCELLED".equals(service.status(request).state()), "same task identity in another tenant cannot establish completion");
        jdbc.update("UPDATE wf_task_history SET tenant_id=? WHERE history_id=?", task.getTenantId(), identifier);
        for (String action : List.of("APPROVE", "REJECT", "COUNTERSIGN_APPROVE", "COUNTERSIGN_REJECT")) {
            jdbc.update("UPDATE wf_task_history SET action=? WHERE history_id=?", action, identifier);
            ImTaskTodos.Projection projected = service.project(request);
            check("COMPLETED".equals(service.status(request).state()) && "COMPLETED".equals(projected.state())
                    && projected.fields().isEmpty() && projected.title() == null, "archived handled task retains content-free completed state: " + action);
        }
        jdbc.update("UPDATE wf_task_history SET action='APPROVE',variables_changed=? WHERE history_id=?", "{\"_wf_execution\":{\"sequence\":1}}", identifier);
        jdbc.update("INSERT INTO wf_task_history(history_id,tenant_id,task_id,instance_id,operator_id,action,create_time,variables_changed) SELECT ?,tenant_id,task_id,instance_id,operator_id,'DELEGATE',create_time,? FROM wf_task_history WHERE history_id=?",
                UUID.randomUUID().toString(), "{\"_wf_execution\":{\"sequence\":2}}", identifier);
        check("CANCELLED".equals(service.status(request).state()), "latest same-second execution action supersedes an earlier approval");
        jdbc.update("DELETE FROM wf_task_history WHERE tenant_id=? AND task_id=?", task.getTenantId(), task.getTaskId());
    }

    private void feignHeaders() {
        feign.RequestTemplate request = new feign.RequestTemplate(); request.uri("/inner/auth/im-todo/verify");
        request.header("Authorization", "forged"); request.header("Cookie", "forged"); request.header("X-User-Id", "1");
        new com.cloudflow.workflow.config.FeignRequestInterceptor("cloudflow-service-workflow").apply(request);
        check(!request.headers().containsKey("Authorization") && !request.headers().containsKey("Cookie") && !request.headers().containsKey("X-User-Id"), "projection identity call strips browser authentication");
    }

    private ImTaskTodos.Actor identity(ImTaskTodos.Request request, WfTask task, long userId, int version) {
        return new ImTaskTodos.Actor(request, 0, 993902L, 0, task.getTaskId(), version, 993903L, 0, userId, 0, 0,
                Set.of("workflow:task:todo", "workflow:task:complete", "workflow:process:view"));
    }
    private static void identityContext(long tenant, long user) { UserContext.setTenantId(tenant); UserContext.setUserId(user); TenantContext.setTenantId(tenant); }
    private <Type> Type mapper(Class<Type> type) { return sessions.getMapper(type); }
    private void rejected(Runnable operation, String message) { boolean rejected = false; try { operation.run(); } catch (ServiceException expected) { rejected = true; } check(rejected, message); }
    private void check(boolean condition, String message) { assertions++; if (!condition) throw new AssertionError(message); }
}
