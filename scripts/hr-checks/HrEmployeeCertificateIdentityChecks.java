package com.cloudflow.hr.checks;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.redis.config.RuntimeSysConfigService;
import com.cloudflow.hr.client.WorkflowServiceClient;
import com.cloudflow.hr.client.dto.ProcessStartDTO;
import com.cloudflow.hr.domain.entity.HrCertificateRequest;
import com.cloudflow.hr.domain.entity.HrEmployee;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrCertificateRequestMapper;
import com.cloudflow.hr.mapper.HrEmployeeMapper;
import com.cloudflow.hr.service.impl.HrCertificateServiceImpl;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

public final class HrEmployeeCertificateIdentityChecks {
    private static int checks;

    public static void main(String[] arguments) {
        AtomicReference<HrEmployee> current = new AtomicReference<>();
        AtomicInteger starts = new AtomicInteger();
        AtomicInteger bindings = new AtomicInteger();
        AtomicReference<ProcessStartDTO> started = new AtomicReference<>();
        HrEmployeeMapper employees = proxy(HrEmployeeMapper.class, (target, method, values) -> {
            equal("selectById", method.getName(), "only load employee");
            equal(7654321L, values[0], "load request employee");
            return current.get();
        });
        HrCertificateRequestMapper requests = proxy(HrCertificateRequestMapper.class, (target, method, values) -> {
            equal("update", method.getName(), "bind only after workflow success"); bindings.incrementAndGet(); return 1;
        });
        WorkflowServiceClient workflow = proxy(WorkflowServiceClient.class, (target, method, values) -> {
            equal("startProcess", method.getName(), "existing workflow entry");
            starts.incrementAndGet(); started.set((ProcessStartDTO) values[0]); return R.ok("certificate-test-instance");
        });
        RuntimeSysConfigService configuration = new RuntimeSysConfigService(null) {
            @Override public String getString(String key, String defaultValue) { return defaultValue; }
        };
        HrCertificateServiceImpl service = new HrCertificateServiceImpl(requests, employees, null, null, null, null,
                workflow, null, new ObjectMapper(), configuration);
        HrCertificateRequest request = new HrCertificateRequest();
        request.setId(777L); request.setTenantId(100000L); request.setEmployeeId(7654321L); request.setRequestNo("CERT-IDENTITY-TEST");
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
            try { service.startCertificateWorkflow(request); throw new AssertionError("Invalid employee accepted: " + scenario); }
            catch (HrBusinessException expected) { checks++; }
            equal(0, starts.get(), scenario + " creates no workflow"); equal(0, bindings.get(), scenario + " creates no binding");
        }
        current.set(employee()); service.startCertificateWorkflow(request);
        equal(1, starts.get(), "one workflow call"); equal(1, bindings.get(), "one instance binding");
        equal(12345L, started.get().getStartUserId(), "account ID used instead of employee ID");
        equal(100000L, started.get().getTenantId(), "tenant preserved"); equal(777L, started.get().getBusinessId(), "request ID preserved");
        equal("HR_CERTIFICATE_REQUEST", started.get().getBusinessType(), "business type preserved");
        System.out.println("EMPLOYEE_CERTIFICATE_IDENTITY_CHECKS: scenarios=7; checks=" + checks + "; failed=0; mapper_and_workflow_doubles=true; actual_http=false");
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
