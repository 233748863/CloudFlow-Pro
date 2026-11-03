import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.workflow.callback.registry.BusinessTypeRegistry;
import com.cloudflow.workflow.config.WorkflowBusinessTypeContributor;
import com.cloudflow.workflow.config.properties.WorkflowProperties;
import com.cloudflow.workflow.domain.WfProcessDefinition;
import com.cloudflow.workflow.domain.dto.ValidationResultDTO;
import com.cloudflow.workflow.domain.dto.WorkflowExportFormat;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.mapper.WfProcessDefinitionMapper;
import com.cloudflow.workflow.model.WorkflowGraphModelResolver;
import com.cloudflow.workflow.service.IVersionService;
import com.cloudflow.workflow.service.ScriptExecutionPolicy;
import com.cloudflow.workflow.service.WorkflowStartPermissions;
import com.cloudflow.workflow.service.WorkflowTriggerSecrets;
import com.cloudflow.workflow.service.impl.ExportServiceImpl;
import com.cloudflow.workflow.util.ExportFormatUtil;
import com.cloudflow.workflow.util.VersionNumberGenerator;
import com.cloudflow.workflow.validator.ImportValidator;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.lang.reflect.Field;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import org.apache.ibatis.builder.MapperBuilderAssistant;

/** 运行实际导出与预检入口；存储读取受控，不连接服务或数据库。 */
public final class WorkflowIntegrationChecks {
    private static int checks;
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String MODEL = """
            {"nodes":[{"id":"start","type":"START","title":"开始"},
                       {"id":"end","type":"END","title":"结束"}],
             "edges":[{"id":"edge","source":"start","target":"end"}]}
            """;

    public static void main(String[] arguments) throws Exception {
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), "integration"), WfProcessDefinition.class);
        UserContext.setTenantId(100L);
        UserContext.setUserId(10L);
        try {
            roundTripAndPreflight();
            scriptAndVersion();
            businessRegistration();
            System.out.println("PASS: Workflow integration checks=" + checks + "; actual_database=false");
        } finally {
            UserContext.clear();
        }
    }

    private static void roundTripAndPreflight() throws Exception {
        WfProcessDefinition definition = new WfProcessDefinition();
        definition.setDefinitionId("export-1");
        definition.setTenantId(100L);
        definition.setProcessName("导入导出流程");
        definition.setProcessKey("import_export");
        definition.setFormId("form-1");
        definition.setDeptId(20L);
        definition.setStartPermissionType("ROLE");
        definition.setStartPermissionValue("[\"9007199254740993\"]");
        definition.setModelJson(MODEL);
        WfProcessDefinitionMapper definitions = proxy(WfProcessDefinitionMapper.class, (target, method, values) -> {
            if (method.getName().equals("selectById")) return definition;
            if (method.getName().equals("selectOne")) return null;
            throw new AssertionError("unexpected storage operation " + method.getName());
        });
        ExportServiceImpl exporter = new ExportServiceImpl();
        inject(exporter, "definitionMapper", definitions);
        inject(exporter, "versionService", proxy(IVersionService.class, (target, method, values) -> null));
        inject(exporter, "objectMapper", JSON);
        inject(exporter, "triggerSecrets", new WorkflowTriggerSecrets("0123456789abcdef", JSON));
        ImportValidator validator = new ImportValidator();
        inject(validator, "definitionMapper", definitions);
        inject(validator, "workflowGraphModelResolver", new WorkflowGraphModelResolver());

        WorkflowExportFormat exported = exporter.exportWorkflow("export-1", false);
        WorkflowExportFormat restored = ExportFormatUtil.deserialize(ExportFormatUtil.serialize(exported));
        equal("import_export", restored.getWorkflow().getProcessKey(), "process key survives export serialization");
        equal("form-1", restored.getWorkflow().getFormId(), "form binding survives export serialization");
        equal(20L, restored.getWorkflow().getDeptId(), "department survives export serialization");
        equal("ROLE", restored.getWorkflow().getStartPermissionType(), "permission type uses standard field");
        equal("[\"9007199254740993\"]", restored.getWorkflow().getStartPermissionValue(), "permission identity retains integer precision");
        equal(Set.of("createdAt", "updatedAt", "createdBy", "status"), restored.getWorkflow().getMetadata().keySet(), "metadata only holds supplemental fields");
        equal(true, ExportFormatUtil.verifyChecksum(restored), "round trip preserves checksum");
        equal(true, validator.validate(restored).getValid(), "standard export passes real preflight");

        for (String type : List.of("ROLE", "USER", "DEPT")) {
            restored.getWorkflow().setStartPermissionType(type);
            restored.getWorkflow().setStartPermissionValue("[\"9007199254740993\",\"9223372036854775807\"]");
            equal(true, validator.validate(restored).getValid(), "preflight accepts explicit identity type " + type);
        }
        for (String invalid : List.of("[1]", "[\"manager\"]", "1,2", "[]", "[\"1\",\"1\"]", "[\"9223372036854775808\"]", "[\"1\"] []")) {
            restored.getWorkflow().setStartPermissionValue(invalid);
            ValidationResultDTO rejected = validator.validate(restored);
            equal(false, rejected.getValid(), "preflight rejects invalid permission protocol " + invalid);
            equal(true, !rejected.getErrors().isEmpty(), "invalid permission is an error rather than a warning");
        }
        restored.getWorkflow().setStartPermissionType(null);
        restored.getWorkflow().setStartPermissionValue(null);
        restored.getWorkflow().getMetadata().put("startPermissionType", "ALL");
        restored.getWorkflow().getMetadata().put("startPermissionValue", "");
        equal(false, validator.validate(restored).getValid(), "metadata cannot supply missing mandatory permission fields");
        restored.getWorkflow().setStartPermissionType("ALL");
        equal(true, validator.validate(restored).getValid(), "ALL accepts omitted objects");
        restored.getWorkflow().setStartPermissionValue("");
        equal(true, validator.validate(restored).getValid(), "ALL accepts empty objects");
        restored.getWorkflow().setStartPermissionValue("[]");
        equal(false, validator.validate(restored).getValid(), "ALL does not silently convert an array");
        definition.setStartPermissionType("ALL");
        definition.setStartPermissionValue(null);
        WorkflowStartPermissions.validate(definition);
        equal("", definition.getStartPermissionValue(), "save normalization is retained");
        definition.setTenantId(200L);
        rejects(() -> exporter.exportWorkflow("export-1", true), "other tenant export is denied");
        definition.setTenantId(100L);
        definition.setModelJson("{broken");
        rejects(() -> exporter.exportWorkflow("export-1", true), "invalid JSON is not exported as a raw string");

        definition.setModelJson(MODEL.replace("\"edges\":", "\"password\":\"sensitive-probe\",\"edges\":"));
        WorkflowExportFormat masked = exporter.exportWorkflow("export-1", false);
        equal(false, ExportFormatUtil.serialize(masked).contains("sensitive-probe"), "default export retains secret masking");
    }

    private static void scriptAndVersion() throws Exception {
        ScriptExecutionPolicy policy = new ScriptExecutionPolicy(new WorkflowProperties(), JSON);
        for (String type : List.of("GROOVY", "JAVASCRIPT")) {
            String model = "{\"nodes\":[{\"id\":\"script-id\",\"label\":\"legacy\",\"type\":\"SCRIPT\",\"props\":{\"scriptType\":\"" + type + "\"}}]}";
            WorkflowException failure = rejects(() -> policy.assertModelDeployable(model), "script execution restriction retained");
            equal(true, failure.getMessage().contains("[script-id]"), "script error uses standard identity without legacy label");
        }
        policy.assertModelDeployable("{\"nodes\":[{\"id\":\"api\",\"type\":\"SCRIPT\",\"props\":{\"scriptType\":\"API\"}}]}");
        checks++;
        String oldModel = "{\"nodes\":[],\"edges\":[]}";
        String standard = "{\"nodes\":[],\"edges\":[{\"source\":\"a\",\"target\":\"b\"},{\"source\":\"b\",\"target\":\"c\"},{\"source\":\"c\",\"target\":\"d\"}]}";
        equal(VersionNumberGenerator.ChangeType.MAJOR, VersionNumberGenerator.detectChangeType(oldModel, standard), "standard edge changes drive major version");
        String legacy = standard.replace("source", "from").replace("target", "to");
        equal(VersionNumberGenerator.ChangeType.MINOR, VersionNumberGenerator.detectChangeType(oldModel, legacy), "legacy edges do not trigger major version while edge-count policy remains");
    }

    private static void businessRegistration() {
        BusinessTypeRegistry registry = new BusinessTypeRegistry();
        new WorkflowBusinessTypeContributor().contribute(registry);
        equal(List.of("DETERMINING"), registry.get("HR_WORK_INJURY").getPendingStatuses(), "injury pending status matches submission");
        equal(List.of("IN_PROGRESS"), registry.get("HR_TALENT_SUCCESSION").getPendingStatuses(), "succession pending status matches submission");
        equal(true, registry.contains("OFFER"), "D offer business type remains registered");
        equal(true, registry.contains("HR_LIFECYCLE"), "onboarding uses lifecycle registration");
        equal(List.of("PLAN_APPROVING"), registry.get("HR_PERFORMANCE_PLAN").getPendingStatuses(), "plan stage uses its specific pending status");
        equal(List.of("RESULT_APPROVING"), registry.get("HR_PERFORMANCE_RESULT").getPendingStatuses(), "result stage uses its specific pending status");
    }

    private static void inject(Object target, String name, Object value) throws Exception {
        Field field = target.getClass().getDeclaredField(name);
        field.setAccessible(true);
        field.set(target, value);
    }

    private static <T> T proxy(Class<T> type, InvocationHandler handler) {
        return type.cast(Proxy.newProxyInstance(type.getClassLoader(), new Class<?>[]{type}, handler));
    }

    private static void equal(Object expected, Object actual, String message) {
        if (!Objects.equals(expected, actual)) throw new AssertionError(message + ": expected=" + expected + ", actual=" + actual);
        checks++;
    }

    private static WorkflowException rejects(Runnable action, String message) {
        try { action.run(); } catch (WorkflowException rejected) { checks++; return rejected; }
        throw new AssertionError(message);
    }
}
