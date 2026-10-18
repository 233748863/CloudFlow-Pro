package com.cloudflow.auth.storage;

import cn.hutool.crypto.digest.BCrypt;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;

public class ImportIntegrationFixtures {
    public static void main(String[] arguments) throws Exception {
        if (arguments.length != 2 || !arguments[0].startsWith("jdbc:mysql://127.0.0.1:")) throw new IllegalArgumentException("isolated integration database required");
        Path directory = Path.of(arguments[1]).toRealPath();
        if (!"batch-g-integration".equals(directory.getParent().getFileName().toString()) || !directory.getFileName().toString().matches("[a-f0-9]{32}")) throw new IllegalArgumentException("unexpected integration workspace");
        DriverManagerDataSource source = new DriverManagerDataSource(arguments[0], "root", "");
        JdbcTemplate jdbc = new JdbcTemplate(source);
        Path actual = Path.of(jdbc.queryForObject("SELECT @@datadir", String.class)).toRealPath();
        if (!actual.equals(directory.resolve("mysql-data").toRealPath())) throw new IllegalArgumentException("database data directory is not isolated");
        if (jdbc.queryForObject("SELECT COUNT(*) FROM sys_user WHERE user_name LIKE 'g_import_%'", Integer.class) != 0) throw new IllegalStateException("integration fixtures already exist");
        List<Map<String, Object>> accounts = new ArrayList<>();
        TransactionTemplate transaction = new TransactionTemplate(new DataSourceTransactionManager(source));
        transaction.execute(status -> {
            jdbc.update("INSERT INTO sys_tenant (tenant_id, tenant_code, tenant_name, status, user_limit, storage_limit, storage_used, deleted, expire_time) VALUES (100001, 'g-other', '导入隔离租户', '0', 1000, 10240, 0, 0, DATE_ADD(NOW(), INTERVAL 1 YEAR))");
            jdbc.update("INSERT INTO sys_dept (dept_id, tenant_id, dept_name, status, deleted) VALUES (990000101, 100001, '隔离部门', '0', 0)");
            jdbc.update("INSERT INTO sys_role (role_id, tenant_id, role_name, role_key, role_sort, data_scope, ds_type, status, deleted) VALUES (990000701, 100001, '隔离租户管理员', 'admin', 1, '1', 0, '0', 0), (990000702, 100000, '导入只读检查', 'g_import_readonly', 10, '1', 0, '0', 0)");
            jdbc.update("INSERT INTO sys_role_menu (role_id, menu_id, tenant_id) SELECT 990000701, menu_id, 100001 FROM sys_role_menu WHERE role_id = 1 AND tenant_id = 100000 AND menu_id NOT IN (1970,1971,1972,1973,1974,1975,1976,1987,1988)");
            jdbc.update("INSERT INTO sys_role_menu (role_id, menu_id, tenant_id) VALUES (990000702, 6, 100000), (990000702, 900, 100000), (990000702, 902, 100000), (990000702, 1756, 100000)");
            accounts.add(account(jdbc, 990000701, 100000, 100, "g_import_admin", "xinyuan", 1));
            accounts.add(account(jdbc, 990000702, 100000, 100, "g_import_other", "xinyuan", 1));
            accounts.add(account(jdbc, 990000703, 100001, 990000101, "g_import_tenant", "g-other", 990000701));
            accounts.add(account(jdbc, 990000704, 100000, 100, "g_import_readonly", "xinyuan", 990000702));
            accounts.add(account(jdbc, 990000705, 100000, 100, "g_holiday_hr", "xinyuan", 4));
            accounts.add(account(jdbc, 990000706, 100000, 100, "g_holiday_manager", "xinyuan", 2));
            accounts.add(account(jdbc, 990000707, 100000, 100, "g_holiday_employee", "xinyuan", 5));
            accounts.add(account(jdbc, 990000708, 100000, 100, "g_opportunity_sales", "xinyuan", 9));
            accounts.add(account(jdbc, 990000709, 100000, 100, "g_opportunity_manager", "xinyuan", 8));
            jdbc.update("INSERT INTO hr_employee (id, tenant_id, employee_no, name, gender, dept_id, user_id, employee_status) VALUES (990000701, 100000, 'G_IMPORT_OWNER', '导入验收负责人', 'MALE', 100, 990000701, 'REGULAR')");
            jdbc.update("INSERT INTO hr_employee (id, tenant_id, employee_no, name, gender, dept_id, user_id, employee_status) VALUES (990000708, 100000, 'G_OPPORTUNITY_SALES', '商机验收销售', 'MALE', 100, 990000708, 'REGULAR'), (990000709, 100000, 'G_OPPORTUNITY_MANAGER', '商机验收主管', 'MALE', 100, 990000709, 'REGULAR')");
            jdbc.update("INSERT INTO sys_holiday_calendar (calendar_id, tenant_id, calendar_code, calendar_name, status) VALUES (990000701, 100000, 'G_IMPORT_CALENDAR', '导入验收日历', 'ENABLED')");
            jdbc.update("INSERT INTO oa_asset_category (category_id, tenant_id, category_code, category_name, default_useful_life_months, default_salvage_rate, status) VALUES (990000701, 100000, 'G_IMPORT_ASSET', '导入验收资产分类', 36, 0.05, 'ACTIVE')");
            jdbc.update("INSERT INTO oa_supplier_category (category_id, tenant_id, category_code, category_name, status) VALUES (990000701, 100000, 'G_IMPORT_SUPPLIER', '导入验收供应商分类', 'ACTIVE')");
            return null;
        });
        Path credentials = directory.resolve("private");
        Files.createDirectories(credentials);
        new ObjectMapper().writeValue(credentials.resolve("accounts.json").toFile(), accounts);
        System.out.println("Integration fixture accounts prepared in verified isolated database; credentials not logged.");
    }

    private static Map<String, Object> account(JdbcTemplate jdbc, long userId, long tenantId, long departmentId, String username, String tenantCode, long roleId) {
        byte[] entropy = new byte[9];
        new SecureRandom().nextBytes(entropy);
        String password = "G9!a" + Base64.getUrlEncoder().withoutPadding().encodeToString(entropy);
        jdbc.update("INSERT INTO sys_user (user_id, tenant_id, dept_id, user_name, nick_name, password, status, deleted, pwd_reset_required, create_time) VALUES (?, ?, ?, ?, ?, ?, '0', 0, '0', NOW())",
                userId, tenantId, departmentId, username, username, BCrypt.hashpw(password));
        jdbc.update("INSERT INTO sys_user_role (user_id, role_id, tenant_id) VALUES (?, ?, ?)", userId, roleId, tenantId);
        return Map.of("userId", userId, "tenantId", tenantId, "username", username, "tenantCode", tenantCode, "password", password);
    }
}
