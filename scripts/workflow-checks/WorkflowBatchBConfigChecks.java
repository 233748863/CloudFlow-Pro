import com.baomidou.mybatisplus.core.conditions.AbstractWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.workflow.domain.*;
import com.cloudflow.workflow.domain.dto.FieldPermissionDTO;
import com.cloudflow.workflow.domain.enums.WfProcessStatus;
import com.cloudflow.workflow.domain.monitor.NodeMonitor;
import com.cloudflow.workflow.domain.system.SysUser;
import com.cloudflow.workflow.domain.system.SysUserRole;
import com.cloudflow.workflow.domain.vo.FieldPermissionVO;
import com.cloudflow.workflow.domain.vo.StartAssigneeNodeVO;
import com.cloudflow.workflow.mapper.*;
import com.cloudflow.workflow.mapper.system.SysUserMapper;
import com.cloudflow.workflow.mapper.system.SysUserRoleMapper;
import com.cloudflow.workflow.model.WorkflowGraphModelResolver;
import com.cloudflow.workflow.service.*;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.service.impl.WfDefinitionServiceImpl;
import com.cloudflow.workflow.service.impl.WfFormServiceImpl;
import com.cloudflow.workflow.service.impl.WfTaskServiceImpl;
import com.cloudflow.workflow.service.impl.WorkflowP4ServiceImpl;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;
import java.time.LocalDateTime;
import java.util.*;
import java.util.function.BiFunction;

public final class WorkflowBatchBConfigChecks {
    private static int checks;

    public static int run() throws Exception {
        for (Class<?> entity : List.of(WfFormDefinition.class, WfFormFieldPermission.class, SysUser.class, SysUserRole.class, WfTask.class, WfTaskRead.class,
                WfTaskHistory.class, WfNodeRecord.class, WfGatewayActivation.class, WfTaskCandidate.class,
                WfTaskDelegation.class, WfTaskAddSign.class, WfCountersignTask.class,
                com.cloudflow.workflow.domain.monitor.TaskMonitor.class, com.cloudflow.workflow.domain.monitor.NodeMonitor.class)) {
            com.baomidou.mybatisplus.core.metadata.TableInfoHelper.initTableInfo(new org.apache.ibatis.builder.MapperBuilderAssistant(
                    new com.baomidou.mybatisplus.core.MybatisConfiguration(), "batch-b-config"), entity);
        }
        UserContext.setUserId(1L);
        UserContext.setUserName("测试审批人");
        UserContext.setTenantId(100000L);
        com.cloudflow.common.tenant.TenantContext.setTenantId(100000L);
        TransactionSynchronizationManager.initSynchronization();
        try {
            checkDefinitionConfigurations();
            checkInitiatorSelectedDefinitionValidation();
            checkRuntimeApproverDefinitionValidation();
            checkManualSavePolicy();
            checkCompletedTaskPolicyNotes();
            checkNodePolicyRetryBoundary();
            checkInstanceDiagramProjection();
            checkConfigurationLockProtocol();
            checkFormVersionWrite();
            checkCountersignRejection();
            checkEnhancementRejectionDelegation();
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
            TransactionSynchronizationManager.setActualTransactionActive(false);
            com.cloudflow.common.tenant.TenantContext.clear();
            UserContext.clear();
        }
        return checks;
    }

    private static void checkManualSavePolicy() throws Exception {
        WorkflowGraphModelResolver graphs = new WorkflowGraphModelResolver();
        for (String type : List.of("MANUAL", "APPROVAL", "PARALLEL")) {
            for (String policy : List.of("ALLOW", "AUTO_SKIP", "TO_DIRECT_LEADER", "TO_DEPT_MANAGER")) {
                String model = """
                        {"nodes":[{"id":"start","type":"START"},
                        {"id":"work","type":"%s","signType":"ALL","approverType":"INITIATOR","approveSelf":"%s"},
                        {"id":"end","type":"END"}],"edges":[{"source":"start","target":"work"},{"source":"work","target":"end"}]}
                        """.formatted(type, policy);
                com.cloudflow.workflow.model.WorkflowRuntimeGraph graph = graphs.parseRuntimeGraph(model);
                equal(policy, graph.getNode("work").getApproveSelf(), "reading existing policy does not rewrite " + type + policy);
                if ("MANUAL".equals(type) && !"ALLOW".equals(policy)) {
                    rejectsCode(() -> com.cloudflow.workflow.model.WorkflowNodeConfigValidator.validateForSave(graph), "INVALID_REQUEST", "manual write rejects " + policy);
                } else {
                    com.cloudflow.workflow.model.WorkflowNodeConfigValidator.validateForSave(graph);
                    equal(policy, graph.getNode("work").getApproveSelf(), "valid policy write preserves " + type + policy);
                }
                graph.getNode("work").setApproveSelf(null);
                com.cloudflow.workflow.model.WorkflowNodeConfigValidator.validateForSave(graph);
                equal(null, graph.getNode("work").getApproveSelf(), "omitted policy remains omitted");
            }
        }
    }

    private static void checkDefinitionConfigurations() throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        WorkflowGraphModelResolver graphs = new WorkflowGraphModelResolver();
        String model = """
                {"nodes":[{"id":"start","type":"START","title":"发起"},
                {"id":"split","type":"PARALLEL","title":"分支","joinNodeKey":"end"},
                {"id":"first","type":"APPROVAL","title":"负责人","approverType":"INITIATOR_SELECTED","selectableScope":{"roleIds":[8],"deptIds":[10]}},
                {"id":"sibling","type":"APPROVAL","title":"另一分支"},
                {"id":"second","type":"PARALLEL","title":"票签","signType":"WEIGHT","passWeight":1,"weightSource":"EQUAL","approverType":"INITIATOR_SELECTED","selectableScope":{"roleIds":[8],"deptIds":[10]}},
                {"id":"end","type":"END","title":"结束"}],
                "edges":[{"source":"start","target":"split"},{"source":"split","target":"first"},{"source":"split","target":"end","isDefault":true},
                {"source":"split","target":"sibling","condition":"amount > 100"},{"source":"first","target":"second"},
                {"source":"second","target":"end"},{"source":"sibling","target":"end"}]}
                """;
        WfProcessDefinition definition = new WfProcessDefinition();
        definition.setDefinitionId("config"); definition.setTenantId(100000L); definition.setStatus("PUBLISHED");
        definition.setFormId("form"); definition.setModelJson(model);
        WfFormDefinition form = new WfFormDefinition();
        form.setFormId("form"); form.setTenantId(100000L);
        form.setFieldsJson("[{\"id\":\"amount\"},{\"id\":\"items\",\"columns\":[{\"id\":\"quantity\"}]}]");
        List<WfFormFieldPermission> saved = new ArrayList<>();
        List<SysUser> users = new ArrayList<>();
        for (long identifier = 1; identifier <= 6; identifier++) {
            SysUser user = new SysUser();
            user.setUserId(identifier); user.setUserName("user-" + identifier); user.setNickName("人员" + identifier);
            user.setTenantId(identifier == 5 ? 200000L : 100000L); user.setDeptId(identifier == 2 ? 20L : 10L);
            user.setStatus(identifier == 4 ? "1" : "0"); user.setDeleted(identifier == 6 ? 1 : 0); users.add(user);
        }
        SysUserMapper userMapper = proxy(SysUserMapper.class, (method, arguments) -> {
            AbstractWrapper<?, ?, ? extends AbstractWrapper<?, ?, ?>> query = (AbstractWrapper<?, ?, ?>) arguments[0];
            String sql = query.getSqlSegment();
            Collection<Object> parameters = query.getParamNameValuePairs().values();
            equal(true, sql.contains("tenant_id") && sql.contains("status") && sql.contains("deleted"), "candidate account validity predicates");
            equal(true, parameters.contains(100000L) && parameters.contains("0") && parameters.contains(0), "candidate account tenant and status values");
            return users.stream().filter(user -> user.getTenantId().equals(100000L) && user.getDeleted() == 0 && user.getStatus().equals("0"))
                    .filter(user -> !sql.contains("dept_id") || parameters.contains(user.getDeptId()))
                    .filter(user -> !sql.contains("user_id IN") || parameters.contains(user.getUserId())).toList();
        });
        SysUserRoleMapper roles = proxy(SysUserRoleMapper.class, (method, arguments) -> {
            AbstractWrapper<?, ?, ? extends AbstractWrapper<?, ?, ?>> query = (AbstractWrapper<?, ?, ?>) arguments[0];
            equal(true, query.getSqlSegment().contains("tenant_id"), "role candidates are tenant scoped");
            equal(true, query.getParamNameValuePairs().containsValue(8L), "configured role range queried");
            return List.of(1L, 2L, 4L, 6L).stream().map(identifier -> {
                SysUserRole relation = new SysUserRole(); relation.setUserId(identifier); relation.setRoleId(8L); relation.setTenantId(100000L); return relation;
            }).toList();
        });
        InitiatorSelectionService selections = new InitiatorSelectionService(null, userMapper, roles, graphs);
        boolean[] allowed = {true, true};
        WorkflowPermissionService permissions = new WorkflowPermissionService() {
            @Override
            public boolean canStartProcess(Long userId, String permissionType, String permissionValue) { return allowed[0]; }
            @Override
            public void checkDefinitionPermission(String action) {
                if (!allowed[1]) throw WorkflowException.permissionDenied("definition configuration denied");
            }
        };
        WfFormFieldPermissionMapper fields = proxy(WfFormFieldPermissionMapper.class, (method, arguments) -> {
            if (method.equals("insert")) { saved.add((WfFormFieldPermission) arguments[0]); return 1; }
            AbstractWrapper<?, ?, ? extends AbstractWrapper<?, ?, ?>> query = (AbstractWrapper<?, ?, ?>) arguments[0];
            equal(true, query.getSqlSegment().contains("tenant_id") && query.getParamNameValuePairs().containsValue(100000L), "field permission tenant predicate");
            equal(true, query.getParamNameValuePairs().containsValue("config"), "field permission definition predicate");
            if (method.equals("selectList")) return List.copyOf(saved);
            int count = saved.size(); saved.clear(); return count;
        });
        WorkflowConfigurationLockService configurationLocks = new WorkflowConfigurationLockService(null) {
            @Override
            public LockedConfiguration lockDefinition(String definitionId) {
                if (!"config".equals(definitionId)) throw WorkflowException.processNotFound(definitionId);
                if (!Objects.equals(UserContext.getTenantId(), definition.getTenantId())) {
                    throw WorkflowException.permissionDenied("definition configuration tenant denied");
                }
                return new LockedConfiguration(definition.getTenantId(), List.of(definition), Map.of("form", form));
            }
        };
        WorkflowDefinitionConfigService service = new WorkflowDefinitionConfigService(proxy(WfProcessDefinitionMapper.class,
                (method, arguments) -> "config".equals(arguments[0]) ? definition : null),
                configurationLocks, fields, graphs, permissions, selections, mapper);

        equal(Set.of("start", "split", "first"), service.selectableNodes("config", "second").stream()
                .map(com.cloudflow.workflow.domain.vo.NodeOptionVO::nodeKey).collect(java.util.stream.Collectors.toSet()), "upstream excludes self downstream sibling");
        equal("WEIGHT", graphs.parseRuntimeGraph(model).getNode("second").getSignType(), "weight sign remains a single-exit business node");
        rejects(() -> service.selectableNodes("config", "missing"), "unknown current node rejected");
        rejects(() -> service.fieldPermissions("missing"), "missing definition rejected");
        List<StartAssigneeNodeVO> selectable = service.startAssigneeNodes("config");
        equal(2, selectable.size(), "all initiator-selected nodes returned");
        for (StartAssigneeNodeVO option : selectable) {
            equal(List.of("1"), option.candidates().stream().map(com.cloudflow.workflow.domain.vo.StartAssigneeNodeVO.Candidate::userId).toList(), "candidate role and department intersection");
            equal(option.nodeKey().equals("second"), option.multiple(), "ordinary single selection versus weight multi selection");
        }
        definition.setStatus("DRAFT");
        rejects(() -> service.startAssigneeNodes("config"), "unpublished definition cannot start");
        definition.setStatus("PUBLISHED"); allowed[0] = false;
        rejects(() -> service.startAssigneeNodes("config"), "start permission enforced");
        allowed[0] = true;
        definition.setModelJson(model.replace("\"approverType\":\"INITIATOR_SELECTED\"", "\"approverType\":\"INITIATOR_SELECTED\",\"allowSelection\":false"));
        rejects(() -> service.startAssigneeNodes("config"), "disabled selection cannot bypass node switch");
        definition.setModelJson(model);

        List<FieldPermissionDTO> requested = List.of(new FieldPermissionDTO("__START__", "amount", true, true, true),
                new FieldPermissionDTO("first", "items.quantity", true, false, null));
        rejectsCode(() -> service.saveFieldPermissions("config", requested), "INVALID_STATE", "published definition cannot create field permissions");
        equal(List.of(), saved, "rejected published creation leaves no field permissions");
        definition.setStatus("DRAFT");
        service.saveFieldPermissions("config", requested);
        equal(2, saved.size(), "field permissions persisted");
        equal(null, service.fieldPermissions("config").get(1).requiredFlag(), "unspecified required flag inherits form setting");
        equal(true, saved.stream().allMatch(field -> field.getTenantId().equals(100000L) && field.getDefinitionId().equals("config") && field.getCreateBy().equals("1")), "stored field permissions carry owner and audit");
        List<FieldPermissionVO> originalPermissions = service.fieldPermissions("config");
        List<String> originalPermissionIds = saved.stream().map(WfFormFieldPermission::getPermissionId).toList();
        definition.setStatus("PUBLISHED");
        rejectsCode(() -> service.saveFieldPermissions("config", List.of(requested.get(0))), "INVALID_STATE", "published definition cannot replace field permissions");
        equal(originalPermissions, service.fieldPermissions("config"), "rejected published replacement preserves field permissions");
        equal(originalPermissionIds, saved.stream().map(WfFormFieldPermission::getPermissionId).toList(), "rejected published replacement preserves permission identities");
        rejectsCode(() -> service.saveFieldPermissions("config", List.of()), "INVALID_STATE", "published definition cannot clear field permissions");
        equal(originalPermissions, service.fieldPermissions("config"), "rejected published clear preserves field permissions");
        equal(originalPermissionIds, saved.stream().map(WfFormFieldPermission::getPermissionId).toList(), "rejected published clear preserves permission identities");
        definition.setStatus("DRAFT");
        for (List<FieldPermissionDTO> invalid : List.of(
                List.of(new FieldPermissionDTO("first", "missing", true, false, null)),
                List.of(new FieldPermissionDTO("missing", "amount", true, false, null)),
                List.of(new FieldPermissionDTO("first", "amount", false, true, null)),
                List.of(requested.get(0), requested.get(0)),
                List.of(new FieldPermissionDTO("first", "amount", null, false, null)))) {
            rejects(() -> service.saveFieldPermissions("config", invalid), "invalid field configuration rejected before replacement");
            equal(originalPermissions, service.fieldPermissions("config"), "invalid replacement leaves previous permissions intact");
            equal(originalPermissionIds, saved.stream().map(WfFormFieldPermission::getPermissionId).toList(), "invalid replacement preserves permission identities");
        }
        rejects(() -> service.saveFieldPermissions("config", null), "null replacement rejected");
        form.setTenantId(200000L);
        rejects(() -> service.saveFieldPermissions("config", requested), "cross tenant form cannot be bound");
        form.setTenantId(100000L); allowed[1] = false;
        rejects(() -> service.saveFieldPermissions("config", requested), "configuration writer permission enforced");
        allowed[1] = true; UserContext.setTenantId(200000L);
        rejects(() -> service.selectableNodes("config", "first"), "cross tenant upstream lookup denied");
        rejects(() -> service.startAssigneeNodes("config"), "cross tenant selected-user lookup denied");
        rejects(() -> service.fieldPermissions("config"), "cross tenant fields read denied");
        rejects(() -> service.saveFieldPermissions("config", requested), "cross tenant fields write denied");
        UserContext.setTenantId(null);
        rejects(() -> service.fieldPermissions("config"), "missing tenant denied");
        UserContext.setTenantId(100000L);
        service.saveFieldPermissions("config", List.of());
        equal(0, saved.size(), "empty replacement clears only this definition");
        Method write = com.cloudflow.workflow.controller.WorkflowDefinitionConfigController.class.getMethod("saveFieldPermissions", String.class, List.class);
        equal("workflow:definition:edit", write.getAnnotation(cn.dev33.satoken.annotation.SaCheckPermission.class).value()[0], "field write permission code");
        equal(true, write.isAnnotationPresent(com.cloudflow.common.idempotent.annotation.RepeatSubmit.class), "field replacement repeat guard");
        equal(true, write.isAnnotationPresent(com.cloudflow.common.log.annotation.SysLog.class), "field replacement audit guard");
    }

    private static void checkInitiatorSelectedDefinitionValidation() throws Exception {
        String model = """
                {"nodes":[{"id":"start","type":"START"},
                {"id":"approval","type":"APPROVAL","approverType":"INITIATOR_SELECTED","selectableScope":{"deptIds":[10]}},
                {"id":"end","type":"END"}],
                "edges":[{"source":"start","target":"approval"},{"source":"approval","target":"end"}]}
                """;
        WorkflowGraphModelResolver graphs = new WorkflowGraphModelResolver();
        WfDefinitionServiceImpl service = new com.cloudflow.workflow.service.impl.WfDefinitionServiceImpl();
        inject(service, "workflowGraphModelResolver", graphs);
        invoke(service, "validateModelIntegrity",
                new Class<?>[]{String.class}, model);
        equal(true, graphs.validateGraphModel(model), "initiator selection validates scope without fabricated approverValue");
        equal(true, graphs.validateGraphModel(model.replace("{\"deptIds\":[10]}", "{}")), "empty scope retains active same-tenant selection");
        equal(true, graphs.validateGraphModel(model.replace("{\"deptIds\":[10]}", "{\"roleIds\":[],\"deptIds\":[]}")), "empty ID lists retain same-tenant selection");
        rejects(() -> graphs.parseRuntimeGraph(model.replace("{\"deptIds\":[10]}", "{\"roleIds\":[0]}")), "invalid scope ID rejected");
        rejects(() -> graphs.parseRuntimeGraph(model.replace("{\"deptIds\":[10]}", "{\"roleIds\":\"8\"}")), "non-array scope rejected");
    }

    private static void checkRuntimeApproverDefinitionValidation() throws Exception {
        WorkflowGraphModelResolver graphs = new WorkflowGraphModelResolver();
        WfDefinitionServiceImpl service = new WfDefinitionServiceImpl();
        inject(service, "workflowGraphModelResolver", graphs);
        for (String nodeType : List.of("APPROVAL", "MANUAL", "PARALLEL", "COPY")) {
            String model = """
                    {"nodes":[{"id":"start","type":"START"},
                    {"id":"review","type":"%s","signType":"ALL","approverType":"MULTI_LEVEL_MANAGER","directorLevel":2,"directorFallback":"TOP_LEVEL"},
                    {"id":"end","type":"END"}],
                    "edges":[{"source":"start","target":"review"},{"source":"review","target":"end"}]}
                    """.formatted(nodeType);
            for (String source : List.of("DIRECT_LEADER", "DEPT_MANAGER", "INITIATOR", "INITIATOR_SELECTED", "MULTI_LEVEL_MANAGER")) {
                String configured = model.replace("MULTI_LEVEL_MANAGER", source);
                graphs.parseRuntimeGraph(configured);
                equal(null, invoke(service, "validateModelIntegrity", new Class<?>[]{String.class}, configured),
                        nodeType + " accepts runtime assignee source " + source + " without concrete value");
            }
            for (String source : List.of("USER", "USERS", "ROLE")) {
                String missing = model.replace("MULTI_LEVEL_MANAGER", source);
                rejects(() -> invoke(service, "validateModelIntegrity", new Class<?>[]{String.class}, missing),
                        nodeType + " still rejects absent concrete value for " + source);
                rejects(() -> invoke(service, "validateModelIntegrity", new Class<?>[]{String.class},
                        missing.replace("\"directorLevel\":2", "\"approverValue\":\"  \",\"directorLevel\":2")),
                        nodeType + " still rejects blank concrete value for " + source);
            }
            for (int level : List.of(0, 11)) {
                String invalid = model.replace("\"directorLevel\":2", "\"directorLevel\":" + level);
                rejects(() -> graphs.parseRuntimeGraph(invalid), nodeType + " rejects invalid manager level " + level);
            }
            rejects(() -> graphs.parseRuntimeGraph(model.replace("TOP_LEVEL", "UNKNOWN")),
                    nodeType + " rejects invalid manager shortage policy");
            for (int level : List.of(1, 10)) {
                String boundary = model.replace("\"directorLevel\":2", "\"directorLevel\":" + level);
                graphs.parseRuntimeGraph(boundary);
                equal(null, invoke(service, "validateModelIntegrity", new Class<?>[]{String.class}, boundary),
                        nodeType + " accepts manager level boundary " + level);
            }
        }
    }

    private static void checkCompletedTaskPolicyNotes() throws Exception {
        ObjectMapper json = new ObjectMapper();
        String policy = "APPROVE_SELF_REDIRECT_FAILED_DEGRADE_TO_ALLOW";
        for (String previous : Arrays.asList(null, "", "{}",
                "{\"policyNote\":\"" + policy + "\",\"extra\":{\"count\":2,\"flags\":[true,null]},\"action\":\"OLD\",\"comment\":\"旧意见\"}")) {
            for (boolean hasRecord : List.of(true, false)) {
                if (!hasRecord && previous != null) continue;
                com.cloudflow.workflow.event.WorkflowEventListener listener = new com.cloudflow.workflow.event.WorkflowEventListener();
                WfNodeRecord record = new WfNodeRecord();
                record.setId(1L); record.setInstanceId("policy-instance"); record.setNodeKey("review");
                record.setStatus("RUNNING"); record.setExtraData(previous); record.setStartTime(LocalDateTime.now().minusSeconds(1));
                List<WfNodeRecord> writes = new ArrayList<>();
                inject(listener, "nodeRecordMapper", proxy(WfNodeRecordMapper.class, (method, arguments) -> {
                    if (method.equals("selectPage")) {
                        com.baomidou.mybatisplus.extension.plugins.pagination.Page<WfNodeRecord> page = new com.baomidou.mybatisplus.extension.plugins.pagination.Page<>();
                        page.setRecords(hasRecord ? List.of(record) : List.of()); return page;
                    }
                    equal(hasRecord ? "updateById" : "insert", method, "completion uses expected node record write");
                    writes.add((WfNodeRecord) arguments[0]); return 1;
                }));
                NodeMonitor monitor = new NodeMonitor(); monitor.setStartTime(record.getStartTime());
                inject(listener, "nodeMonitorMapper", proxy(NodeMonitorMapper.class, (method, arguments) -> {
                    if (method.equals("selectPage")) {
                        com.baomidou.mybatisplus.extension.plugins.pagination.Page<NodeMonitor> page = new com.baomidou.mybatisplus.extension.plugins.pagination.Page<>();
                        page.setRecords(List.of(monitor)); return page;
                    }
                    return 1;
                }));
                String comment = hasRecord ? "同意\"完整姓名\"\n理由" : null;
                com.cloudflow.workflow.event.TaskCompletedEvent event = new com.cloudflow.workflow.event.TaskCompletedEvent(
                        listener, "policy-instance", "policy-definition", "policy-task", "review", "审批", 2L, "审批人", "APPROVE", comment);
                event.setTaskType("APPROVAL");
                listener.onTaskCompleted(event);
                equal(1, writes.size(), "completion persists exactly one node record");
                WfNodeRecord written = writes.get(0);
                equal("COMPLETED", written.getStatus(), "node record completes");
                equal(2L, written.getExecutorId(), "node record retains completing actor");
                com.fasterxml.jackson.databind.JsonNode extra = json.readTree(written.getExtraData());
                equal("APPROVE", extra.path("action").asText(), "completion action replaces old action");
                equal(comment == null ? "" : comment, extra.path("comment").asText(), "completion comment is correctly escaped");
                if (hasRecord && previous != null && previous.contains("policyNote")) {
                    equal(policy, extra.path("policyNote").asText(), "self-redirect reason survives actual completion listener");
                    equal(json.readTree(previous).path("extra"), extra.path("extra"), "typed nested extensions survive completion");
                }
            }
        }
    }

    private static void checkConfigurationLockProtocol() {
        WfProcessDefinition earlier = lockDefinitionRow("a-definition", "a-key", "z-form", 1);
        WfProcessDefinition current = lockDefinitionRow("z-definition", "z-key", "a-form", 2);
        WfProcessDefinition deleted = lockDefinitionRow("deleted-definition", "z-key", null, 99);
        deleted.setDeleted(1);
        current.setModelJson("locked-current-model");
        List<WfProcessDefinition> definitions = List.of(earlier, deleted, current);
        Map<String, WfFormDefinition> forms = new HashMap<>();
        for (String formId : List.of("a-form", "new-form", "z-form")) {
            WfFormDefinition form = new WfFormDefinition();
            form.setFormId(formId); form.setTenantId(100000L); form.setVersionLock(7);
            forms.put(formId, form);
        }
        List<String> lockOrder = new ArrayList<>();
        boolean[] moved = {false};
        WorkflowConfigurationLockMapper lockMapper = proxy(WorkflowConfigurationLockMapper.class, (method, arguments) -> {
            equal(100000L, arguments[0], "configuration SQL is tenant scoped");
            String identifier = String.valueOf(arguments[1]);
            return switch (method) {
                case "findProcessKey" -> "z-definition".equals(identifier) ? "z-key" : null;
                case "findFormProcessKeys" -> List.of("z-key", "a-key", "z-key");
                case "lockDefinitions" -> {
                    lockOrder.add("definition:" + identifier);
                    yield definitions.stream().filter(row -> identifier.equals(row.getProcessKey()))
                            .filter(row -> !moved[0] || !"z-definition".equals(row.getDefinitionId())).toList();
                }
                case "lockForm" -> {
                    lockOrder.add("form:" + identifier);
                    yield forms.get(identifier);
                }
                case "lockStartPermissions" -> {
                    lockOrder.add("permission:" + identifier);
                    yield List.of();
                }
                default -> throw new AssertionError("unexpected configuration mapper call: " + method);
            };
        });
        WorkflowConfigurationLockService locks = new WorkflowConfigurationLockService(lockMapper);
        rejects(() -> locks.lockDefinition("z-definition"), "configuration lock requires an active transaction");
        equal(List.of(), lockOrder, "nontransactional writer performs no locking SQL");
        TransactionSynchronizationManager.setActualTransactionActive(true);
        try {
            WorkflowConfigurationLockService.LockedConfiguration locked = locks.lockForSave("z-definition", "a-key", "new-form");
            equal(List.of("definition:a-key", "definition:z-key", "form:a-form", "form:new-form", "form:z-form",
                    "permission:a-definition", "permission:deleted-definition", "permission:z-definition"),
                    lockOrder, "all sorted keys precede sorted forms and start permissions");
            equal("locked-current-model", locked.requireDefinition("z-definition").getModelJson(), "writer uses locking-read definition");
            equal(7, locked.requireBoundForm("a-form").getVersionLock(), "writer uses locking-read form version");
            equal("z-definition", locked.latest("z-key").getDefinitionId(), "deleted versions are locked but not selected");
            rejects(() -> locked.requireDefinition("deleted-definition"), "deleted definition cannot be edited");
            rejects(() -> locked.requireBoundForm("missing-form"), "missing form binding cannot be saved");
            lockOrder.clear();
            equal("a-form", locks.lockForm("a-form").getFormId(), "shared form keeps its original ID");
            equal(List.of("definition:a-key", "definition:z-key", "form:a-form", "form:z-form",
                    "permission:a-definition", "permission:deleted-definition", "permission:z-definition"),
                    lockOrder, "shared form locks deduplicated process keys before forms");
            moved[0] = true;
            rejects(() -> locks.lockDefinition("z-definition"), "concurrent process key movement requires retry");
            moved[0] = false;
            UserContext.setTenantId(null);
            rejects(() -> locks.lockDefinition("z-definition"), "configuration writer cannot omit tenant");
            UserContext.setTenantId(100000L);
            forms.get("a-form").setTenantId(200000L);
            rejects(() -> locks.lockDefinition("z-definition"), "locking read cannot expose a foreign tenant form");
        } finally {
            UserContext.setTenantId(100000L);
            TransactionSynchronizationManager.setActualTransactionActive(false);
        }
    }

    private static WfProcessDefinition lockDefinitionRow(String definitionId, String processKey, String formId, int version) {
        WfProcessDefinition definition = new WfProcessDefinition();
        definition.setDefinitionId(definitionId); definition.setProcessKey(processKey); definition.setTenantId(100000L);
        definition.setFormId(formId); definition.setVersion(version); definition.setVersionLock(4); definition.setDeleted(0);
        return definition;
    }

    private static void checkFormVersionWrite() throws Exception {
        WfFormServiceImpl service = new com.cloudflow.workflow.service.impl.WfFormServiceImpl();
        int[] writes = {0};
        WfFormDefinition saved = formWriteRequest("original-form", 6); saved.setVersion(4);
        inject(service, "formVersions", new com.cloudflow.workflow.service.WorkflowFormVersionService(null, null, null, null, null, null, null, null, null) {
            @Override public WfFormDefinition save(WfFormDefinition requested) {
                writes[0]++;
                equal("original-form", requested.getFormId(), "facade passes business ID to version service");
                if (!Integer.valueOf(5).equals(requested.getVersionLock())) throw new com.cloudflow.workflow.exception.WorkflowException("FORM_VERSION_CONFLICT", "conflict");
                return saved;
            }
        });
        WfFormDefinition request = formWriteRequest("original-form", 5);
        equal(saved, service.saveFormDefinition(request).getData(), "facade returns the complete saved version");
        equal(5, request.getVersionLock(), "facade does not pre-increment optimistic lock");
        equal(1, writes[0], "facade calls version service exactly once");
        rejects(() -> service.saveFormDefinition(formWriteRequest("original-form", 4)), "facade propagates optimistic conflict");
    }

    private static WfFormDefinition formWriteRequest(String formId, Integer versionLock) {
        WfFormDefinition request = new WfFormDefinition();
        request.setFormId(formId); request.setFormName("表单配置校验"); request.setVersionLock(versionLock);
        return request;
    }

    private static void checkCountersignRejection() throws Exception {
        WfTaskServiceImpl service = new com.cloudflow.workflow.service.impl.WfTaskServiceImpl();
        WorkflowGraphModelResolver graphs = new WorkflowGraphModelResolver();
        WfProcessInstance instance = new WfProcessInstance();
        instance.setInstanceId("vote-instance"); instance.setTenantId(100000L); instance.setDefinitionId("vote-definition");
        instance.setStatus("RUNNING"); instance.setVariables("{}"); instance.setStartUserId(1L); instance.setStartUserName("发起人");
        WfProcessDefinition definition = new WfProcessDefinition();
        definition.setDefinitionId("vote-definition"); definition.setTenantId(100000L);
        definition.setModelJson("""
                {"nodes":[{"id":"start","type":"START"},{"id":"vote","type":"PARALLEL","signType":"WEIGHT",
                "passWeight":2,"weightSource":"EQUAL","rejectStrategy":"TO_INITIATOR"},{"id":"end","type":"END"}],
                "edges":[{"source":"start","target":"vote"},{"source":"vote","target":"end"}]}
                """);
        Map<String, WfTask> tasks = new HashMap<>();
        List<WfTaskHistory> histories = new ArrayList<>();
        int[] votes = {0};
        WfTaskMapper taskMapper = proxy(WfTaskMapper.class, (method, arguments) -> {
            if (method.equals("selectById")) return tasks.get(arguments[0]);
            if (method.equals("selectList")) return new ArrayList<>(tasks.values());
            if (method.equals("deleteById")) return tasks.remove(arguments[0]) == null ? 0 : 1;
            WfTask task = (WfTask) arguments[0]; tasks.put(task.getTaskId(), task); return 1;
        });
        inject(service, "taskMapper", taskMapper);
        inject(service, "agents", WorkflowBatchBChecks.taskAgents(tasks));
        WfProcessInstanceMapper instances = proxy(WfProcessInstanceMapper.class, (method, arguments) -> method.startsWith("update") ? 1 : instance);
        inject(service, "processInstanceMapper", instances);
        inject(service, "historyState", new WorkflowHistoryState(instances));
        inject(service, "hParticipantPolicy", new WorkflowHParticipantPolicy(instances, null, null, null, null, null, null));
        inject(service, "processDefinitionMapper", proxy(WfProcessDefinitionMapper.class, (method, arguments) -> definition));
        inject(service, "nodePolicy", new WorkflowNodePolicy(instances,
                proxy(WfProcessDefinitionMapper.class, (method, arguments) -> definition), graphs));
        inject(service, "workflowGraphModelResolver", graphs);
        inject(service, "objectMapper", new ObjectMapper());
        inject(service, "securityUtils", new com.cloudflow.workflow.security.WorkflowSecurityUtils());
        inject(service, "permissionService", new WorkflowPermissionService());
        WfTaskHistoryMapper historyMapper = proxy(WfTaskHistoryMapper.class, (method, arguments) -> {
            if (method.equals("selectList")) return List.copyOf(histories);
            histories.add((WfTaskHistory) arguments[0]); return 1;
        });
        inject(service, "taskHistoryMapper", historyMapper);
        inject(service, "taskReadMapper", proxy(WfTaskReadMapper.class, (method, arguments) -> 1));
        inject(service, "taskMonitorMapper", proxy(TaskMonitorMapper.class, (method, arguments) -> method.startsWith("select") ? null : 1));
        inject(service, "processMonitorService", proxy(com.cloudflow.workflow.service.monitor.IProcessMonitorService.class, (method, arguments) -> null));
        inject(service, "sysNoticeService", proxy(com.cloudflow.common.message.api.MessageSender.class, (method, arguments) -> null));
        inject(service, "taskReminderJob", new com.cloudflow.workflow.job.TaskReminderJob() {
            @Override
            public void cancelReminders(String taskId) { }
        });
        inject(service, "auditService", new WorkflowAuditService() {
            @Override
            public void log(AuditAction action, String targetId, String detail) { }
        });
        inject(service, "workflowEventPublisher", new com.cloudflow.workflow.event.WorkflowEventPublisher(event -> { }));
        inject(service, "processStateService", new WorkflowProcessStateService(null, null, null, null, null, null, null) {
            @Override
            public void transition(WfProcessInstance current, WfProcessStatus status) { current.setStatus(status.getCode()); }
        });
        inject(service, "nodeExecutionService", proxy(INodeExecutionService.class, (method, arguments) -> {
            if (method.equals("findNode")) return graphs.parseRuntimeGraph(definition.getModelJson()).getNode((String) arguments[1]);
            if (method.equals("completeInstance")) instance.setStatus((String) arguments[1]);
            return null;
        }));
        ICountersignService countersigns = proxy(ICountersignService.class, (method, arguments) -> {
            if (method.equals("isCountersignTask")) return "CS:group".equals(((WfTask) arguments[0]).getCandidateRoles());
            if (method.equals("vote")) {
                tasks.remove(arguments[0]); votes[0]++;
                if (votes[0] == 1) return "VOTING";
                tasks.clear(); return "REJECTED";
            }
            return null;
        });
        inject(service, "countersignService", countersigns);
        WfGatewayActivationMapper activations = proxy(WfGatewayActivationMapper.class, (method, arguments) -> List.of());
        WorkflowGatewayService gateways = new WorkflowGatewayService(activations, null, new ObjectMapper(), null);
        inject(service, "gateways", gateways);
        inject(service, "rewinds", new WorkflowRewindService(activations, null, instances, taskMapper, historyMapper,
                proxy(WfTaskReadMapper.class, (method, arguments) -> 1),
                proxy(WfTaskCandidateMapper.class, (method, arguments) -> 1),
                proxy(WfTaskDelegationMapper.class, (method, arguments) -> 1),
                proxy(WfTaskAddSignMapper.class, (method, arguments) -> 1),
                proxy(WfCountersignTaskMapper.class, (method, arguments) -> null),
                proxy(WfNodeRecordMapper.class, (method, arguments) -> 1),
                proxy(TaskMonitorMapper.class, (method, arguments) -> 1), null, null, gateways, null, countersigns));
        for (String taskId : List.of("first-vote", "last-vote")) {
            WfTask task = new WfTask();
            task.setTaskId(taskId); task.setInstanceId(instance.getInstanceId()); task.setTenantId(100000L);
            task.setNodeKey("vote"); task.setNodeName("票签"); task.setStatus("TODO"); task.setTaskType("WEIGHT_SIGN");
            task.setCandidateRoles("CS:group"); task.setAssignee(1L); task.setAssigneeName("测试审批人"); task.setCreateTime(LocalDateTime.now()); tasks.put(taskId, task);
        }
        Class<?>[] completeTypes = {String.class, String.class, String.class, Map.class, String.class, Long.class, String.class};
        invoke(service, "doCompleteTask", completeTypes, "first-vote", "REJECT", "反对", Map.of(), null, 1L, null);
        equal(1, votes[0], "configured rejection still records the first weight vote");
        equal("RUNNING", instance.getStatus(), "nonfinal rejection vote does not roll back instance");
        equal(1, tasks.size(), "other voter remains pending until outcome decided");
        equal("WEIGHT_SIGN", histories.get(0).getTaskType(), "weight rejection preserves vote task type");
        invoke(service, "doCompleteTask", completeTypes, "last-vote", "REJECT", "反对", Map.of(), null, 1L, null);
        equal(2, votes[0], "final strategy application does not cast another vote");
        equal("TASK_BACK", instance.getStatus(), "final weighted rejection follows configured strategy");
        equal(1, tasks.size(), "temporary rejection task is removed within operation");
        equal("start", tasks.values().iterator().next().getNodeKey(), "initiator receives returned task");
        equal("REJECT", tasks.values().iterator().next().getTaskType(), "returned task uses rejection semantics");
        equal(List.of("WEIGHT_SIGN", "WEIGHT_SIGN", "REJECT"), histories.stream().map(WfTaskHistory::getTaskType).toList(), "vote histories and routing history remain distinct");
        instance.setStatus("PAUSED");
        WfTask returned = tasks.values().iterator().next();
        rejects(() -> invoke(service, "doRejectByStrategy", new Class<?>[]{String.class, String.class, String.class, String.class},
                returned.getTaskId(), null, "不能绕过暂停", "TERMINATE"), "paused state cannot be changed before rejection validation");
        equal("PAUSED", instance.getStatus(), "failed rejection keeps paused state intact");
    }

    private static void checkEnhancementRejectionDelegation() throws Exception {
        WorkflowP4ServiceImpl service = new com.cloudflow.workflow.service.impl.WorkflowP4ServiceImpl();
        int[] calls = {0};
        inject(service, "taskOperations", proxy(IWfTaskService.class, (method, arguments) -> {
            calls[0]++;
            equal("rejectTask", method, "enhancement delegates to authoritative task rejection");
            equal(Arrays.asList("previous-task", null, "退回修改", "TO_PREVIOUS_NODE"), Arrays.asList(arguments), "delegation preserves rejection request");
            throw WorkflowException.invalidState("injected task rejection failure");
        }));
        rejectsCode(() -> service.rejectToPrevious("previous-task", 1L, "不可信名称", "退回修改"), "INVALID_STATE", "task engine failure is propagated");
        equal(1, calls[0], "authoritative operation called once without manual task replacement");
        rejects(() -> service.rejectToPrevious("previous-task", 2L, "他人", "退回修改"), "forged operator denied before delegation");
        equal(1, calls[0], "forged operator never invokes task engine");
    }

    private static void checkNodePolicyRetryBoundary() throws Exception {
        for (String type : List.of("COPY", "SCRIPT")) {
            for (int retries : List.of(0, 3)) {
                com.cloudflow.workflow.service.impl.NodeExecutionServiceImpl service = new com.cloudflow.workflow.service.impl.NodeExecutionServiceImpl();
                int[] attempts = {0};
                int[] alarms = {0};
                com.cloudflow.workflow.handler.INodeHandler handler = new com.cloudflow.workflow.handler.INodeHandler() {
                    @Override public String getNodeType() { return type; }
                    @Override public boolean handle(WfNodeConfig node, WfProcessInstance instance, Map<String, Object> variables) {
                        attempts[0]++;
                        WorkflowNodePolicy.assertAllowed(node, "allowCc");
                        return true;
                    }
                };
                inject(service, "nodeHandlerFactory", new com.cloudflow.workflow.handler.NodeHandlerFactory(List.of(handler)));
                inject(service, "anomalyDetectionService", proxy(com.cloudflow.workflow.service.monitor.IAnomalyDetectionService.class,
                        (method, arguments) -> { alarms[0]++; return null; }));
                WfNodeConfig node = new WfNodeConfig(); node.setId("policy"); node.setType(type); node.setAllowCc(false);
                node.setRetry(Map.of("maxRetries", retries, "delayMs", 0));
                WfProcessInstance instance = new WfProcessInstance(); instance.setInstanceId("policy-retry"); instance.setStatus("RUNNING");
                rejectsCode(() -> invoke(service, "executeWithRetry", new Class<?>[]{WfNodeConfig.class, WfProcessInstance.class, Map.class},
                        node, instance, new HashMap<String, Object>()), "NODE_ACTION_FORBIDDEN", type + " policy denial escapes failure routing");
                equal(1, attempts[0], type + " disabled operation is attempted only once");
                equal(0, alarms[0], type + " policy denial does not create a technical failure alarm");
                equal("RUNNING", instance.getStatus(), type + " policy denial does not suspend or finish the instance");
                node.setAllowCc(true);
                equal(Boolean.TRUE, invoke(service, "executeWithRetry", new Class<?>[]{WfNodeConfig.class, WfProcessInstance.class, Map.class},
                        node, instance, new HashMap<String, Object>()), type + " allowed node continues normally");
            }
        }
        com.cloudflow.workflow.service.impl.NodeExecutionServiceImpl service = new com.cloudflow.workflow.service.impl.NodeExecutionServiceImpl();
        int[] attempts = {0};
        com.cloudflow.workflow.handler.INodeHandler transientHandler = new com.cloudflow.workflow.handler.INodeHandler() {
            @Override public String getNodeType() { return "COPY"; }
            @Override public boolean handle(WfNodeConfig node, WfProcessInstance instance, Map<String, Object> variables) {
                if (++attempts[0] == 1) throw new IllegalStateException("owned transient failure");
                return true;
            }
        };
        inject(service, "nodeHandlerFactory", new com.cloudflow.workflow.handler.NodeHandlerFactory(List.of(transientHandler)));
        WfNodeConfig node = new WfNodeConfig(); node.setId("transient"); node.setType("COPY");
        node.setRetry(Map.of("maxRetries", 1, "delayMs", 0));
        WfProcessInstance instance = new WfProcessInstance(); instance.setInstanceId("transient-retry");
        equal(Boolean.TRUE, invoke(service, "executeWithRetry", new Class<?>[]{WfNodeConfig.class, WfProcessInstance.class, Map.class},
                node, instance, new HashMap<String, Object>()), "ordinary transient failure still retries successfully");
        equal(2, attempts[0], "ordinary transient failure consumes the configured retry");
    }

    private static void checkInstanceDiagramProjection() throws Exception {
        com.cloudflow.workflow.service.impl.WfInstanceServiceImpl service = new com.cloudflow.workflow.service.impl.WfInstanceServiceImpl();
        WfProcessInstance instance = new WfProcessInstance(); instance.setInstanceId("diagram"); instance.setDefinitionId("diagram-definition");
        instance.setTenantId(100000L); instance.setStatus("RUNNING");
        WfProcessDefinition definition = new WfProcessDefinition(); definition.setDefinitionId("diagram-definition"); definition.setTenantId(100000L);
        definition.setModelJson("""
                {"nodes":[{"id":"start","type":"START","title":"开始"},
                  {"id":"fork","type":"PARALLEL","title":"分流","joinNodeKey":"join","props":{"secret":"DO_NOT_PROJECT"}},
                  {"id":"vote","type":"PARALLEL","title":"会签","signType":"ALL","approverValue":"DO_NOT_PROJECT"},
                  {"id":"join","type":"GATEWAY","title":"汇聚"},{"id":"end","type":"END","title":"结束"}],
                 "edges":[{"id":"begin","source":"start","target":"fork"},
                  {"id":"branch","source":"fork","target":"vote"},{"id":"return","source":"vote","target":"join"},
                  {"id":"pair","source":"fork","target":"join","isDefault":"yes"},{"id":"finish","source":"join","target":"end"}]}
                """);
        int[] permissionChecks = {0}; boolean[] allowed = {true};
        inject(service, "permissionService", new WorkflowPermissionService() {
            @Override public void checkViewInstancePermission(WfProcessInstance supplied) {
                permissionChecks[0]++;
                equal(instance, supplied, "diagram checks the actual requested instance");
                if (!allowed[0]) throw WorkflowException.permissionDenied("owned diagram denial");
            }
        });
        inject(service, "processInstanceMapper", proxy(WfProcessInstanceMapper.class, (method, arguments) -> instance));
        inject(service, "processDefinitionMapper", proxy(WfProcessDefinitionMapper.class, (method, arguments) -> definition));
        inject(service, "taskHistoryMapper", proxy(WfTaskHistoryMapper.class, (method, arguments) -> List.of()));
        inject(service, "nodeRecordMapper", proxy(WfNodeRecordMapper.class, (method, arguments) -> List.of()));
        inject(service, "taskMapper", proxy(WfTaskMapper.class, (method, arguments) -> List.of()));
        inject(service, "workflowGraphModelResolver", new WorkflowGraphModelResolver());
        com.fasterxml.jackson.databind.JsonNode diagram = new ObjectMapper().valueToTree(service.getFlowchartData("diagram"));
        equal("join", diagram.path("nodes").get(1).path("joinNodeKey").asText(), "instance diagram preserves gateway join pairing");
        equal("ALL", diagram.path("nodes").get(2).path("signType").asText(), "instance diagram distinguishes countersign from gateway");
        equal(true, diagram.path("edges").get(3).path("isDefault").asBoolean(), "instance diagram normalizes legacy default pointer");
        equal(false, diagram.toString().contains("DO_NOT_PROJECT"), "diagram never returns participant selection or arbitrary node properties");
        equal(1, permissionChecks[0], "instance authorization is mandatory before projection");
        allowed[0] = false;
        rejectsCode(() -> service.getFlowchartData("diagram"), "PERMISSION_DENIED", "unrelated caller cannot read diagram");
        equal(2, permissionChecks[0], "denied read still checks instance permission");
    }

    private static Object invoke(Object target, String name, Class<?>[] parameterTypes, Object... arguments) {
        try {
            Method method = target.getClass().getDeclaredMethod(name, parameterTypes); method.setAccessible(true);
            return method.invoke(target, arguments);
        } catch (InvocationTargetException failure) {
            if (failure.getCause() instanceof RuntimeException runtime) throw runtime;
            throw new IllegalStateException(failure.getCause());
        } catch (ReflectiveOperationException failure) {
            throw new IllegalStateException(failure);
        }
    }

    private static void inject(Object target, String name, Object value) throws Exception {
        Field field = target.getClass().getDeclaredField(name); field.setAccessible(true); field.set(target, value);
    }

    @SuppressWarnings("unchecked")
    private static <MapperType> MapperType proxy(Class<MapperType> type, BiFunction<String, Object[], Object> handler) {
        return (MapperType) Proxy.newProxyInstance(type.getClassLoader(), new Class<?>[]{type},
                (target, method, arguments) -> handler.apply(method.getName(), arguments));
    }

    private static void rejects(Runnable operation, String label) {
        try { operation.run(); }
        catch (WorkflowException expected) { checks++; return; }
        throw new AssertionError(label + ": expected workflow rejection");
    }

    private static void rejectsCode(Runnable operation, String expectedCode, String label) {
        try { operation.run(); }
        catch (WorkflowException expected) { equal(expectedCode, expected.getCode(), label + " rejection code"); return; }
        throw new AssertionError(label + ": expected workflow rejection");
    }

    private static void equal(Object expected, Object actual, String label) {
        if (!Objects.equals(expected, actual)) throw new AssertionError(label + ": expected=" + expected + ", actual=" + actual);
        checks++;
    }
}
