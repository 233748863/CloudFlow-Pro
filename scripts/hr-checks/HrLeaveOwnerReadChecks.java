import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.AbstractWrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.hr.domain.entity.HrEmployee;
import com.cloudflow.hr.domain.entity.HrLeaveQuota;
import com.cloudflow.hr.domain.entity.HrTimeRequest;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrEmployeeMapper;
import com.cloudflow.hr.mapper.HrLeaveQuotaMapper;
import com.cloudflow.hr.mapper.HrTimeRequestMapper;
import com.cloudflow.hr.service.HrLeaveBusinessService;
import java.lang.reflect.Constructor;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.apache.ibatis.builder.MapperBuilderAssistant;

public final class HrLeaveOwnerReadChecks {
    private static int checks;
    private static int dataReads;

    public static void main(String[] arguments) throws Exception {
        for (Class<?> entity : List.of(HrEmployee.class, HrLeaveQuota.class, HrTimeRequest.class)) {
            TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), "leave-owner-checks"), entity);
        }
        HrEmployee employee = new HrEmployee();
        employee.setId(401L); employee.setTenantId(100000L); employee.setUserId(501L); employee.setDeleted(0);
        HrLeaveQuota quota = new HrLeaveQuota();
        quota.setId(601L); quota.setEmployeeId(401L); quota.setTenantId(100000L); quota.setTotalQuota(new BigDecimal("8.00"));
        quota.setCreateBy("hr-administrator");
        HrTimeRequest request = new HrTimeRequest();
        request.setId(701L); request.setEmployeeId(401L); request.setTenantId(100000L); request.setRequestType("LEAVE");
        request.setCreateBy("hr-administrator");
        Map<Class<?>, Object> beans = Map.of(
                HrEmployeeMapper.class, proxy(HrEmployeeMapper.class, (object, method, values) -> {
                    if (method.getName().equals("selectById")) return Long.valueOf(401L).equals(values[0]) ? employee : null;
                    throw new AssertionError("Unexpected employee mapper operation");
                }),
                HrLeaveQuotaMapper.class, proxy(HrLeaveQuotaMapper.class, (object, method, values) -> {
                    require(method.getName().equals("selectList"), "quota read cannot write");
                    inspect((AbstractWrapper<?, ?, ?>) values[0], false); dataReads++; return List.of(quota);
                }),
                HrTimeRequestMapper.class, proxy(HrTimeRequestMapper.class, (object, method, values) -> {
                    require(method.getName().equals("selectList"), "request read cannot write");
                    inspect((AbstractWrapper<?, ?, ?>) values[0], true); dataReads++; return List.of(request);
                }));
        Constructor<?> constructor = HrLeaveBusinessService.class.getConstructors()[0];
        Class<?>[] types = constructor.getParameterTypes();
        Object[] dependencies = new Object[types.length];
        for (int index = 0; index < types.length; index++) dependencies[index] = beans.get(types[index]);
        HrLeaveBusinessService service = (HrLeaveBusinessService) constructor.newInstance(dependencies);
        try {
            TenantContext.setTenantId(100000L); UserContext.setTenantId(100000L); UserContext.setUserId(501L);
            UserContext.setUserName("employee"); UserContext.setRoles(Set.of("employee"));
            for (Integer scope : List.of(0, 1, 2, 3, 4)) {
                UserContext.setDsType(scope);
                require(service.ownQuotas(401L).equals(List.of(quota)), "administrator-created own quota is readable for scope " + scope);
                require(service.ownRequests(401L).equals(List.of(request)), "administrator-created own request is readable for scope " + scope);
            }
            int beforeDenied = dataReads;
            UserContext.setUserId(999L);
            denied(service, 401L, "FORBIDDEN_CROSS_EMPLOYEE");
            UserContext.setRoles(Set.of("admin"));
            denied(service, 401L, "FORBIDDEN_CROSS_EMPLOYEE");
            UserContext.setUserId(501L); employee.setUserId(null);
            denied(service, 401L, "FORBIDDEN_CROSS_EMPLOYEE");
            employee.setUserId(501L); employee.setTenantId(200000L);
            denied(service, 401L, "EMPLOYEE_NOT_FOUND");
            employee.setTenantId(100000L); employee.setDeleted(1);
            denied(service, 401L, "EMPLOYEE_NOT_FOUND");
            employee.setDeleted(0);
            denied(service, 999L, "EMPLOYEE_NOT_FOUND");
            UserContext.setUserId(null);
            denied(service, 401L, "UNAUTHORIZED");
            require(dataReads == beforeDenied, "denied identities cannot read quota or request mappers");
        } finally { UserContext.clear(); TenantContext.clear(); }
        System.out.println("PASS: D1 leave owner read checks=" + checks);
    }

    private static void inspect(AbstractWrapper<?, ?, ?> wrapper, boolean request) {
        String query = wrapper.getSqlSegment();
        Map<String, Object> values = wrapper.getParamNameValuePairs();
        require(query.contains("tenant_id =") && values.containsValue(100000L), "query restricts tenant");
        require(query.contains("employee_id =") && values.containsValue(401L), "query restricts current employee");
        require(query.contains("deleted =") && values.containsValue(0), "query excludes deleted records");
        require(!query.contains("create_by"), "creator does not replace owner visibility");
        require(!request || query.contains("request_type =") && values.containsValue("LEAVE"), "request query excludes other request types");
    }

    private static void denied(HrLeaveBusinessService service, Long employeeId, String code) {
        for (boolean quota : List.of(true, false)) {
            try {
                if (quota) service.ownQuotas(employeeId); else service.ownRequests(employeeId);
                throw new AssertionError("Owner read should have been denied");
            } catch (HrBusinessException expected) { require(code.equals(expected.getCode()), "owner denial uses " + code); }
        }
    }

    private static <T> T proxy(Class<T> type, InvocationHandler handler) {
        return type.cast(Proxy.newProxyInstance(type.getClassLoader(), new Class<?>[]{type}, handler));
    }

    private static void require(boolean value, String label) {
        if (!value) throw new AssertionError(label);
        checks++;
    }
}
