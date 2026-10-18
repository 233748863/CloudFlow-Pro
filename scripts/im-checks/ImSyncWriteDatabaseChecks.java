package com.cloudflow.auth.im;

import com.cloudflow.auth.mapper.ImMapper;
import com.cloudflow.auth.mapper.ImOrganizationMapper;
import com.cloudflow.auth.oauth2.OAuthProperties;
import com.cloudflow.auth.platform.PlatformAccessProperties;
import com.cloudflow.auth.service.PasswordService;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.event.outbox.OutboxEventMapper;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.common.tenant.TenantConfigProperties;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.common.tenant.quota.TenantQuotaService;
import com.cloudflow.common.tenant.quota.mapper.TenantQuotaMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.BiFunction;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionSynchronizationManager;

final class ImSyncWriteDatabaseChecks {
    private static final long TENANT = 100000;
    private static final long ROOT = 997000;
    private static final ObjectMapper JSON = new ObjectMapper().findAndRegisterModules();
    private static int assertions;
    private final JdbcTemplate jdbc;
    private final SqlSessionTemplate sessions;
    private final ImMapper mapper;
    private final ImDatabase database;
    private final ImOrganizationMapper writes;
    private final ImConfigService configs;
    private final ImActors actors;
    private final ImConfigRules rules;
    private final ImOrgSnapshotCodec codec;
    private final ImLocalOrganizationReader reader = new ImLocalOrganizationReader(new PlatformAccessProperties(), new OAuthProperties());
    private final ImSyncPlanner planner = new ImSyncPlanner();
    private final PasswordService passwords;
    private final TenantQuotaService quotas;
    private final OutboxPublisher outbox;
    private final SysAuditLogMapper audits;
    private final AtomicBoolean failAudit;
    private final BiFunction<Long, Long, String> login;
    private final AtomicReference<String> failWrite = new AtomicReference<>();
    private final AtomicBoolean failEvent = new AtomicBoolean();
    private final ImOrganizationWriter writer;
    private final long admin;
    private final long employee;
    private long configId;

    ImSyncWriteDatabaseChecks(JdbcTemplate jdbc, ImMapper mapper, ImDatabase database, SqlSessionTemplate sessions,
            ImConfigService configs, ImActors actors, ImConfigRules rules, ImProperties properties, SysAuditLogMapper audits,
            AtomicBoolean failAudit, BiFunction<Long, Long, String> login) {
        this.jdbc = jdbc;
        this.sessions = sessions;
        this.mapper = mapper;
        this.database = database;
        this.configs = configs;
        this.actors = actors;
        this.rules = rules;
        this.audits = audits;
        this.failAudit = failAudit;
        this.login = login;
        codec = new ImOrgSnapshotCodec(new ImSecretCipher(properties));
        ImOrganizationMapper realWrites = sessions.getMapper(ImOrganizationMapper.class);
        writes = (ImOrganizationMapper) Proxy.newProxyInstance(getClass().getClassLoader(), new Class<?>[]{ImOrganizationMapper.class}, (proxy, method, arguments) -> {
            if (method.getName().equals("recoveryTargets")) {
                check(TenantContext.getTenantSkip(), "recovery directory alone can enumerate tenants");
                check(!TransactionSynchronizationManager.isActualTransactionActive(), "recovery directory holds no write transaction");
            } else {
                check(TransactionSynchronizationManager.isActualTransactionActive(), "organization statements use actual transaction");
                equal(TransactionDefinition.ISOLATION_SERIALIZABLE, TransactionSynchronizationManager.getCurrentTransactionIsolationLevel(), "serializable isolation active");
                long expectedTenant = List.of("lockTenant", "lockRun").contains(method.getName()) ? (Long) arguments[0] : TENANT;
                check(expectedTenant == TENANT || expectedTenant == 990100L, "organization lookup uses a known fixture tenant");
                equal(expectedTenant, TenantContext.getTenantId(), "organization statements retain argument tenant scope");
                check(!TenantContext.getTenantSkip(), "organization writes never bypass tenant filtering");
            }
            if (method.getName().equals(failWrite.get())) return 0;
            try { return method.invoke(realWrites, arguments); }
            catch (InvocationTargetException failure) {
                Throwable root = failure.getCause();
                while (root.getCause() != null) root = root.getCause();
                String diagnostic = root instanceof java.sql.SQLException sql ? "state=" + sql.getSQLState() + ";code=" + sql.getErrorCode() : root.getClass().getName();
                throw new AssertionError("Write statement=" + method.getName() + "; " + diagnostic, root instanceof java.sql.SQLException ? null : root);
            }
        });
        OutboxEventMapper realEvents = sessions.getMapper(OutboxEventMapper.class);
        OutboxEventMapper events = (OutboxEventMapper) Proxy.newProxyInstance(getClass().getClassLoader(), new Class<?>[]{OutboxEventMapper.class}, (proxy, method, arguments) -> {
            if (failEvent.get()) throw new IllegalStateException("controlled-event-persistence-failure");
            try { return method.invoke(realEvents, arguments); }
            catch (InvocationTargetException failure) { throw failure.getCause(); }
        });
        outbox = new OutboxPublisher(events, JSON);
        quotas = new TenantQuotaService(sessions.getMapper(TenantQuotaMapper.class));
        passwords = new PasswordService(null, audits, new TenantConfigProperties());
        writer = new ImOrganizationWriter(writes, reader, codec, quotas, passwords, outbox, JSON);
        admin = jdbc.queryForObject("SELECT MIN(user_id) FROM sys_user_role WHERE tenant_id=100000 AND role_id=1", Long.class);
        employee = jdbc.queryForObject("SELECT MIN(user_id) FROM sys_user_role WHERE tenant_id=100000 AND role_id=5", Long.class);
    }

    void run() throws Exception {
        fixtures();
        createAndRollback();
        updateAndDisable();
        preservedFields();
        scopeExit();
        stoppedManagement();
        conflictPropagation();
        multipleBatches();
        concurrentReaders();
        if ("true".equals(System.getenv("IM_CHECK_SYNC_EFFECTS"))) {
            new ImSyncEffectsDatabaseChecks(jdbc, database, sessions, writes, codec, audits, failAudit, failWrite).run(() -> {
                ImSyncRunRow run = preview(List.of(new ImOrgSnapshot.Department(2, 1, "真实安全恢复部门", 0),
                        new ImOrgSnapshot.Department(3, 2, "真实安全恢复子部门", 1)), List.of(member("writer-a", "写入甲", 3, 1)));
                step(run);
                return run;
            }, row -> { login.apply(admin, TENANT); return step(row); }, recovery ->
                new ImSyncRunnerDatabaseChecks(jdbc, database, writes, codec, this::executor, recovery, admin, login, suffix -> {
                    List<ImOrgSnapshot.Member> members = new ArrayList<>();
                    for (int index = 0; index < 102; index++) members.add(member(String.format("batch-%03d", index), "恢复" + suffix + index, 3, 1));
                    return preview(List.of(new ImOrgSnapshot.Department(2, 1, "恢复验证部门", 0),
                            new ImOrgSnapshot.Department(3, 2, "恢复验证子部门", 1)), members);
                }).run());
        }
        concurrentInsertion();
        equal(0, jdbc.queryForObject("SELECT COUNT(*) FROM sys_role_menu WHERE role_id=5 AND menu_id=1784", Integer.class), "employee never receives run permission");
        equal(11, jdbc.queryForObject("SELECT COUNT(*) FROM sys_menu WHERE menu_id BETWEEN 1780 AND 1799", Integer.class), "formal run menu retained");
        String audit = String.join("|", jdbc.queryForList("SELECT CONCAT_WS('|',before_val,after_val) FROM sys_audit_log WHERE audit_name='IM_SYNC_BATCH'", String.class));
        for (String sample : List.of("writer-a@example.test", "13988002222", "im1:", "salary-cipher-fixture")) check(!audit.contains(sample), "batch audit excludes private source values");
        System.out.println("G4_IM_SYNC_WRITE_DATABASE: assertions=" + assertions + "; failed=0; real_mysql=true; real_mybatis=true; real_transactions=true; organization_writes=true; encrypted_checkpoint=true; role_post_salary_preserved=true; source_fixture=true; effects_runner=false; complete_sync=false; production_modified=false");
    }

    private void fixtures() {
        login.apply(admin, TENANT);
        equal(1, jdbc.queryForObject("SELECT COUNT(*) FROM sys_menu WHERE menu_id=1784 AND perms='system:im:sync:run' AND status='0'", Integer.class), "formal run permission exists");
        equal(1, jdbc.queryForObject("SELECT COUNT(*) FROM sys_role_menu WHERE role_id=1 AND menu_id=1784 AND tenant_id=100000", Integer.class), "formal admin run grant exists");
        jdbc.update("INSERT INTO sys_dept(dept_id,tenant_id,parent_id,ancestors,dept_name,status,deleted,version) VALUES (?,100000,0,'0','写入专项根','0',0,0)", ROOT);
        configId = jdbc.queryForObject("SELECT config_id FROM sys_im_config WHERE tenant_id=100000 AND deleted=0", Long.class);
        ImConfigRequest request = ImConfigChecks.editRequest(config());
        ImConfigRequest.SyncScope scope = new ImConfigRequest.SyncScope();
        scope.setLocalRootDeptId(ROOT);
        scope.setRemoteDepartmentIds(List.of(2L));
        request.setSyncScope(scope);
        request.setStatus("ENABLED");
        configs.update(request);
        jdbc.update("UPDATE sys_tenant SET user_limit=0 WHERE tenant_id=100000");
    }

    void runExecution(com.sun.net.httpserver.HttpServer server, java.util.function.Consumer<String> bindToken,
            ImProperties properties) throws Exception {
        new ImSyncEffectsDatabaseChecks(jdbc, database, sessions, writes, codec, audits, failAudit, failWrite).withRuntime(runtime -> {
            fixtures();
            ImSyncRunner runner = new ImSyncRunner(executor(), runtime.recovery(), database, writes, codec);
            new ImSyncExecutionHttpChecks(jdbc, database, actors, rules, properties, audits, runner, codec,
                    runtime, login, bindToken, server, configId, admin, employee).run();
            equal(0, jdbc.queryForObject("SELECT COUNT(*) FROM sys_role_menu WHERE role_id=5 AND menu_id=1784", Integer.class), "employee run permission absent after execution checks");
        });
    }

    void runSchedule(ImProperties properties) throws Exception {
        new ImSyncEffectsDatabaseChecks(jdbc, database, sessions, writes, codec, audits, failAudit, failWrite).withRuntime(runtime -> {
            fixtures();
            ImSyncBatchExecutor batches = executor();
            ImSyncRunner runner = new ImSyncRunner(batches, runtime.recovery(), database, writes, codec);
            new ImScheduledSyncDatabaseChecks(jdbc, database, configs, actors, rules, properties, codec, audits, batches, runner,
                    login, failAudit, failWrite, configId, admin, sessions, runtime).run();
        });
    }

    private void createAndRollback() throws Exception {
        List<ImOrgSnapshot.Member> members = List.of(member("writer-a", "写入甲", 3, 1), member("writer-b", "写入乙", 3, 1),
                new ImOrgSnapshot.Member("invalid-name", "超长名称".repeat(9), List.of(3L), 1, new ImOrgSnapshot.Field(false, null), field(""), field("")));
        ImSyncRunRow run = preview(departments(), members);
        String before = digest();
        rejected(() -> executor().step(run.getSyncRunId(), run.getConfigVersion(), "0".repeat(64)), "IM_ORG_LOCAL_INVALID");
        rejected(() -> executor().step(run.getSyncRunId(), run.getConfigVersion() + 1, run.getSnapshotHash()), "IM_VERSION_CONFLICT");
        login.apply(employee, TENANT);
        rejected(() -> step(run), "IM_PERMISSION_DENIED");
        login.apply(admin, TENANT);
        failAudit.set(true);
        try { rejected(() -> step(run), "IM_AUDIT_UNAVAILABLE"); }
        finally { failAudit.set(false); }
        equal(before, digest(), "audit failure rolls back departments users mappings checkpoint and outbox");
        for (String failure : List.of("insertDepartmentMapping", "insertUserMapping", "checkpoint")) {
            failWrite.set(failure);
            try { rejected(() -> step(run), "IM_ORG_APPLY_SAVE_FAILED"); }
            finally { failWrite.set(null); }
            equal(before, digest(), "zero affected rows rolls back batch at " + failure);
        }
        jdbc.update("UPDATE sys_tenant SET user_limit=(SELECT COUNT(*) FROM sys_user WHERE tenant_id=100000 AND deleted=0) WHERE tenant_id=100000");
        try { step(run); throw new AssertionError("quota must reject"); }
        catch (ServiceException failure) { check(failure.getMessage().contains("用户数已达上限"), "existing user quota enforced"); }
        equal(before, digest(), "quota rejection leaves all organization and progress rows intact");
        jdbc.update("UPDATE sys_tenant SET user_limit=0 WHERE tenant_id=100000");
        ImSyncApplication applied = step(run);
        equal(2L, applied.summary().actual().departmentsCreated(), "actual departments created");
        equal(2L, applied.summary().actual().usersCreated(), "actual members created");
        equal(1L, applied.summary().actual().userConflicts(), "oversized source name remains conflict");
        check(applied.effectsPending() && !applied.finished(), "durable cache and session work keeps run incomplete");
        equal(null, stored(run).getCompletedTime(), "no false completion timestamp");
        equal(run.getSnapshotHash(), stored(run).getSnapshotHash(), "original confirmation digest remains immutable");
        equal(applied, decode(run), "database encrypted application independently reopens");
        ImSyncRunRow saved = stored(run);
        jdbc.update("UPDATE sys_im_sync_run SET progress_cursor=REPEAT('0',64) WHERE sync_run_id=?", run.getSyncRunId());
        rejected(() -> step(run), "IM_SECRET_UNAVAILABLE");
        jdbc.update("UPDATE sys_im_sync_run SET progress_cursor=?,status='COMPLETED' WHERE sync_run_id=?", saved.getProgressCursor(), run.getSyncRunId());
        rejected(() -> step(run), "IM_ORG_LOCAL_INVALID");
        jdbc.update("UPDATE sys_im_sync_run SET status=?,result_summary=JSON_OBJECT('processed',999) WHERE sync_run_id=?", saved.getStatus(), run.getSyncRunId());
        rejected(() -> step(run), "IM_SECRET_UNAVAILABLE");
        jdbc.update("UPDATE sys_im_sync_run SET result_summary=? WHERE sync_run_id=?", saved.getResultSummary(), run.getSyncRunId());
        String after = digest();
        equal(applied, step(run), "new executor resumes pending state instead of repeating changes");
        equal(after, digest(), "retry has no duplicate insert audit or mapping touch");
        List<String> hashes = jdbc.queryForList("SELECT password FROM sys_user WHERE user_id IN (SELECT user_id FROM sys_im_user_mapping WHERE tenant_id=100000 AND config_id=? AND im_user_id IN ('writer-a','writer-b')) ORDER BY user_id", String.class, configId);
        equal(2, hashes.size(), "two random password hashes");
        check(!hashes.get(0).equals(hashes.get(1)), "new accounts do not share password hash");
        for (String hash : hashes) {
            check(hash.startsWith("$2a$"), "stored password uses actual application bcrypt service");
            for (String password : List.of("", "123456", "admin123", "CloudFlow@123")) check(!passwords.matchesPassword(password, hash).matched(), "common password cannot log in synchronized user");
        }
        equal(0, jdbc.queryForObject("SELECT COUNT(*) FROM sys_user_role WHERE user_id IN (SELECT user_id FROM sys_im_user_mapping WHERE tenant_id=100000 AND config_id=? AND im_user_id IN ('writer-a','writer-b'))", Integer.class, configId), "new synchronized users have zero roles");
        equal(0, jdbc.queryForObject("SELECT COUNT(*) FROM sys_user_post WHERE user_id IN (SELECT user_id FROM sys_im_user_mapping WHERE tenant_id=100000 AND config_id=? AND im_user_id IN ('writer-a','writer-b'))", Integer.class, configId), "new synchronized users have zero posts");
        ImSyncRunRow overlapping = preview(departments(), List.of(member("overlap", "禁止重叠执行", 3, 1)));
        rejected(() -> step(overlapping), "IM_ORG_LOCAL_INVALID");
        equal(0, jdbc.queryForObject("SELECT COUNT(*) FROM sys_im_user_mapping WHERE tenant_id=100000 AND im_user_id='overlap'", Integer.class), "other preview cannot bypass unfinished effects");
        acknowledgeFixture(run);
        equal("PARTIAL", step(run).status(), "acknowledged test fixture reports conflict separately");
    }

    private void updateAndDisable() throws Exception {
        long userA = userId("writer-a");
        long userB = userId("writer-b");
        long child = departmentId(3);
        jdbc.update("UPDATE sys_user SET password='unchanged-local-hash',remark='local-remark',sex='1',pwd_reset_required='0',login_ip='127.0.0.77' WHERE user_id=?", userA);
        jdbc.update("UPDATE sys_user SET status='1' WHERE user_id=?", userB);
        jdbc.update("INSERT INTO sys_user_role(user_id,role_id,tenant_id) VALUES (?,5,100000)", userA);
        jdbc.update("INSERT INTO sys_user_post(user_id,post_id,tenant_id) VALUES (?,1,100000)", userA);
        jdbc.update("INSERT INTO hr_employee(id,tenant_id,employee_no,name,gender,user_id,dept_id,post_id) VALUES (997001,100000,'im-writer-hr','独立人事姓名','MALE',?,?,1)", userA, child);
        jdbc.update("INSERT INTO hr_employee_comp(id,tenant_id,employee_id,total_salary,effective_date) VALUES (997001,100000,997001,'salary-cipher-fixture','2026-01-01')");
        String childAncestors = jdbc.queryForObject("SELECT ancestors FROM sys_dept WHERE dept_id=?", String.class, child);
        jdbc.update("INSERT INTO sys_dept(dept_id,tenant_id,parent_id,ancestors,dept_name,leader,holiday_calendar_id,status,deleted,version) VALUES (997001,100000,?,?,'手工子部门','保留负责人',123,'1',0,7)", child, childAncestors + "," + child);
        jdbc.update("UPDATE sys_dept SET leader='原负责人',phone='13988002222',email='local-dept@example.test',holiday_calendar_id=123 WHERE dept_id=?", child);
        jdbc.update("INSERT INTO sys_user(user_id,tenant_id,dept_id,user_name,nick_name,status,deleted,pwd_reset_required) VALUES (997100,100000,?,'im-protected','受保护账号','0',0,'0')", child);
        jdbc.update("INSERT INTO sys_user_role(user_id,role_id,tenant_id) VALUES (997100,1,100000)");
        jdbc.update("INSERT INTO sys_im_user_mapping(tenant_id,config_id,user_id,im_type,im_user_id,bind_type,bind_time) VALUES (100000,?,997100,'WECOM','protected','MANUAL_BIND',NOW())", configId);
        List<ImOrgSnapshot.Department> moved = List.of(new ImOrgSnapshot.Department(2, 1, "写入部门", 0),
                new ImOrgSnapshot.Department(4, 2, "新上级", 0), new ImOrgSnapshot.Department(3, 4, "新名称", 2));
        List<ImOrgSnapshot.Member> members = List.of(member("writer-a", "外部甲更新", 3, 2), member("writer-b", "外部乙更新", 3, 1), member("protected", "禁止停用", 3, 2));
        ImSyncRunRow run = preview(moved, members);
        String before = digest();
        failEvent.set(true);
        try { rejectedRuntime(() -> step(run), "controlled-event-persistence-failure"); }
        finally { failEvent.set(false); }
        equal(before, digest(), "event failure rolls back disabled user subtree mapping and progress");
        failAudit.set(true);
        try { rejected(() -> step(run), "IM_AUDIT_UNAVAILABLE"); }
        finally { failAudit.set(false); }
        equal(before, digest(), "audit failure rolls back actual pending outbox event");
        String preserved = preserved();
        ImSyncApplication applied = step(run);
        equal(1L, applied.summary().actual().usersDisabled(), "one formerly active user disabled");
        equal(1L, applied.summary().actual().userConflicts(), "administrator automatic disable rejected");
        equal(1L, applied.summary().actual().usersUpdated(), "local disabled member updates without revival");
        equal("1", jdbc.queryForObject("SELECT status FROM sys_user WHERE user_id=?", String.class, userB), "local disabled account stays disabled");
        equal("0", jdbc.queryForObject("SELECT status FROM sys_user WHERE user_id=997100", String.class), "administrator stays active");
        equal(preserved, preserved(), "role post data scope HR salary password and unrelated department fields preserved byte for byte");
        equal(1, jdbc.queryForObject("SELECT COUNT(*) FROM outbox_event WHERE tenant_id=100000 AND event_type='USER_DISABLED' AND aggregate_id=?", Integer.class, userA), "one actual durable disable event");
        String expectedPath = "0," + ROOT + "," + departmentId(2) + "," + departmentId(4) + "," + child;
        equal(expectedPath, jdbc.queryForObject("SELECT ancestors FROM sys_dept WHERE dept_id=997001", String.class), "unmanaged disabled descendant ancestors migrated atomically");
        equal(8, jdbc.queryForObject("SELECT version FROM sys_dept WHERE dept_id=997001", Integer.class), "unmanaged descendant version advances once");
        equal("RUNNING", applied.status(), "disable awaits cache and session processing");
        equal(applied, step(run), "disable retry does not duplicate workflow event");
        acknowledgeFixture(run);
        ImSyncRunRow repeated = preview(moved, members);
        ImSyncApplication unchanged = step(repeated);
        equal(0L, unchanged.summary().actual().usersCreated(), "fresh repeated synchronization creates no extra users");
        equal(0L, unchanged.summary().actual().usersDisabled(), "fresh repeated synchronization does not disable twice");
        equal(1, jdbc.queryForObject("SELECT COUNT(*) FROM outbox_event WHERE tenant_id=100000 AND event_type='USER_DISABLED' AND aggregate_id=?", Integer.class, userA), "fresh snapshot still has one disable event");
    }

    private void preservedFields() throws Exception {
        int startedAssertions = assertions;
        long user = userId("writer-a");
        ImOrgSnapshot.Field absent = new ImOrgSnapshot.Field(false, null);
        for (int mask = 0; mask < 8; mask++) {
            jdbc.update("UPDATE sys_user SET phonenumber='13988003333',email='preserved@example.test',avatar='local-avatar-fixture' WHERE user_id=?", user);
            jdbc.update("UPDATE sys_im_user_mapping SET im_avatar='local-mapping-avatar' WHERE tenant_id=? AND config_id=? AND user_id=?", TENANT, configId, user);
            String before = preserved();
            ImOrgSnapshot.Member source = new ImOrgSnapshot.Member("writer-a", "字段保留" + mask, List.of(3L), 1,
                    (mask & 1) == 0 ? absent : field("13988004444"), (mask & 2) == 0 ? absent : field("returned@example.test"),
                    (mask & 4) == 0 ? absent : field("https://wework.qpic.cn/returned"));
            ImSyncRunRow run = preview(departments(), List.of(source));
            ImSyncApplication applied = step(run);
            equal(1L, applied.summary().actual().usersUpdated(), "other profile updates proceed with every missing-field combination");
            equal((mask & 1) == 0 ? "13988003333" : "13988004444", jdbc.queryForObject("SELECT phonenumber FROM sys_user WHERE user_id=?", String.class, user), "phone preserves exact local bytes when absent");
            equal((mask & 2) == 0 ? "preserved@example.test" : "returned@example.test", jdbc.queryForObject("SELECT email FROM sys_user WHERE user_id=?", String.class, user), "email preserves exact local bytes when absent");
            equal((mask & 4) == 0 ? "local-avatar-fixture" : "https://wework.qpic.cn/returned", jdbc.queryForObject("SELECT avatar FROM sys_user WHERE user_id=?", String.class, user), "account avatar retained unless returned");
            equal((mask & 4) == 0 ? "local-mapping-avatar" : "https://wework.qpic.cn/returned", jdbc.queryForObject("SELECT im_avatar FROM sys_im_user_mapping WHERE tenant_id=? AND config_id=? AND user_id=?", String.class, TENANT, configId, user), "mapping avatar retained unless returned");
            equal(before, preserved(), "field update preserves password roles posts HR and salary");
            acknowledgeFixture(run);
        }
        ImSyncRunRow clear = preview(departments(), List.of(new ImOrgSnapshot.Member("writer-a", "显式清空", List.of(3L), 1, field(""), field(""), field(""))));
        step(clear);
        equal("", jdbc.queryForObject("SELECT CONCAT(phonenumber,email,avatar) FROM sys_user WHERE user_id=?", String.class, user), "explicitly returned empty fields clear prior contacts");
        equal("", jdbc.queryForObject("SELECT im_avatar FROM sys_im_user_mapping WHERE tenant_id=? AND config_id=? AND user_id=?", String.class, TENANT, configId, user), "explicit empty avatar also clears mapping");
        acknowledgeFixture(clear);
        ImSyncRunRow create = preview(departments(), List.of(new ImOrgSnapshot.Member("sparse-account", "缺字段新成员", List.of(3L), 1, absent, absent, absent)));
        step(create);
        long sparse = userId("sparse-account");
        equal(1, jdbc.queryForObject("SELECT COUNT(*) FROM sys_user WHERE user_id=? AND phonenumber IS NULL AND email IS NULL AND avatar IS NULL AND status='0' AND pwd_reset_required='1'", Integer.class, sparse), "missing new contacts stored as null without fabricated identity");
        equal(0, jdbc.queryForObject("SELECT COUNT(*) FROM sys_user_role WHERE user_id=?", Integer.class, sparse), "missing-field account has zero roles");
        equal(0, jdbc.queryForObject("SELECT COUNT(*) FROM sys_user_post WHERE user_id=?", Integer.class, sparse), "missing-field account has zero posts");
        String hash = jdbc.queryForObject("SELECT password FROM sys_user WHERE user_id=?", String.class, sparse);
        check(hash.startsWith("$2a$") && !passwords.matchesPassword("admin123", hash).matched(), "new sparse account uses random bcrypt credential");
        acknowledgeFixture(create);
        System.out.println("G4_IM_FIELD_PRESERVATION_DATABASE: assertions=" + (assertions - startedAssertions) + "; failed=0; combinations=8; explicit_empty=true; sparse_creation=true; real_mysql=true");
    }

    private void scopeExit() throws Exception {
        int startedAssertions = assertions;
        long user = userId("writer-a");
        ImOrgSnapshot.Member outside = new ImOrgSnapshot.Member("writer-a", "范围外名称不能覆盖", List.of(99L), 1, field("13988009999"), field("outside@example.test"), field(""));
        ImLocalOrganization.UserMapping mapping = database.read(TENANT, current -> reader.read(current, TENANT, configId).userMappings().stream()
                .filter(value -> value.userId() == user).findFirst().orElseThrow());
        database.exclusive(TENANT, current -> {
            for (ImLocalOrganization.UserMapping invalid : List.of(
                    new ImLocalOrganization.UserMapping(TENANT + 1, mapping.id(), configId, user, mapping.externalId(), mapping.bindType(), mapping.lastSyncTime(), "ACTIVE", mapping.version()),
                    new ImLocalOrganization.UserMapping(TENANT, mapping.id(), configId + 1, user, mapping.externalId(), mapping.bindType(), mapping.lastSyncTime(), "ACTIVE", mapping.version()),
                    new ImLocalOrganization.UserMapping(TENANT, mapping.id(), configId, user + 1, mapping.externalId(), mapping.bindType(), mapping.lastSyncTime(), "ACTIVE", mapping.version()),
                    new ImLocalOrganization.UserMapping(TENANT, mapping.id(), configId, user, "foreign-identifier", mapping.bindType(), mapping.lastSyncTime(), "ACTIVE", mapping.version()),
                    new ImLocalOrganization.UserMapping(TENANT, mapping.id(), configId, user, mapping.externalId(), mapping.bindType(), mapping.lastSyncTime(), "ACTIVE", mapping.version() + 1))) {
                equal(0, writes.releaseUserMapping(invalid, Long.toString(admin), LocalDateTime.now()), "tenant configuration identity and version fences enforced by real SQL");
            }
            return null;
        });
        jdbc.update("UPDATE sys_im_user_mapping SET last_sync_time=NULL WHERE mapping_id=?", mapping.id());
        database.exclusive(TENANT, current -> {
            equal(0, writes.releaseUserMapping(mapping, Long.toString(admin), LocalDateTime.now()), "unsynchronized mapping cannot be released through SQL");
            return null;
        });
        jdbc.update("UPDATE sys_im_user_mapping SET last_sync_time=? WHERE mapping_id=?", mapping.lastSyncTime(), mapping.id());
        ImSyncRunRow run = preview(departments(), List.of(), List.of(outside));
        String before = digest();
        for (String failure : List.of("releaseUserMapping", "checkpoint")) {
            failWrite.set(failure);
            try { rejected(() -> step(run), "IM_ORG_APPLY_SAVE_FAILED"); }
            finally { failWrite.set(null); }
            equal(before, digest(), "release and progress roll back together at " + failure);
        }
        failAudit.set(true);
        try { rejected(() -> step(run), "IM_AUDIT_UNAVAILABLE"); }
        finally { failAudit.set(false); }
        equal(before, digest(), "release audit failure rolls back mapping and checkpoint");
        String account = serialize(jdbc.queryForList("SELECT * FROM sys_user ORDER BY user_id"));
        String business = preserved();
        String events = serialize(jdbc.queryForList("SELECT * FROM outbox_event ORDER BY id"));
        ImSyncApplication applied = step(run);
        equal(ImSyncPreview.Action.RELEASE, applied.outcomes().stream().filter(outcome -> "writer-a".equals(outcome.externalId())).findFirst().orElseThrow().action(), "release outcome committed");
        equal(applied, decode(run), "release progress encrypted round trip");
        check(applied.finished() && !applied.effectsPending(), "mapping-only release creates no account cleanup work");
        equal(account, serialize(jdbc.queryForList("SELECT * FROM sys_user ORDER BY user_id")), "all account columns including password status and revisions byte-for-byte unchanged");
        equal(business, preserved(), "release preserves roles posts HR compensation and unrelated business data");
        equal(events, serialize(jdbc.queryForList("SELECT * FROM outbox_event ORDER BY id")), "release never emits disabled event");
        equal("OUT_OF_SCOPE", jdbc.queryForObject("SELECT status FROM sys_im_user_mapping WHERE mapping_id=?", String.class, mapping.id()), "binding retained outside management");
        equal(mapping.version() + 1, jdbc.queryForObject("SELECT version FROM sys_im_user_mapping WHERE mapping_id=?", Integer.class, mapping.id()), "mapping version advances once");
        before = digest();
        equal(applied, step(run), "release retry returns same result");
        equal(before, digest(), "release retry performs no new writes");
        ImSyncRunRow absent = preview(departments(), List.of());
        ImSyncApplication after = step(absent);
        check(after.outcomes().stream().noneMatch(outcome -> "writer-a".equals(outcome.externalId())), "later absence is excluded from management");
        equal(mapping.version() + 1, jdbc.queryForObject("SELECT version FROM sys_im_user_mapping WHERE mapping_id=?", Integer.class, mapping.id()), "later absence does not touch released mapping");
        ImSyncRunRow returned = preview(departments(), List.of(member("writer-a", "回到同步范围", 3, 1)));
        step(returned);
        equal(user, userId("writer-a"), "return reuses original account");
        equal("ACTIVE", jdbc.queryForObject("SELECT status FROM sys_im_user_mapping WHERE mapping_id=?", String.class, mapping.id()), "return restores management");
        equal("1", jdbc.queryForObject("SELECT status FROM sys_user WHERE user_id=?", String.class, user), "return preserves previous local disable");
        equal(business, preserved(), "return preserves history permissions and password");
        acknowledgeFixture(returned);
        System.out.println("G4_IM_SCOPE_EXIT_DATABASE: assertions=" + (assertions - startedAssertions) + "; failed=0; real_mysql=true; account_unchanged=true; release_rollback=true; idempotent=true; resume_management=true");
    }

    private void stoppedManagement() throws Exception {
        long user = userId("writer-a");
        List<ImOrgSnapshot.Member> changed = List.of(member("writer-a", "停止后不应覆盖", 3, 2));
        ImSyncRunRow stale = preview(departments(), changed);
        jdbc.update("UPDATE sys_im_user_mapping SET status='DISABLED',version=version+1 WHERE tenant_id=100000 AND config_id=? AND user_id=?", configId, user);
        String account = serialize(jdbc.queryForList("SELECT * FROM sys_user WHERE user_id=?", user));
        String mapping = serialize(jdbc.queryForList("SELECT * FROM sys_im_user_mapping WHERE tenant_id=100000 AND config_id=? AND user_id=?", configId, user));
        String business = preserved();
        rejected(() -> step(stale), "IM_ORG_LOCAL_INVALID");
        for (int attempt = 0; attempt < 2; attempt++) {
            ImSyncRunRow fresh = preview(departments(), changed);
            ImSyncApplication completed = step(fresh);
            ImSyncApplication.Outcome outcome = completed.outcomes().stream().filter(value -> value.kind() == ImSyncApplication.Kind.USER
                    && "writer-a".equals(value.externalId())).findFirst().orElseThrow();
            equal(ImSyncPreview.Action.SKIP, outcome.action(), "each fresh execution skips stopped employee");
            equal(List.of(ImSyncPreview.Reason.SYNC_MANAGEMENT_STOPPED), outcome.reasons(), "persisted execution records stopped reason");
            equal(account, serialize(jdbc.queryForList("SELECT * FROM sys_user WHERE user_id=?", user)), "stopped user full row unchanged after execution");
            equal(mapping, serialize(jdbc.queryForList("SELECT * FROM sys_im_user_mapping WHERE tenant_id=100000 AND config_id=? AND user_id=?", configId, user)), "stopped mapping including sync time unchanged");
            equal(business, preserved(), "stopped execution preserves roles posts HR and salary");
            equal(ImSyncPreview.Action.SKIP, decode(fresh).outcomes().stream().filter(value -> "writer-a".equals(value.externalId())).findFirst().orElseThrow().action(), "restart restores persisted skip outcome");
            acknowledgeFixture(fresh);
        }
        jdbc.update("UPDATE sys_im_user_mapping SET status='ACTIVE',version=version+1 WHERE tenant_id=100000 AND config_id=? AND user_id=?", configId, user);
        ImSyncRunRow restored = preview(departments(), List.of(member("writer-a", "管理员重新纳入", 3, 1)));
        step(restored);
        equal("管理员重新纳入", jdbc.queryForObject("SELECT nick_name FROM sys_user WHERE user_id=?", String.class, user), "explicit resumption permits source update");
        equal(user, userId("writer-a"), "resumption uses same local account");
        acknowledgeFixture(restored);
        System.out.println("G4_IM_STOPPED_MANAGEMENT_DATABASE: failed=0; old_preview_rejected=true; repeated_sync_skips=true; full_user_and_mapping_unchanged=true; persisted_skip=true; explicit_resume=true");
    }

    private void conflictPropagation() throws Exception {
        List<ImOrgSnapshot.Department> tooLong = List.of(new ImOrgSnapshot.Department(2, 1, "写入部门", 0),
                new ImOrgSnapshot.Department(10, 2, "超长名称".repeat(9), 0), new ImOrgSnapshot.Department(11, 10, "冲突子部门", 0));
        ImSyncRunRow run = preview(tooLong, List.of(member("blocked-parent", "父冲突成员", 11, 1)));
        ImSyncApplication applied = step(run);
        equal(2L, applied.summary().actual().departmentConflicts(), "invalid parent and dependent department report conflicts");
        check(applied.outcomes().stream().filter(outcome -> "blocked-parent".equals(outcome.externalId())).allMatch(outcome -> outcome.action() == ImSyncPreview.Action.CONFLICT), "dependent user never inserted");
        equal(0, jdbc.queryForObject("SELECT COUNT(*) FROM sys_im_user_mapping WHERE im_user_id='blocked-parent' AND tenant_id=100000", Integer.class), "no mapping invented for blocked member");
        ImSyncRunRow stale = preview(departments(), List.of(member("new-after-preview", "新增", 3, 1)));
        jdbc.update("UPDATE sys_dept SET dept_name='预览后变化' WHERE dept_id=?", ROOT);
        String before = digest();
        rejected(() -> step(stale), "IM_ORG_LOCAL_INVALID");
        equal(before, digest(), "stale local preview refuses any write");
        jdbc.update("UPDATE sys_dept SET dept_name='写入专项根' WHERE dept_id=?", ROOT);
    }

    private void multipleBatches() throws Exception {
        List<ImOrgSnapshot.Member> members = new ArrayList<>();
        for (int index = 0; index < 102; index++) members.add(member(String.format("batch-%03d", index), "批次成员" + index, 3, 1));
        ImSyncRunRow run = preview(departments(), members);
        long started = System.nanoTime();
        ImSyncApplication first = step(run);
        equal(100, first.next(), "one transaction processes at most 100 items");
        check(first.summary().remaining() > 0, "unprocessed items not counted as successes");
        String before = digest();
        equal(first, step(run), "pending effects prevent advancing second batch");
        equal(before, digest(), "blocked advance does not modify organization");
        acknowledgeFixture(run);
        failWrite.set("checkpoint");
        try { rejected(() -> step(run), "IM_ORG_APPLY_SAVE_FAILED"); }
        finally { failWrite.set(null); }
        equal(100, decode(run).next(), "second batch failure preserves first committed cursor");
        ImSyncApplication second = step(run);
        equal(second.total(), second.next(), "resumed transaction reaches all items without repeating first batch");
        equal(102L, second.summary().actual().usersCreated(), "actual created count excludes original absent mappings");
        equal(102, jdbc.queryForObject("SELECT COUNT(*) FROM sys_im_user_mapping WHERE tenant_id=100000 AND im_user_id LIKE 'batch-%'", Integer.class), "exactly 102 users mapped once");
        System.out.println("G4_IM_SYNC_WRITE_BATCHES: new_members=102; batches=2; first_items=100; elapsed_ms=" + TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started)
                + "; second_batch_rollback_recovered=true; effects_ack=test_fixture_only; complete_sync=false");
        acknowledgeFixture(run);
    }

    private void concurrentReaders() throws Exception {
        ExecutorService workers = Executors.newFixedThreadPool(2);
        CountDownLatch read = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        try {
            Future<?> locked = workers.submit(() -> database.exclusive(TENANT, current -> {
                writes.lockTenant(TENANT);
                reader.read(current, TENANT, configId);
                read.countDown();
                try { check(release.await(10, TimeUnit.SECONDS), "test writer release bounded"); }
                catch (InterruptedException failure) { Thread.currentThread().interrupt(); throw new IllegalStateException(failure); }
                return null;
            }));
            check(read.await(10, TimeUnit.SECONDS), "serializable organization read ready");
            CountDownLatch attempting = new CountDownLatch(1);
            Future<?> mutation = workers.submit(() -> {
                attempting.countDown();
                jdbc.update("UPDATE sys_dept SET dept_name='并发后名称' WHERE dept_id=?", ROOT);
            });
            check(attempting.await(10, TimeUnit.SECONDS), "concurrent local write attempted");
            Thread.sleep(250);
            check(!mutation.isDone(), "existing local organization rows stay locked through checkpoint transaction");
            release.countDown();
            locked.get(10, TimeUnit.SECONDS);
            mutation.get(10, TimeUnit.SECONDS);
            equal("并发后名称", jdbc.queryForObject("SELECT dept_name FROM sys_dept WHERE dept_id=?", String.class, ROOT), "waiting local update succeeds only after release");
            jdbc.update("UPDATE sys_dept SET dept_name='写入专项根' WHERE dept_id=?", ROOT);
        } finally { release.countDown(); workers.shutdownNow(); }
        login.apply(admin, TENANT);
        ImSyncRunRow run = preview(departments(), List.of(member("concurrent-new", "并发新成员", 3, 1)));
        ExecutorService requests = Executors.newFixedThreadPool(2);
        try {
            Future<ImSyncApplication> first = requests.submit(() -> { login.apply(admin, TENANT); return step(run); });
            Future<ImSyncApplication> second = requests.submit(() -> { login.apply(admin, TENANT); return step(run); });
            equal(first.get(30, TimeUnit.SECONDS), second.get(30, TimeUnit.SECONDS), "concurrent confirmations observe the same committed pending state");
            equal(1, jdbc.queryForObject("SELECT COUNT(*) FROM sys_im_user_mapping WHERE tenant_id=100000 AND im_user_id='concurrent-new'", Integer.class), "concurrent confirmations create one user");
        } finally { requests.shutdownNow(); }
    }

    private ImSyncRunRow preview(List<ImOrgSnapshot.Department> departments, List<ImOrgSnapshot.Member> members) throws Exception {
        return preview(departments, members, List.of());
    }

    private ImSyncRunRow preview(List<ImOrgSnapshot.Department> departments, List<ImOrgSnapshot.Member> members, List<ImOrgSnapshot.Member> outside) throws Exception {
        login.apply(admin, TENANT);
        ImConfigRow config = config();
        ImOrgSnapshot snapshot = new ImOrgSnapshot(TENANT, configId, config.getVersion(), config.getCorpId(), Long.parseLong(config.getAgentId()),
                Instant.now(), ROOT, Set.of(2L), Map.of(), departments, members, outside);
        return database.write(TENANT, current -> {
            ImLocalOrganization local = reader.read(current, TENANT, configId);
            ImSyncPreview preview = planner.preview(snapshot, local, codec.localHash(local));
            ImOrgSnapshotCodec.Sealed sealed = codec.encodePreview(preview);
            ImSyncRunRow row = new ImSyncRunRow();
            row.setTenantId(TENANT); row.setConfigId(configId); row.setConfigVersion(config.getVersion());
            row.setMode("PREVIEW"); row.setStatus("PREVIEWED"); row.setFullSnapshotFlag(true);
            row.setSnapshotHash(sealed.hash()); row.setSnapshotEncrypted(sealed.encrypted());
            row.setResultSummary(serialize(preview.summary())); row.setRequestedBy(admin);
            row.setCreateBy(Long.toString(admin)); row.setUpdateBy(row.getCreateBy());
            row.setStartedTime(LocalDateTime.now()); row.setCompletedTime(LocalDateTime.now());
            row.setCreateTime(LocalDateTime.now()); row.setUpdateTime(LocalDateTime.now());
            equal(1, current.insertSyncRun(row), "fixture stores real encrypted preview");
            return row;
        });
    }

    private void concurrentInsertion() throws Exception {
        ExecutorService workers = Executors.newFixedThreadPool(2);
        CountDownLatch read = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        CountDownLatch attempting = new CountDownLatch(1);
        try {
            Future<?> locked = workers.submit(() -> database.exclusive(TENANT, current -> {
                writes.lockTenant(TENANT);
                reader.read(current, TENANT, configId);
                read.countDown();
                try { check(release.await(10, TimeUnit.SECONDS), "range lock release bounded"); }
                catch (InterruptedException failure) { Thread.currentThread().interrupt(); throw new IllegalStateException(failure); }
                return null;
            }));
            check(read.await(10, TimeUnit.SECONDS), "tenant organization range read ready");
            Future<?> mutation = workers.submit(() -> {
                attempting.countDown();
                jdbc.update("INSERT INTO sys_user(tenant_id,dept_id,user_name,nick_name) VALUES (100000,?,'im-concurrent-insert','并发新增')", ROOT);
            });
            check(attempting.await(10, TimeUnit.SECONDS), "concurrent insertion attempted");
            Thread.sleep(250);
            check(!mutation.isDone(), "tenant user range prevents phantom insertion during batch");
            release.countDown();
            locked.get(10, TimeUnit.SECONDS);
            mutation.get(10, TimeUnit.SECONDS);
            equal(1, jdbc.queryForObject("SELECT COUNT(*) FROM sys_user WHERE tenant_id=100000 AND user_name='im-concurrent-insert'", Integer.class), "waiting insertion succeeds only after release");
        } finally { release.countDown(); workers.shutdownNow(); }
    }

    private void acknowledgeFixture(ImSyncRunRow original) {
        database.exclusive(TENANT, current -> {
            ImSyncRunRow row = writes.lockRun(TENANT, original.getSyncRunId());
            ImSyncApplication ready = decode(original).effectsCompleted(codec.localHash(reader.read(current, TENANT, configId)));
            String cursor = row.getProgressCursor();
            ImOrgSnapshotCodec.Sealed sealed = codec.encodeApplication(ready);
            row.setProgressCursor(sealed.hash()); row.setSnapshotEncrypted(sealed.encrypted());
            row.setResultSummary(serialize(ready.summary())); row.setStatus(ready.status());
            row.setCompletedTime(ready.finished() ? LocalDateTime.now() : null);
            equal(1, writes.checkpoint(row, "APPLY", cursor), "test-only effects acknowledgment saved");
            return null;
        });
    }

    private ImSyncBatchExecutor executor() { return new ImSyncBatchExecutor(actors, database, writes, rules, reader, planner, codec, writer, audits); }
    private ImSyncApplication step(ImSyncRunRow row) { return executor().step(row.getSyncRunId(), row.getConfigVersion(), row.getSnapshotHash()); }
    private ImConfigRow config() { return database.read(TENANT, current -> current.config(TENANT, configId)); }
    private ImSyncRunRow stored(ImSyncRunRow row) { return database.read(TENANT, current -> current.syncRun(TENANT, row.getSyncRunId())); }
    private ImSyncApplication decode(ImSyncRunRow original) {
        ImSyncRunRow row = stored(original);
        return codec.decodeApplication(ImOrgSnapshotCodec.context(rules.credentials(config())), row.getSnapshotHash(), new ImOrgSnapshotCodec.Sealed(row.getProgressCursor(), row.getSnapshotEncrypted()));
    }
    private long userId(String externalId) { return jdbc.queryForObject("SELECT user_id FROM sys_im_user_mapping WHERE tenant_id=100000 AND config_id=? AND im_user_id=?", Long.class, configId, externalId); }
    private long departmentId(long externalId) { return jdbc.queryForObject("SELECT dept_id FROM sys_im_dept_mapping WHERE tenant_id=100000 AND config_id=? AND im_dept_id=?", Long.class, configId, Long.toString(externalId)); }
    private String digest() {
        List<Object> rows = new ArrayList<>();
        for (String query : List.of("SELECT * FROM sys_dept ORDER BY dept_id", "SELECT * FROM sys_user ORDER BY user_id", "SELECT * FROM sys_im_user_mapping ORDER BY mapping_id",
                "SELECT * FROM sys_im_dept_mapping ORDER BY mapping_id", "SELECT * FROM sys_im_sync_run ORDER BY sync_run_id", "SELECT * FROM outbox_event ORDER BY id", "SELECT * FROM sys_audit_log ORDER BY audit_id")) rows.add(jdbc.queryForList(query));
        return serialize(rows);
    }
    private String preserved() {
        List<Object> rows = new ArrayList<>();
        for (String query : List.of("SELECT * FROM sys_user_role ORDER BY tenant_id,user_id,role_id", "SELECT * FROM sys_user_post ORDER BY tenant_id,user_id,post_id",
                "SELECT * FROM sys_role ORDER BY role_id", "SELECT * FROM hr_employee ORDER BY id",
                "SELECT * FROM hr_employee_comp ORDER BY id", "SELECT user_id,user_name,password,sex,remark,pwd_reset_required,login_ip,login_date FROM sys_user ORDER BY user_id",
                "SELECT dept_id,leader,phone,email,holiday_calendar_id,status,deleted FROM sys_dept WHERE dept_id=997001 OR leader='原负责人' ORDER BY dept_id")) rows.add(jdbc.queryForList(query));
        return serialize(rows);
    }
    private static List<ImOrgSnapshot.Department> departments() { return List.of(new ImOrgSnapshot.Department(2, 1, "写入部门", 0), new ImOrgSnapshot.Department(3, 2, "写入子部门", 1)); }
    private static ImOrgSnapshot.Member member(String id, String name, long department, int status) { return new ImOrgSnapshot.Member(id, name, List.of(department), status, field(""), field(id + "@example.test"), field("")); }
    private static ImOrgSnapshot.Field field(String value) { return new ImOrgSnapshot.Field(true, value); }
    private static String serialize(Object value) { try { return JSON.writeValueAsString(value); } catch (Exception failure) { throw new IllegalStateException(failure); } }
    private static void rejected(Runnable operation, String reason) {
        try { operation.run(); throw new AssertionError("Expected " + reason); }
        catch (ImFailure failure) {
            if (!reason.equals(failure.getReasonCode())) throw new AssertionError("Expected " + reason + "; actual=" + failure.getReasonCode(), failure);
            check(true, "expected safe rejection");
        }
    }
    private static void rejectedRuntime(Runnable operation, String message) { try { operation.run(); throw new AssertionError("Expected failure"); } catch (IllegalStateException failure) { equal(message, failure.getMessage(), "injected persistence failure"); } }
    private static synchronized void check(boolean success, String message) { assertions++; if (!success) throw new AssertionError(message); }
    private static void equal(Object expected, Object actual, String message) { check(Objects.equals(expected, actual), message); }
}
