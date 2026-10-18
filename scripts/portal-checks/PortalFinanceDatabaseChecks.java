package com.cloudflow.finance.checks;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.cloudflow.common.config.MybatisPlusConfig;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PortalFinanceAttachment;
import com.cloudflow.common.core.domain.PortalFinanceState;
import com.cloudflow.common.core.domain.PortalFinanceVO;
import com.cloudflow.common.security.portal.PortalIdentity;
import com.cloudflow.common.tenant.TenantConfigProperties;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.crm.mapper.CrmFinancePublicationMapper;
import com.cloudflow.oa.mapper.OaFinancePublicationMapper;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;

public final class PortalFinanceDatabaseChecks {
    private static int assertions;
    private final JdbcTemplate jdbc;
    private final SqlSessionTemplate sessions;
    private final TransactionTemplate transaction;
    private final PortalIdentity identity = new PortalIdentity(1L, 100000L, 1L, 1L, 0, 0);

    public static void main(String[] arguments) throws Exception {
        PortalFinanceDatabaseChecks checks = new PortalFinanceDatabaseChecks();
        try { checks.fixtures(); checks.run(true); checks.run(false); }
        finally { UserContext.clear(); TenantContext.clear(); }
        System.out.println("PORTAL_FINANCE_DATABASE_CHECKS: passed=" + assertions
                + "; failed=0; mysql=true; actual_mappers=true; production_interceptors=true; concurrent_groups=2; http=false; authentication=false; production_modified=false");
    }

    private PortalFinanceDatabaseChecks() throws Exception {
        String url = System.getenv("CF_FINANCE_DB_URL");
        String schema = System.getenv("CF_FINANCE_SCHEMA");
        if (url == null || schema == null || !schema.matches("cf_h3_finance_[a-f0-9]{32}")
                || !url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/" + schema + "\\?.*")) throw new IllegalArgumentException("Owned isolated schema required");
        DriverManagerDataSource source = new DriverManagerDataSource(url, "root", "");
        jdbc = new JdbcTemplate(source);
        String actualDirectory = Objects.requireNonNull(jdbc.queryForObject("SELECT @@datadir", String.class)).replace('\\', '/').replaceAll("/+$", "");
        String expectedDirectory = Objects.requireNonNull(System.getenv("CF_FINANCE_DATADIR")).replace('\\', '/').replaceAll("/+$", "");
        check(actualDirectory.equalsIgnoreCase(expectedDirectory), "owned database directory matches inspected process");
        check(schema.equals(jdbc.queryForObject("SELECT DATABASE()", String.class)), "isolated schema selected");
        check(jdbc.queryForObject("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE()", Integer.class) == 7, "seven exact formal tables");
        MybatisConfiguration configuration = new MybatisConfiguration(); configuration.setMapUnderscoreToCamelCase(true);
        configuration.setLogImpl(org.apache.ibatis.logging.nologging.NoLoggingImpl.class);
        configuration.addMapper(CrmFinancePublicationMapper.class); configuration.addMapper(OaFinancePublicationMapper.class);
        MybatisSqlSessionFactoryBean factory = new MybatisSqlSessionFactoryBean(); factory.setDataSource(source); factory.setConfiguration(configuration);
        factory.setPlugins(new MybatisPlusConfig(new TenantConfigProperties()).mybatisPlusInterceptor());
        factory.setMapperLocations(new Resource[]{
                new FileSystemResource("cloudflow-backend/cloudflow-service-crm/src/main/resources/mapper/CrmFinancePublicationMapper.xml"),
                new FileSystemResource("cloudflow-backend/cloudflow-service-oa/src/main/resources/mapper/OaFinancePublicationMapper.xml")});
        sessions = new SqlSessionTemplate(Objects.requireNonNull(factory.getObject()));
        transaction = new TransactionTemplate(new DataSourceTransactionManager(source));
        actor();
    }

    private void fixtures() {
        jdbc.update("INSERT INTO sys_tenant(tenant_id,tenant_code,tenant_name,status) VALUES(100000,'finance-a','finance-a','0'),(100001,'finance-b','finance-b','0')");
        jdbc.update("INSERT INTO crm_customer(customer_id,tenant_id,customer_code,customer_name,status,owner_id,dept_id) VALUES(1,100000,'a','company-a','ACTIVE',1,1),(2,100000,'b','company-b','ACTIVE',1,1),(3,100001,'c','company-c','ACTIVE',1,1)");
        jdbc.update("INSERT INTO crm_contact(contact_id,tenant_id,customer_id,contact_name,email,status) VALUES(1,100000,1,'a','a@example.test','ACTIVE'),(2,100000,1,'b','b@example.test','ACTIVE'),(3,100000,2,'c','c@example.test','ACTIVE')");
        jdbc.update("INSERT INTO sys_portal_user(portal_user_id,tenant_id,user_type,ref_biz_type,ref_biz_id,customer_id,login_account,email,password_hash,status) VALUES(1,100000,'CUSTOMER_CONTACT','CRM_CONTACT',1,1,'a','a@example.test','fixture','ACTIVE'),(2,100000,'CUSTOMER_CONTACT','CRM_CONTACT',2,1,'b','b@example.test','fixture','ACTIVE'),(3,100000,'CUSTOMER_CONTACT','CRM_CONTACT',3,2,'c','c@example.test','fixture','ACTIVE')");
        jdbc.update("INSERT INTO crm_receivable(receivable_id,tenant_id,customer_id,receivable_no,receivable_name,planned_amount,received_amount,outstanding_amount,remark) VALUES(1,100000,1,'finance-r-1','private-name',99999999999999.99,0.01,99999999999999.98,'private-note'),(2,100000,2,'finance-r-2','other-company',1,0,1,'private-note'),(3,100001,3,'finance-r-3','other-tenant',1,0,1,'private-note')");
        jdbc.update("INSERT INTO oa_invoice(invoice_id,tenant_id,customer_id,invoice_direction,invoice_code,invoice_no,gross_amount,tax_amount,remark) VALUES(1,100000,1,'OUTPUT','a','finance-i-1',9999999999999999.99,0.01,'private-note'),(2,100000,2,'OUTPUT','b','finance-i-2',1,0,'private-note'),(3,100001,3,'OUTPUT','c','finance-i-3',1,0,'private-note'),(4,100000,1,'INPUT','d','finance-i-4',1,0,'private-input')");
        for (String kind : List.of("PORTAL_FINANCE_RECEIVABLE", "PORTAL_FINANCE_INVOICE")) {
            int base = kind.endsWith("RECEIVABLE") ? 10 : 20;
            for (int index = 1; index <= 7; index++) {
                jdbc.update("INSERT INTO sys_file(file_id,tenant_id,file_name,file_size,file_type,biz_type,biz_id,access_type,portal_owner_id,deleted,create_by) VALUES(?,?,'allowed.pdf',10,'pdf',?,?,?,?,?,?)",
                        base + index, index == 2 ? 100001 : 100000, kind, index == 3 ? "2" : "1",
                        index == 4 ? "PUBLIC" : "PRIVATE", index == 5 ? 1L : null, index == 6 ? 1 : 0, index == 7 ? "other" : "finance");
            }
        }
    }

    private void run(boolean crm) throws Exception {
        Bridge records = new Bridge(crm ? sessions.getMapper(CrmFinancePublicationMapper.class) : sessions.getMapper(OaFinancePublicationMapper.class));
        long file = crm ? 11L : 21L;
        check(Boolean.TRUE.equals(records.call("activeIdentity", identity)), "active customer identity accepted");
        hidden(records, identity, 1L, "private by default");
        PortalFinanceState original = (PortalFinanceState) records.call("state", 100000L, 1L, false);
        check("ACTIVE".equals(original.getCustomerStatus()), "internal preview receives actual customer status");
        check(records.files("availableFiles", 100000L, 1L, "finance", null, false).stream().map(PortalFinanceAttachment::getFileId).toList().equals(List.of(file)), "only current uploader's private files for this document and tenant are selectable");
        check(records.files("availableFiles", 100000L, 1L, "finance", List.of(), false).isEmpty(), "empty requested selection selects no files");
        check(records.files("availableFiles", 100000L, 1L, "finance", List.of(file, file + 6), true).size() == 1, "another uploader cannot be selected");
        Integer published = transaction.execute(status -> (Integer) records.call("publish", 100000L, 1L, 0, 7L, "finance", "[\"" + file + "\"]"));
        check(Integer.valueOf(1).equals(published), "conditional publication commits");
        PortalFinanceState publicState = (PortalFinanceState) records.call("portalDetail", identity, 1L);
        check(publicState != null && publicState.getVersion() == 1 && publicState.getPublicVersion() == 1, "public confirmation and business version advance together");
        PortalFinanceVO view = publicState.getRecord();
        check((crm ? view.getPlannedAmount() : view.getGrossAmount()).equals(crm ? "99999999999999.99" : "9999999999999999.99"), "maximum source amount remains exact after actual SQL mapping");
        Page<?> page = (Page<?>) records.call("opened", new Page<PortalFinanceVO>(1, 1), identity, "finance-");
        check(page.getTotal() == 1 && page.getRecords().size() == 1, "pagination total and records share publication scope");
        check(((Page<?>) records.call("opened", new Page<PortalFinanceVO>(2, 1), identity, "finance-")).getRecords().isEmpty(), "second page cannot reveal hidden records");
        check(records.files("publicFiles", identity, 1L).size() == 1, "only explicitly approved file returned");
        check(records.call("portalDetail", new PortalIdentity(2L, 100000L, 1L, 2L, 0, 0), 1L) != null, "same company second active contact can read");
        hidden(records, new PortalIdentity(3L, 100000L, 2L, 3L, 0, 0), 1L, "other company");
        hidden(records, new PortalIdentity(1L, 100001L, 1L, 1L, 0, 0), 1L, "forged tenant");
        hidden(records, new PortalIdentity(1L, 100000L, 1L, 1L, 1, 0), 1L, "changed session");
        hidden(records, new PortalIdentity(1L, 100000L, 1L, 1L, 0, 1), 1L, "changed contact");
        check(Integer.valueOf(0).equals(records.call("publish", 100000L, 1L, 0, 7L, "finance", "[]")), "stale writer loses version race");
        jdbc.update("UPDATE crm_contact SET status='INACTIVE' WHERE contact_id=1"); hidden(records, identity, 1L, "disabled contact"); jdbc.update("UPDATE crm_contact SET status='ACTIVE' WHERE contact_id=1");
        jdbc.update("UPDATE crm_customer SET status='INACTIVE' WHERE customer_id=1"); hidden(records, identity, 1L, "disabled company"); jdbc.update("UPDATE crm_customer SET status='ACTIVE' WHERE customer_id=1");
        jdbc.update("UPDATE sys_portal_user SET status='DISABLED' WHERE portal_user_id=1"); hidden(records, identity, 1L, "disabled portal user"); jdbc.update("UPDATE sys_portal_user SET status='ACTIVE' WHERE portal_user_id=1");
        jdbc.update("UPDATE sys_tenant SET expire_time=DATE_SUB(NOW(), INTERVAL 1 SECOND) WHERE tenant_id=100000"); hidden(records, identity, 1L, "expired tenant"); jdbc.update("UPDATE sys_tenant SET expire_time=NULL WHERE tenant_id=100000");
        jdbc.update("UPDATE sys_file SET deleted=1 WHERE file_id=?", file); check(records.files("publicFiles", identity, 1L).isEmpty(), "file deleted after confirmation is unreadable"); jdbc.update("UPDATE sys_file SET deleted=0 WHERE file_id=?", file);
        if (crm) jdbc.update("UPDATE crm_receivable SET version=version+1 WHERE receivable_id=1");
        else jdbc.update("UPDATE oa_invoice SET version=version+1 WHERE invoice_id=1");
        hidden(records, identity, 1L, "ordinary business update invalidates publication");
        concurrency(records);
        check(Integer.valueOf(1).equals(records.call("withdraw", 100000L, 1L, 3, "finance")), "withdrawal increments version once");
        hidden(records, identity, 1L, "withdrawal");
        PortalFinanceState withdrawn = (PortalFinanceState) records.call("state", 100000L, 1L, false);
        check(withdrawn.getVersion() == 4 && withdrawn.getPublicVersion() == null && withdrawn.getPublishedBy() == null && withdrawn.getPublishedTime() == null && withdrawn.getFileIdsJson() == null, "all four confirmation fields cleared");
        if (!crm) check(records.call("state", 100000L, 4L, false) == null, "input invoices cannot enter public confirmation");
    }

    private void concurrency(Bridge records) throws Exception {
        ExecutorService workers = Executors.newFixedThreadPool(2); CountDownLatch start = new CountDownLatch(1);
        try {
            Future<Integer> first = workers.submit(() -> race(records, start)); Future<Integer> second = workers.submit(() -> race(records, start));
            start.countDown(); check(first.get(20, TimeUnit.SECONDS) + second.get(20, TimeUnit.SECONDS) == 1, "concurrent publications have exactly one conditional writer");
        } finally { workers.shutdownNow(); }
    }
    private int race(Bridge records, CountDownLatch start) throws Exception {
        actor();
        try { start.await(); return Objects.requireNonNull(transaction.execute(status -> (Integer) records.call("publish", 100000L, 1L, 2, 7L, "finance", "[]"))); }
        finally { UserContext.clear(); TenantContext.clear(); }
    }
    private void hidden(Bridge records, PortalIdentity who, Long id, String label) {
        Page<?> page = (Page<?>) records.call("opened", new Page<PortalFinanceVO>(1, 10), who, null);
        check(page.getTotal() == 0 && page.getRecords().isEmpty(), label + ": list and count hidden");
        check(records.call("portalDetail", who, id) == null, label + ": detail hidden");
        check(records.files("publicFiles", who, id).isEmpty(), label + ": files hidden");
    }
    private static void actor() { UserContext.setTenantId(100000L); UserContext.setUserId(7L); UserContext.setUserName("finance"); UserContext.setDsType(0); TenantContext.setTenantId(100000L); }
    private record Bridge(Object mapper) {
        Object call(String name, Object... arguments) {
            try {
                for (Method method : mapper.getClass().getMethods()) if (method.getName().equals(name)) return method.invoke(mapper, arguments);
                throw new IllegalStateException("Missing mapper operation");
            } catch (InvocationTargetException failure) { throw new IllegalStateException("Actual finance mapper failed: " + name, failure.getCause()); }
            catch (ReflectiveOperationException failure) { throw new IllegalStateException(failure); }
        }
        List<PortalFinanceAttachment> files(String name, Object... arguments) {
            return ((List<?>) call(name, arguments)).stream().map(PortalFinanceAttachment.class::cast).toList();
        }
    }
    private static void check(boolean condition, String label) { if (!condition) throw new AssertionError(label); assertions++; }
}
