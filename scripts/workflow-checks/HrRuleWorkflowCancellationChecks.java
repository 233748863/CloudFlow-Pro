import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.cloudflow.workflow.security.WorkflowSecurityUtils;
import com.cloudflow.workflow.service.impl.WfInstanceServiceImpl;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.lang.reflect.Field;
import java.lang.reflect.Proxy;
import java.util.List;

public final class HrRuleWorkflowCancellationChecks {
    private static int checks;

    public static void main(String[] arguments) throws Exception {
        WfProcessInstance instance = new WfProcessInstance();
        instance.setInstanceId("batch-d-withdrawal"); instance.setTenantId(100000L);
        instance.setVersion(7);
        instance.setVariables("{\"businessType\":\"HR_TIME_REQUEST\",\"businessId\":900000}");
        WfProcessInstanceMapper mapper = (WfProcessInstanceMapper) Proxy.newProxyInstance(
                WfProcessInstanceMapper.class.getClassLoader(), new Class<?>[]{WfProcessInstanceMapper.class},
                (proxy, method, values) -> {
                    if ("selectById".equals(method.getName())) return instance;
                    throw new IllegalStateException("Cancellation replay must not mutate completed workflow: " + method.getName());
                });
        WfInstanceServiceImpl service = new WfInstanceServiceImpl();
        inject(service, "processInstanceMapper", mapper);
        inject(service, "objectMapper", new ObjectMapper());
        inject(service, "securityUtils", new WorkflowSecurityUtils());
        Long previousTenant = UserContext.getTenantId();
        try {
            UserContext.setTenantId(100000L);
            for (String status : List.of("INVALIDATED", "CANCELLED", "REJECTED", "TERMINATED", "PASSED", "AUTO_PASSED")) {
                instance.setStatus(status);
                for (int attempt = 0; attempt < 2; attempt++) {
                    if (!service.invalidateProcessByBusiness(100000L, instance.getInstanceId(), "HR_TIME_REQUEST", 900000L, "撤回重试").isSuccess()) {
                        throw new AssertionError("Completed workflow cancellation must succeed: " + status);
                    }
                    if (!status.equals(instance.getStatus()) || instance.getVersion() != 7
                            || !"{\"businessType\":\"HR_TIME_REQUEST\",\"businessId\":900000}".equals(instance.getVariables())) {
                        throw new AssertionError("Terminal workflow replay must preserve the approval fact and version");
                    }
                    checks++;
                }
            }
            fails("WorkflowException", () -> service.invalidateProcessByBusiness(100001L, instance.getInstanceId(), "HR_TIME_REQUEST", 900000L, "跨租户"));
            instance.setTenantId(100001L);
            fails("PermissionDeniedException", () -> cancel(service, instance));
            instance.setTenantId(100000L);
            fails("PermissionDeniedException", () -> service.invalidateProcessByBusiness(100000L, instance.getInstanceId(), "HR_PAYROLL_CORRECTION", 900000L, "错误业务类型"));
            fails("PermissionDeniedException", () -> service.invalidateProcessByBusiness(100000L, instance.getInstanceId(), "HR_TIME_REQUEST", 900001L, "错误业务编号"));
            instance.setVariables("{}");
            fails("WorkflowException", () -> cancel(service, instance));
            instance.setVariables("broken-json");
            fails("WorkflowException", () -> cancel(service, instance));
        } finally {
            UserContext.setTenantId(previousTenant);
        }
        System.out.println("PASS: " + checks + " HR workflow cancellation checks");
    }

    private static void cancel(WfInstanceServiceImpl service, WfProcessInstance instance) {
        service.invalidateProcessByBusiness(100000L, instance.getInstanceId(), "HR_TIME_REQUEST", 900000L, "撤回重试");
    }

    private static void fails(String exceptionType, Runnable action) {
        try {
            action.run();
        } catch (RuntimeException failure) {
            if (!failure.getClass().getSimpleName().equals(exceptionType)) throw new AssertionError("Unexpected rejection", failure);
            checks++;
            return;
        }
        throw new AssertionError("Expected " + exceptionType);
    }

    private static void inject(Object target, String name, Object value) throws Exception {
        Field field = target.getClass().getDeclaredField(name);
        field.setAccessible(true); field.set(target, value);
    }
}
