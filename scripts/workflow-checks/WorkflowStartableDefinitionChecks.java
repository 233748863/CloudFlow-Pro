import cn.dev33.satoken.annotation.SaCheckPermission;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.workflow.controller.WorkflowController;
import com.cloudflow.workflow.domain.WfProcessDefinition;
import com.cloudflow.workflow.domain.vo.StartableDefinitionVO;
import com.cloudflow.workflow.exception.PermissionDeniedException;
import com.cloudflow.workflow.mapper.WfProcessDefinitionMapper;
import com.cloudflow.workflow.model.WorkflowGraphModelResolver;
import com.cloudflow.workflow.service.WorkflowPermissionService;
import com.cloudflow.workflow.service.impl.WfDefinitionServiceImpl;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.lang.reflect.Field;
import org.apache.ibatis.builder.MapperBuilderAssistant;

import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;

public final class WorkflowStartableDefinitionChecks {
    private static int checks;

    public static void main(String[] arguments) throws Exception {
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), "catalog-check"), WfProcessDefinition.class);
        UserContext.setTenantId(100000L);
        UserContext.setUserId(5L);
        try {
            permissionsAndProjection();
            paginationAndIdentity();
            endpointPermissions();
            System.out.println("PASS: H startable definition checks=" + checks);
        } finally {
            UserContext.clear();
        }
    }

    private static void permissionsAndProjection() throws Exception {
        WfProcessDefinition publicOlder = definition("public-old", "public", 1, "ALL");
        WfProcessDefinition publicLatest = definition("public-latest", "public", 2, "ALL");
        WfProcessDefinition nextDraft = definition("public-draft", "public", 3, "ALL");
        nextDraft.setStatus("DRAFT");
        WfProcessDefinition restrictedOlder = definition("restricted-old", "restricted", 1, "ALL");
        WfProcessDefinition restrictedLatest = definition("restricted-new", "restricted", 2, "USER");
        restrictedLatest.setStartPermissionValue("[8]");
        WfProcessDefinition owned = definition("own", "own", 1, "USER");
        WfProcessDefinition foreign = definition("foreign", "foreign", 1, "ALL");
        foreign.setTenantId(200000L);
        WfProcessDefinition archived = definition("archived", "archived", 1, "ALL");
        archived.setIsArchived(1);
        WfProcessDefinition malformed = definition("invalid", "invalid", 1, "ALL");
        malformed.setModelJson("{");
        WfDefinitionServiceImpl service = service(List.of(publicOlder, nextDraft, publicLatest, restrictedOlder, restrictedLatest, owned, foreign, archived, malformed));
        PageResult<StartableDefinitionVO> result = service.listStartableDefinitions(new PageQuery());
        equal(3L, result.getTotal());
        equal(Set.of("public-latest", "own", "invalid"), result.getRows().stream().map(row -> row.definitionId()).collect(java.util.stream.Collectors.toSet()));
        equal(true, result.getRows().stream().filter(row -> row.definitionId().equals("public-latest")).findFirst().orElseThrow().modelValid());
        equal(false, result.getRows().stream().filter(row -> row.definitionId().equals("invalid")).findFirst().orElseThrow().modelValid());
        JsonNode serialized = new ObjectMapper().valueToTree(result.getRows().get(0));
        Set<String> fields = new HashSet<>();
        serialized.fieldNames().forEachRemaining(fields::add);
        equal(Set.of("definitionId", "processKey", "processName", "version", "formId", "category", "tags", "description", "modelValid"), fields);
        equal(false, serialized.toString().contains("CATALOG_PRIVATE_MODEL_MARKER"));
        UserContext.setUserId(8L);
        equal(Set.of("public-latest", "restricted-new", "invalid"), service.listStartableDefinitions(new PageQuery()).getRows().stream()
                .map(row -> row.definitionId()).collect(java.util.stream.Collectors.toSet()));
        UserContext.setUserId(5L);
    }

    private static void paginationAndIdentity() throws Exception {
        List<WfProcessDefinition> rows = new ArrayList<>();
        for (int index = 0; index < 102; index++) rows.add(definition("page-" + index, "page-" + index, 1, "ALL"));
        WfDefinitionServiceImpl service = service(rows);
        PageQuery query = new PageQuery();
        query.setPageSize(1000);
        query.getParams().put("status", "DRAFT");
        PageResult<StartableDefinitionVO> first = service.listStartableDefinitions(query);
        equal(100, first.getRows().size());
        equal(102L, first.getTotal());
        equal(100L, first.getPageSize());
        query.setPageNum(2);
        equal(2, service.listStartableDefinitions(query).getRows().size());
        query.setPageNum(Integer.MAX_VALUE);
        equal(0, service.listStartableDefinitions(query).getRows().size());
        query.setPageNum(-1);
        equal(1L, service.listStartableDefinitions(query).getPageNum());
        UserContext.setUserId(null);
        rejects(() -> service.listStartableDefinitions(query));
        UserContext.setUserId(5L);
        UserContext.setTenantId(null);
        rejects(() -> service.listStartableDefinitions(query));
        UserContext.setTenantId(100000L);
    }

    private static void endpointPermissions() throws Exception {
        equal(List.of("workflow:process:start"), List.of(WorkflowController.class.getMethod("listStartableDefinitions", PageQuery.class)
                .getAnnotation(SaCheckPermission.class).value()));
        equal(List.of("workflow:definition:list"), List.of(WorkflowController.class.getMethod("listProcessDefinitions", PageQuery.class)
                .getAnnotation(SaCheckPermission.class).value()));
    }

    private static WfDefinitionServiceImpl service(List<WfProcessDefinition> rows) throws Exception {
        WfDefinitionServiceImpl service = new WfDefinitionServiceImpl();
        Object mapper = Proxy.newProxyInstance(WorkflowStartableDefinitionChecks.class.getClassLoader(),
                new Class<?>[]{WfProcessDefinitionMapper.class}, (proxy, method, arguments) -> {
                    if (!method.getName().equals("selectList")) throw new AssertionError("Unexpected mapper method");
                    LambdaQueryWrapper<?> query = (LambdaQueryWrapper<?>) arguments[0];
                    String sql = query.getSqlSegment();
                    equal(true, sql.contains("tenant_id") && sql.contains("status") && sql.contains("is_archived"));
                    equal(true, query.getParamNameValuePairs().containsValue(100000L));
                    equal(true, query.getParamNameValuePairs().containsValue("PUBLISHED"));
                    return rows;
                });
        inject(service, "processDefinitionMapper", mapper);
        inject(service, "workflowGraphModelResolver", new WorkflowGraphModelResolver());
        inject(service, "permissionService", new WorkflowPermissionService() {
            @Override
            public boolean canStartProcess(Long userId, String type, String value) {
                return "ALL".equals(type) || "USER".equals(type) && ("[" + userId + "]").equals(value);
            }
        });
        return service;
    }

    private static WfProcessDefinition definition(String id, String key, int version, String permission) {
        WfProcessDefinition row = new WfProcessDefinition();
        row.setDefinitionId(id);
        row.setProcessKey(key);
        row.setProcessName("流程目录测试");
        row.setTenantId(100000L);
        row.setStatus("PUBLISHED");
        row.setVersion(version);
        row.setIsArchived(0);
        row.setStartPermissionType(permission);
        row.setStartPermissionValue("[5]");
        row.setModelJson("{\"nodes\":[],\"edges\":[],\"private\":\"CATALOG_PRIVATE_MODEL_MARKER\"}");
        return row;
    }

    private static void inject(Object target, String name, Object value) throws Exception {
        Field field = target.getClass().getDeclaredField(name);
        field.setAccessible(true);
        field.set(target, value);
    }

    private static void equal(Object expected, Object actual) {
        checks++;
        if (!Objects.equals(expected, actual)) throw new AssertionError("Catalog contract check " + checks);
    }

    private static void rejects(Runnable operation) {
        try {
            operation.run();
            throw new AssertionError("Missing identity was accepted");
        } catch (PermissionDeniedException expected) {
            checks++;
        }
    }
}
