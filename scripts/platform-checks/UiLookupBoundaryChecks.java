package com.cloudflow.auth.controller;

import cn.dev33.satoken.annotation.SaCheckLogin;
import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.auth.controller.system.SysDictDataController;
import com.cloudflow.auth.domain.SysDictData;
import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.auth.domain.vo.SysUserOptionVO;
import com.cloudflow.auth.mapper.SysUserMapper;
import com.cloudflow.auth.service.ISysConfigService;
import com.cloudflow.auth.service.ISysDictTypeService;
import com.cloudflow.auth.service.impl.SysUserServiceImpl;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.exception.ServiceException;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import java.io.InputStream;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import org.apache.ibatis.builder.xml.XMLMapperBuilder;

import java.lang.reflect.Proxy;
import java.util.List;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
import org.apache.ibatis.mapping.BoundSql;

public class UiLookupBoundaryChecks {
    private static int checks;

    public static void main(String[] arguments) throws Exception {
        Method optionMethod = SysDictDataController.class.getMethod("dictType", String.class);
        check(optionMethod.isAnnotationPresent(SaCheckLogin.class), "dictionary options require authentication");
        permission(SysDictDataController.class, "dictType", new Class<?>[]{String.class}, "system:lookup:read");
        permission(SysDictDataController.class, "list", new Class<?>[]{String.class}, "system:dict:list");
        permission(SysDictDataController.class, "getInfo", new Class<?>[]{Long.class}, "system:dict:query");
        permission(SysDictDataController.class, "add", new Class<?>[]{SysDictData.class}, "system:dict:add");
        permission(SysDictDataController.class, "edit", new Class<?>[]{SysDictData.class}, "system:dict:edit");
        permission(SysDictDataController.class, "remove", new Class<?>[]{Long[].class}, "system:dict:remove");

        SysDictData active = new SysDictData();
        active.setDictType("crm_check");
        active.setDictValue("ACTIVE");
        active.setDictLabel("启用");
        active.setDictSort(2);
        active.setStatus("0");
        active.setCssClass("safe-style");
        active.setListClass("success");
        active.setIsDefault("Y");
        active.setTenantId(100000L);
        active.setRiskLevel("HIGH");
        active.setRemark("private-administration-note");
        active.setCreateBy("private-operator");
        SysDictData inactive = new SysDictData();
        inactive.setDictType("crm_check");
        inactive.setDictValue("INACTIVE");
        inactive.setDictLabel("停用");
        inactive.setStatus("1");
        ISysDictTypeService service = (ISysDictTypeService) Proxy.newProxyInstance(ISysDictTypeService.class.getClassLoader(),
                new Class<?>[]{ISysDictTypeService.class}, (proxy, method, supplied) -> {
                    if ("selectDictDataByType".equals(method.getName())) return List.of(active, inactive);
                    throw new AssertionError("Unexpected dictionary operation: " + method.getName());
                });
        SysDictDataController controller = new SysDictDataController();
        Field serviceField = SysDictDataController.class.getDeclaredField("sysDictTypeService");
        serviceField.setAccessible(true);
        serviceField.set(controller, service);
        List<SysDictDataController.DictionaryOption> options = controller.dictType("crm_check").getData();
        check(options.size() == 1 && "ACTIVE".equals(options.get(0).dictValue()), "only active business options are returned");
        check("启用".equals(options.get(0).dictLabel()) && options.get(0).dictSort() == 2, "option labels and ordering remain available");
        check("success".equals(options.get(0).listClass()) && "Y".equals(options.get(0).isDefault()), "option presentation metadata remains available");
        JsonNode json = new ObjectMapper().valueToTree(options.get(0));
        for (String field : List.of("tenantId", "riskLevel", "remark", "createBy", "updateBy", "version")) {
            check(!json.has(field), "business options exclude administration field " + field);
        }

        AtomicInteger reads = new AtomicInteger();
        ISysConfigService configService = (ISysConfigService) Proxy.newProxyInstance(ISysConfigService.class.getClassLoader(),
                new Class<?>[]{ISysConfigService.class}, (proxy, method, supplied) -> {
                    if (!"selectConfigByKey".equals(method.getName())) throw new AssertionError("Unexpected config operation");
                    reads.incrementAndGet();
                    return "safe:" + supplied[0];
                });
        SysConfigController configController = new SysConfigController(configService);
        Method clientMethod = SysConfigController.class.getMethod("getClientConfig", String.class);
        check(clientMethod.isAnnotationPresent(SaCheckLogin.class), "client settings require authentication");
        permission(SysConfigController.class, "getClientConfig", new Class<?>[]{String.class}, "system:lookup:read");
        permission(SysConfigController.class, "getConfigKey", new Class<?>[]{String.class}, "system:config:query");
        permission(SysConfigController.class, "getInfo", new Class<?>[]{Long.class}, "system:config:query");
        for (String key : Set.of("sys.page.defaultPageSize", "sys.upload.maxFileSize", "sys.upload.allowedTypes",
                "sys.visitor.workflowEnabled", "sys.hr.employee.defaultCreateMode")) {
            check(("safe:" + key).equals(configController.getClientConfig(key).getData()), "explicit client key readable: " + key);
        }
        for (String key : List.of("spring.datasource.password", "sys.login.password", "sys.upload.allowedTypes.extra", "SYS.PAGE.DEFAULTPAGESIZE")) {
            int before = reads.get();
            try {
                configController.getClientConfig(key);
                throw new AssertionError("Non-client setting exposed: " + key);
            } catch (ServiceException exception) {
                check(Integer.valueOf(403).equals(exception.getCode()), "non-client settings denied with HTTP 403");
                check(reads.get() == before, "non-client settings never reach storage");
            }
        }
        userOptions();
        System.out.println("UI lookup boundary checks passed: " + checks);
    }

    private static void userOptions() throws Exception {
        Method endpoint = SysUserController.class.getMethod("options", PageQuery.class);
        check(endpoint.isAnnotationPresent(SaCheckLogin.class), "colleague options require login");
        permission(SysUserController.class, "options", new Class<?>[]{PageQuery.class}, "system:lookup:read");
        permission(SysUserController.class, "list", new Class<?>[]{SysUser.class}, "system:user:list");
        permission(SysUserController.class, "getInfo", new Class<?>[]{Long.class}, "system:user:query");
        MybatisConfiguration configuration = new MybatisConfiguration();
        String resource = "mapper/auth/SysUserMapper.xml";
        try (InputStream input = UiLookupBoundaryChecks.class.getClassLoader().getResourceAsStream(resource)) {
            if (input == null) throw new AssertionError("Missing production colleague mapper");
            new XMLMapperBuilder(input, configuration, resource, configuration.getSqlFragments()).parse();
        }
        BoundSql boundSql = configuration.getMappedStatement("com.cloudflow.auth.mapper.SysUserMapper.selectUserOptions")
                .getBoundSql(java.util.Map.of("tenantId", 100000L));
        String sql = boundSql.getSql();
        check(sql.contains("account.tenant_id = ?") && boundSql.getParameterMappings().stream().anyMatch(mapping -> "tenantId".equals(mapping.getProperty())), "colleague query explicitly binds tenant");
        check(sql.contains("department.tenant_id = account.tenant_id"), "colleague department join stays in tenant");
        check(sql.contains("account.status = '0'") && sql.contains("account.deleted = 0"), "colleague query excludes disabled and deleted users");
        for (String secret : List.of("password", "phonenumber", "email", "login_ip", "remark")) {
            check(!sql.contains(secret), "colleague query never selects " + secret);
        }
        JsonNode serialized = new ObjectMapper().valueToTree(new SysUserOptionVO(10L, "同事", 20L, "验收部门"));
        check(serialized.size() == 4 && serialized.has("userId") && serialized.has("nickName")
                && serialized.has("deptId") && serialized.has("deptName"), "colleague response contains exactly four display fields");
        AtomicInteger reads = new AtomicInteger();
        SysUserMapper mapper = (SysUserMapper) Proxy.newProxyInstance(SysUserMapper.class.getClassLoader(),
                new Class<?>[]{SysUserMapper.class}, (proxy, method, supplied) -> {
                    if (!"selectUserOptions".equals(method.getName())) throw new AssertionError("Unexpected user option query");
                    reads.incrementAndGet();
                    check(Long.valueOf(100000).equals(supplied[1]), "tenant always comes from authenticated server context");
                    Page<SysUserOptionVO> page = (Page<SysUserOptionVO>) supplied[0];
                    check(page.getSize() == 100 && page.getCurrent() == 1, "colleague query caps page size and normalizes page number");
                    page.setRecords(List.of(new SysUserOptionVO(10L, "同事", 20L, "验收部门")));
                    page.setTotal(1);
                    return page;
                });
        SysUserServiceImpl service = new SysUserServiceImpl();
        Field mapperField = SysUserServiceImpl.class.getDeclaredField("sysUserMapper");
        mapperField.setAccessible(true);
        mapperField.set(service, mapper);
        PageQuery page = new PageQuery();
        page.setPageNum(0);
        page.setPageSize(10000);
        page.getParams().put("tenantId", 200000L);
        try {
            UserContext.setUserId(10L);
            UserContext.setTenantId(100000L);
            check(service.selectUserOptions(page).getRows().size() == 1, "authenticated colleague query returns the selected page");
            UserContext.clear();
            try {
                service.selectUserOptions(page);
                throw new AssertionError("Missing user context accepted");
            } catch (ServiceException exception) {
                check(Integer.valueOf(401).equals(exception.getCode()), "missing user context fails closed");
                check(reads.get() == 1, "missing user context never queries user storage");
            }
        } finally {
            UserContext.clear();
        }
    }

    private static void permission(Class<?> controller, String method, Class<?>[] parameters, String expected) throws Exception {
        SaCheckPermission annotation = controller.getMethod(method, parameters).getAnnotation(SaCheckPermission.class);
        check(annotation != null && List.of(annotation.value()).contains(expected), "administration permission retained: " + method);
    }

    private static void check(boolean condition, String label) {
        if (!condition) throw new AssertionError(label);
        checks++;
    }
}
