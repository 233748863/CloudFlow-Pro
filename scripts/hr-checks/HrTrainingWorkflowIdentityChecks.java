package com.cloudflow.hr.checks;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.redis.config.RuntimeSysConfigService;
import com.cloudflow.hr.client.WorkflowServiceClient;
import com.cloudflow.hr.client.dto.ProcessStartDTO;
import com.cloudflow.hr.domain.entity.HrEmployee;
import com.cloudflow.hr.domain.entity.HrTrainingEnrollment;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrEmployeeMapper;
import com.cloudflow.hr.mapper.HrTrainingEnrollmentMapper;
import com.cloudflow.hr.service.impl.HrTrainingEnrollmentServiceImpl;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

public final class HrTrainingWorkflowIdentityChecks {
    private static int checks;

    public static void main(String[] arguments) {
        AtomicReference<HrEmployee> current = new AtomicReference<>();
        AtomicInteger starts = new AtomicInteger();
        AtomicInteger bindings = new AtomicInteger();
        AtomicReference<ProcessStartDTO> started = new AtomicReference<>();
        HrEmployeeMapper employees = proxy(HrEmployeeMapper.class, (target, method, values) -> {
            equal("selectById", method.getName(), "load employee directory");
            equal(7654321L, values[0], "load actual enrolled employee");
            return current.get();
        });
        HrTrainingEnrollmentMapper enrollments = proxy(HrTrainingEnrollmentMapper.class, (target, method, values) -> {
            equal("update", method.getName(), "bind after workflow success"); bindings.incrementAndGet(); return 1;
        });
        WorkflowServiceClient workflow = proxy(WorkflowServiceClient.class, (target, method, values) -> {
            equal("startProcess", method.getName(), "existing workflow entry");
            starts.incrementAndGet(); started.set((ProcessStartDTO) values[0]); return R.ok("training-test-instance");
        });
        RuntimeSysConfigService configuration = new RuntimeSysConfigService(null) {
            @Override public String getString(String key, String defaultValue) { return defaultValue; }
        };
        HrTrainingEnrollmentServiceImpl service = new HrTrainingEnrollmentServiceImpl(enrollments, null, employees, null,
                workflow, null, null, new ObjectMapper(), configuration, null);
        HrTrainingEnrollment enrollment = new HrTrainingEnrollment();
        enrollment.setId(777L); enrollment.setTenantId(100000L); enrollment.setEmployeeId(7654321L);
        enrollment.setSessionId(888L); enrollment.setEnrollType("SELF");
        for (String scenario : new String[]{"missing", "deleted", "wrong-tenant", "unbound", "zero-account", "negative-account"}) {
            HrEmployee employee = employee();
            switch (scenario) {
                case "missing" -> employee = null;
                case "deleted" -> employee.setDeleted(1);
                case "wrong-tenant" -> employee.setTenantId(100001L);
                case "unbound" -> employee.setUserId(null);
                case "zero-account" -> employee.setUserId(0L);
                case "negative-account" -> employee.setUserId(-1L);
                default -> throw new AssertionError("Unknown scenario");
            }
            current.set(employee);
            try { service.startTrainingEnrollmentWorkflow(enrollment); throw new AssertionError("Invalid employee accepted: " + scenario); }
            catch (HrBusinessException expected) { checks++; }
            equal(0, starts.get(), scenario + " creates no workflow"); equal(0, bindings.get(), scenario + " creates no binding");
        }
        current.set(employee()); service.startTrainingEnrollmentWorkflow(enrollment);
        equal(1, starts.get(), "one workflow call"); equal(1, bindings.get(), "one instance binding");
        equal(12345L, started.get().getStartUserId(), "bound account starts approval");
        equal(7654321L, started.get().getVariables().get("employeeId"), "employee remains business subject");
        equal(888L, started.get().getVariables().get("sessionId"), "session preserved");
        equal(100000L, started.get().getTenantId(), "tenant preserved"); equal(777L, started.get().getBusinessId(), "enrollment preserved");
        equal("HR_TRAINING_ENROLLMENT", started.get().getBusinessType(), "business type preserved");
        System.out.println("TRAINING_WORKFLOW_IDENTITY_CHECKS: scenarios=7; checks=" + checks + "; failed=0; mapper_and_workflow_doubles=true; actual_http=false");
    }

    private static HrEmployee employee() {
        HrEmployee employee = new HrEmployee(); employee.setId(7654321L); employee.setTenantId(100000L);
        employee.setUserId(12345L); employee.setDeleted(0); return employee;
    }
    private static <T> T proxy(Class<T> type, InvocationHandler handler) {
        return type.cast(Proxy.newProxyInstance(type.getClassLoader(), new Class<?>[]{type}, handler));
    }
    private static void equal(Object expected, Object actual, String label) {
        if (!Objects.equals(expected, actual)) throw new AssertionError(label + ": " + actual); checks++;
    }
}
