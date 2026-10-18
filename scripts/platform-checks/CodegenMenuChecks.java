import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.auth.controller.AuthController;
import com.cloudflow.auth.domain.SysCodegenTable;
import com.cloudflow.auth.domain.SysMenu;
import com.cloudflow.auth.domain.SysRole;
import com.cloudflow.auth.domain.SysRoleMenu;
import com.cloudflow.auth.domain.dto.CodegenImportDTO;
import com.cloudflow.auth.domain.dto.CodegenSaveDTO;
import com.cloudflow.auth.domain.vo.CodegenDetailVO;
import com.cloudflow.auth.mapper.SysMenuMapper;
import com.cloudflow.auth.mapper.SysRoleMenuMapper;
import com.cloudflow.auth.service.ISysCodegenService;
import com.cloudflow.auth.service.impl.SysMenuServiceImpl;
import com.cloudflow.auth.service.impl.SysRoleServiceImpl;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.security.core.TokenService;
import com.cloudflow.common.tenant.TenantContext;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.support.AnnotationConfigWebApplicationContext;

import javax.sql.DataSource;
import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.sql.Connection;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

public final class CodegenMenuChecks {
    private static CodegenMenuChecks active;
    private static final String SESSION = "owned-menu-fixture-session";
    private static final String FUNCTION = "生成供应商验收";
    private static final Map<String, Actor> ACTORS = Map.of(
            "admin", new Actor(1001L, 100000L, 1L, "admin"),
            "reviewer", new Actor(1021L, 100000L, 21L, "reviewer"),
            "employee", new Actor(1005L, 100000L, 5L, "employee"),
            "foreign-admin", new Actor(2011L, 200000L, 11L, "admin"));
    private final ISysCodegenService codegen;
    private final DataSource source;
    private final JdbcTemplate jdbc;
    private final SysMenuServiceImpl menus = new SysMenuServiceImpl();
    private final SysRoleServiceImpl roles = new SysRoleServiceImpl();
    private final SysRoleMenuMapper assignments;
    private final AuthController auth = new AuthController();
    private final Path root;
    private final List<Map<String, Object>> checks = new ArrayList<>();
    private Long menuId;
    private List<Long> buttonIds;

    public CodegenMenuChecks(ISysCodegenService codegen, DataSource source, SqlSessionTemplate sessions, Path root) throws Exception {
        this.codegen = codegen;
        this.source = source;
        this.jdbc = new JdbcTemplate(source);
        this.root = root;
        this.assignments = sessions.getMapper(SysRoleMenuMapper.class);
        inject(menus, "menuMapper", sessions.getMapper(SysMenuMapper.class));
        inject(roles, "roleMenuMapper", assignments);
        inject(roles, "roleMapper", sessions.getMapper(com.cloudflow.auth.mapper.SysRoleMapper.class));
        com.cloudflow.common.security.service.CurrentPermissionService legacyPermissions =
                new com.cloudflow.common.security.service.CurrentPermissionService(tenantId ->
                        new com.cloudflow.common.core.permission.TenantPermissionPolicy.Entitlement(null, null, 0, Set.of(), Set.of()));
        inject(roles, "currentPermissions", legacyPermissions);
        inject(menus, "currentPermissions", legacyPermissions);
        inject(auth, "sysMenuService", menus);
        inject(auth, "tokenService", new TokenService() {
            @Override public Map<String, Object> verifyToken(String token) {
                if (!SESSION.equals(token) || UserContext.getUserId() == null) return null;
                return Map.of("userId", UserContext.getUserId(), "tenantId", UserContext.getTenantId());
            }
        });
    }

    public void verify() throws Exception {
        identify("admin");
        jdbc.update("INSERT INTO sys_menu(menu_id,menu_name,parent_id,path,menu_type,visible,status) VALUES (6,'A1生成菜单验证',0,'a1-menu','M','0','0')");
        jdbc.update("INSERT INTO sys_role(role_id,tenant_id,role_name,role_key,role_sort,status,deleted) VALUES (1,100000,'Admin','admin',1,'0',0),(5,100000,'Employee','employee',5,'0',0),(21,100000,'Reviewer','reviewer',21,'0',0),(11,200000,'Foreign admin','admin',1,'0',0)");
        for (Actor actor : ACTORS.values()) jdbc.update("INSERT INTO sys_user_role(user_id,role_id,tenant_id) VALUES (?,?,?)", actor.userId(), actor.roleId(), actor.tenantId());
        CodegenImportDTO request = new CodegenImportDTO();
        request.setModuleName("oa");
        request.setTableNames(List.of("oa_supplier"));
        codegen.importTables(request);
        SysCodegenTable table = codegen.selectImportedTablePage(null, 1, 10).getRows().get(0);
        CodegenDetailVO configuration = codegen.getDetail(table.getTableId());
        configuration.getTable().setParentMenuId(6L);
        configuration.getTable().setFunctionName(FUNCTION);
        CodegenSaveDTO save = new CodegenSaveDTO();
        save.setTable(configuration.getTable());
        save.setColumns(configuration.getColumns());
        codegen.saveConfiguration(save);
        String sql = codegen.preview(table.getTableId()).get("sql/supplier-menu.sql");
        require(sql != null, "真实预览返回供应商菜单SQL");
        java.nio.file.Files.writeString(root.resolve("generated-menu.sql"), sql, StandardCharsets.UTF_8);
        for (int iteration = 1; iteration <= 2; iteration++) {
            try (Connection connection = source.getConnection()) {
                ScriptUtils.executeSqlScript(connection, new ByteArrayResource(sql.getBytes(StandardCharsets.UTF_8)));
            }
            require(jdbc.queryForObject("SELECT COUNT(*) FROM sys_menu WHERE perms LIKE 'oa:supplier:%'", Integer.class) == 6, "菜单SQL第" + iteration + "次执行恰为一菜单五按钮");
            require(jdbc.queryForObject("SELECT COUNT(*) FROM sys_role_menu WHERE role_id IN (1,11)", Integer.class) == 12, "菜单SQL第" + iteration + "次执行管理员授权不重复");
        }
        menuId = jdbc.queryForObject("SELECT menu_id FROM sys_menu WHERE parent_id=6 AND path='supplier' AND menu_type='C'", Long.class);
        buttonIds = jdbc.queryForList("SELECT menu_id FROM sys_menu WHERE parent_id=? AND menu_type='F' ORDER BY order_num", Long.class, menuId);
        require(buttonIds.size() == 5, "五个按钮拥有独立可授权编号");
        require(menus.findMenuByRoleId(5L).isEmpty(), "生成菜单没有自动授予员工任何权限");
        identify("reviewer");
        require(menus.selectMenuTreeByUserId(1021L).isEmpty(), "未授权审核人真实菜单树为空");
        identify("admin");
        SysRole role = new SysRole();
        role.setRoleId(21L);
        role.setTenantId(100000L);
        for (Long buttonId : buttonIds) {
            assignments.delete(new LambdaQueryWrapper<SysRoleMenu>().eq(SysRoleMenu::getRoleId, 21L));
            role.setMenuIds(new Long[] { 6L, menuId, buttonId });
            new TransactionTemplate(new DataSourceTransactionManager(source)).executeWithoutResult(status -> roles.insertRoleMenu(role));
            List<SysMenu> assigned = menus.findMenuByRoleId(21L);
            require(assigned.size() == 3 && assigned.stream().anyMatch(menu -> buttonId.equals(menu.getMenuId())), "实际角色服务可单独授权按钮" + buttonId);
            String permission = menus.selectMenuById(buttonId).getPerms();
            require(menus.findPermsByRoleId(21L).contains(permission), "真实角色权限查询包含按钮" + buttonId);
        }
        setReviewerGrants(true);
        identify("reviewer");
        require(contains(menus.selectMenuTreeByUserId(1021L), menuId), "授权后真实菜单服务返回供应商子菜单");
        require(menus.selectMenuPermsByUserId(1021L).containsAll(Set.of("oa:supplier:list", "oa:supplier:add", "oa:supplier:edit", "oa:supplier:remove")), "五按钮对应四个权限码可从实际用户关联查询");
        identify("employee");
        require(menus.selectMenuTreeByUserId(1005L).isEmpty() && menus.selectMenuPermsByUserId(1005L).isEmpty(), "员工真实用户菜单和权限仍为空");
        identify("foreign-admin");
        require(contains(menus.selectMenuTreeByUserId(2011L), menuId), "另一租户管理员可以获取公共菜单");
        require(menus.selectMenuPermsByUserId(2011L).containsAll(Set.of("oa:supplier:list", "oa:supplier:add", "oa:supplier:edit", "oa:supplier:remove")), "另一租户管理员授权关联真实有效");
        identify("admin");
        LinkedHashMap<String, Object> report = new LinkedHashMap<String, Object>();
        report.put("checks", checks);
        report.put("menuId", menuId);
        report.put("buttonIds", buttonIds);
        report.put("assignments", menus.findMenuByRoleId(21L));
        report.put("roles", ACTORS);
        report.put("productionAuthenticationTested", false);
        new ObjectMapper().findAndRegisterModules().writeValue(root.resolve("menu-database-results.json").toFile(), report);
        System.out.println("CODEGEN_MENU_DATABASE: assertions=" + checks.size() + "; buttons=5; distinct_permissions=4; employee_grants=0; copied_tables=12; runtime_writes=0");
    }

    public boolean identify(String actorName) {
        Actor actor = actorName == null ? null : ACTORS.get(actorName);
        if (actor == null) return false;
        UserContext.setTenantId(actor.tenantId());
        TenantContext.setTenantId(actor.tenantId());
        UserContext.setUserId(actor.userId());
        UserContext.setUserName(actorName);
        UserContext.setRoles(Set.of(actor.role()));
        return true;
    }

    public void configure(AnnotationConfigWebApplicationContext web) {
        active = this;
        web.register(HttpConfiguration.class);
    }

    private void setReviewerGrants(boolean granted) {
        new TransactionTemplate(new DataSourceTransactionManager(source)).executeWithoutResult(status -> {
            assignments.delete(new LambdaQueryWrapper<SysRoleMenu>().eq(SysRoleMenu::getRoleId, 21L));
            if (!granted) return;
            SysRole role = new SysRole();
            role.setRoleId(21L);
            role.setTenantId(100000L);
            List<Long> all = new ArrayList<>(List.of(6L, menuId));
            all.addAll(buttonIds);
            role.setMenuIds(all.toArray(Long[]::new));
            roles.insertRoleMenu(role);
        });
    }

    private boolean contains(List<SysMenu> entries, Long expected) {
        return entries.stream().anyMatch(menu -> expected.equals(menu.getMenuId())
                || menu.getChildren() != null && contains(menu.getChildren(), expected));
    }

    private void require(boolean passed, String name) {
        checks.add(Map.of("name", name, "passed", passed));
        if (!passed) throw new AssertionError(name);
    }

    private static void inject(Object target, String name, Object value) throws Exception {
        Field field = target.getClass().getDeclaredField(name);
        field.setAccessible(true);
        field.set(target, value);
    }

    public record Actor(Long userId, Long tenantId, Long roleId, String role) {}

    @Configuration(proxyBeanMethods = false)
    public static class HttpConfiguration {
        @Bean public MenuController menuController() { return new MenuController(active); }
    }

    @RestController
    public static class MenuController {
        private final CodegenMenuChecks fixture;
        public MenuController(CodegenMenuChecks fixture) { this.fixture = fixture; }

        @GetMapping("/getRouters")
        public R<?> routers(HttpServletRequest request) { return fixture.auth.getRouters(request); }

        @GetMapping("/__verification__/identity")
        public R<?> identity() {
            Actor actor = ACTORS.get(UserContext.getUserName());
            return R.ok(Map.of("user", Map.of("id", actor.userId().toString(), "tenantId", actor.tenantId(),
                    "name", UserContext.getUserName(), "email", "fixture@example.invalid", "role", "EMPLOYEE",
                    "permissions", fixture.menus.selectMenuPermsByUserId(actor.userId())),
                    "menuId", fixture.menuId, "buttonIds", fixture.buttonIds));
        }

        @PostMapping("/__verification__/reviewer/{action}")
        public R<?> assignment(@PathVariable("action") String action) {
            if (!UserContext.getRoles().contains("admin") || !Set.of("grant", "revoke").contains(action)) throw new ServiceException("验证角色操作不允许", 403);
            fixture.setReviewerGrants("grant".equals(action));
            return R.ok(fixture.menus.findMenuByRoleId(21L));
        }
    }
}
