import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.hr.domain.entity.HrCompComponent;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrCompComponentMapper;
import com.cloudflow.hr.service.HrLeaveEncashmentComponentService;
import java.lang.reflect.Proxy;
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;

public final class HrLeaveEncashmentComponentChecks {
    private static int checks;

    public static void main(String[] arguments) {
        Map<Long, HrCompComponent> values = new HashMap<>();
        values.put(401L, component(401L, 100000L, 1, "CASH_A", "同名薪酬项"));
        values.put(402L, component(402L, 100000L, 1, "CASH_B", "同名薪酬项"));
        values.put(403L, component(403L, 200000L, 1, "CASH_A", "同名薪酬项"));
        values.put(404L, component(404L, 100000L, 0, "DISABLED", "停用项目"));
        HrCompComponentMapper mapper = HrCompComponentMapper.class.cast(Proxy.newProxyInstance(
                HrCompComponentMapper.class.getClassLoader(), new Class<?>[]{HrCompComponentMapper.class}, (proxy, method, parameters) -> {
                    if (!method.getName().equals("selectById")) throw new AssertionError("Unexpected component write or lookup");
                    return values.get(parameters[0]);
                }));
        HrLeaveEncashmentComponentService service = new HrLeaveEncashmentComponentService(mapper);
        try {
            UserContext.setTenantId(100000L); TenantContext.setTenantId(100000L);
            Map<String, Object> first = service.payrollIdentity(401L);
            equal("401", first.get("salaryComponentId"), "selected identity retained");
            equal("CASH_A", first.get("salaryComponentCode"), "selected code retained");
            equal("同名薪酬项", first.get("salaryComponentName"), "selected label retained");
            equal(3, first.get("salaryComponentVersion"), "component revision retained");
            equal("VERIFIED", first.get("salaryComponentIdentity"), "verified identity recorded");
            equal("402", service.payrollIdentity(402L).get("salaryComponentId"), "equal labels cannot select another item");
            values.get(401L).setComponentName("更名后"); values.get(401L).setVersion(4);
            equal("同名薪酬项", first.get("salaryComponentName"), "built payroll snapshot preserves historical name");
            equal(3, first.get("salaryComponentVersion"), "built payroll snapshot preserves revision");
            for (Long invalid : new Long[]{null, 0L, -1L, 999L, 403L, 404L}) denied(service, invalid);
            values.get(401L).setStatus(0); denied(service, 401L);
            UserContext.setTenantId(200000L); TenantContext.setTenantId(200000L);
            equal("403", service.payrollIdentity(403L).get("salaryComponentId"), "tenant uses own equal-code component");
            denied(service, 402L);
        } finally { UserContext.clear(); TenantContext.clear(); }
        System.out.println("PASS: D1 encashment component checks=" + checks);
    }

    private static HrCompComponent component(Long id, Long tenant, Integer status, String code, String name) {
        HrCompComponent value = new HrCompComponent(); value.setId(id); value.setTenantId(tenant);
        value.setStatus(status); value.setComponentCode(code); value.setComponentName(name); value.setVersion(3); return value;
    }

    private static void denied(HrLeaveEncashmentComponentService service, Long id) {
        try { service.payrollIdentity(id); throw new AssertionError("Invalid component accepted"); }
        catch (HrBusinessException expected) { equal("ENCASHMENT_COMPONENT_INVALID", expected.getCode(), "invalid component denied"); }
    }

    private static void equal(Object expected, Object actual, String label) {
        if (!Objects.equals(expected, actual)) throw new AssertionError(label);
        checks++;
    }
}
