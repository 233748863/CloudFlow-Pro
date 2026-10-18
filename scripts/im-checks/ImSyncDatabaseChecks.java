package com.cloudflow.auth.im;

import com.cloudflow.auth.mapper.ImMapper;
import com.cloudflow.auth.oauth2.OAuthProperties;
import com.cloudflow.auth.platform.PlatformAccessProperties;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import com.cloudflow.common.tenant.TenantContext;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.BiFunction;
import java.util.function.Consumer;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionSynchronizationManager;

public final class ImSyncDatabaseChecks {
    private static final long TENANT = 100000L;
    private static final long ROOT = 880100L;
    private static final ObjectMapper JSON = new ObjectMapper().findAndRegisterModules();
    private static final List<String> ORGANIZATION_READS = List.of("SELECT * FROM sys_user ORDER BY user_id",
            "SELECT * FROM sys_dept ORDER BY dept_id", "SELECT * FROM sys_role ORDER BY role_id",
            "SELECT * FROM sys_user_role ORDER BY user_id,role_id,tenant_id", "SELECT * FROM sys_post ORDER BY post_id",
            "SELECT * FROM sys_user_post ORDER BY user_id,post_id,tenant_id", "SELECT * FROM sys_im_user_mapping ORDER BY mapping_id",
            "SELECT * FROM sys_im_dept_mapping ORDER BY mapping_id");
    private static int assertions;
    private final JdbcTemplate jdbc;
    private final ImMapper mapper;
    private final ImDatabase database;
    private final ImConfigService configService;
    private final ImConfigRules rules;
    private final ImProperties properties;
    private final AtomicBoolean failAudit;
    private final BiFunction<Long, Long, String> login;
    private final Consumer<String> bindToken;
    private final AtomicInteger calls = new AtomicInteger();
    private final AtomicReference<Runnable> hook = new AtomicReference<>(() -> { });
    private final AtomicReference<String> members = new AtomicReference<>(members(1));
    private final ImOrgSnapshotCodec codec;
    private final ImLocalOrganizationReader reader = new ImLocalOrganizationReader(new PlatformAccessProperties(), new OAuthProperties());
    private final ImSyncService service;
    private final ImScopeService scopes;
    private final long adminId;
    private final long employeeId;
    private long configId;

    ImSyncDatabaseChecks(JdbcTemplate jdbc, ImMapper mapper, ImDatabase database, ImConfigService configService,
            ImActors actors, ImConfigRules rules, ImProperties properties, SysAuditLogMapper audits, AtomicBoolean failAudit,
            HttpServer server, BiFunction<Long, Long, String> login, Consumer<String> bindToken) {
        this.jdbc = jdbc;
        this.mapper = mapper;
        this.database = database;
        this.configService = configService;
        this.rules = rules;
        this.properties = properties;
        this.failAudit = failAudit;
        this.login = login;
        this.bindToken = bindToken;
        codec = new ImOrgSnapshotCodec(new ImSecretCipher(properties));
        adminId = jdbc.queryForObject("SELECT MIN(user_id) FROM sys_user_role WHERE tenant_id=100000 AND role_id=1", Long.class);
        employeeId = jdbc.queryForObject("SELECT MIN(user_id) FROM sys_user_role WHERE tenant_id=100000 AND role_id=5", Long.class);
        URI origin = URI.create("http://127.0.0.1:" + server.getAddress().getPort());
        WeComHttp http = new WeComHttp(WeComHttp.directClient(), official -> {
            check(!TransactionSynchronizationManager.isActualTransactionActive(), "organization network outside transaction");
            calls.incrementAndGet();
            return origin.resolve(official.getRawPath() + "?" + official.getRawQuery());
        }, Duration.ofSeconds(5));
        ImOrgProvider provider = new ImOrgProvider() {
            @Override public String providerType() { return "WECOM"; }
            @Override public List<ImOrgSnapshot.Department> departments(WeComCredentials credentials) {
                ImAccessTokens.Grant access = WeComSdk.fetchToken(credentials, http);
                return WeComOrgProvider.departments(new WeComSdk(credentials, http, access::token, ignored -> { }), credentials);
            }
            @Override public ImOrgSnapshot snapshot(WeComCredentials credentials, ImConfigRequest.SyncScope scope, Set<String> managedUserIds) {
                ImAccessTokens.Grant access = WeComSdk.fetchToken(credentials, http);
                return WeComOrgProvider.snapshot(new WeComSdk(credentials, http, access::token, ignored -> { }), credentials, scope, managedUserIds);
            }
        };
        service = new ImSyncService(actors, database, rules, provider, reader, new ImSyncPlanner(), codec, audits, properties);
        scopes = new ImScopeService(actors, database, rules, provider);
        server.createContext("/cgi-bin/agent/get", exchange -> {
            hook.getAndSet(() -> { }).run();
            respond(exchange, "{\"errcode\":0,\"agentid\":77,\"close\":0,\"allow_partys\":{\"partyid\":[2]}}");
        });
        server.createContext("/cgi-bin/department/list", exchange -> respond(exchange,
                "{\"errcode\":0,\"department\":[{\"id\":1,\"parentid\":0,\"name\":\"远端根\",\"order\":0},{\"id\":2,\"parentid\":1,\"name\":\"同步预览部门\",\"order\":0}]}"));
        server.createContext("/cgi-bin/user/list", exchange -> respond(exchange, members.get()));
        server.createContext("/cgi-bin/user/get", exchange -> respond(exchange,
                "{\"errcode\":0,\"userid\":\"managed-moved\",\"name\":\"范围外员工\",\"department\":[1],\"status\":1}"));
    }

    void run() throws Exception {
        fixtures();
        String original = organizationHash();
        scopeOptions();
        success();
        failures();
        permissions();
        races();
        performance();
        ImSyncHttpChecks.run(configService, scopes, service, database, jdbc, bindToken, configId, config().getVersion(),
                login.apply(adminId, TENANT), login.apply(employeeId, TENANT), login.apply(990101L, 990100L));
        login.apply(adminId, TENANT);
        scopeExit();
        equal(original, organizationHash(), "all local organization role post and mapping rows unchanged after previews");
        equal(0, jdbc.queryForObject("SELECT COUNT(*) FROM sys_role_menu WHERE role_id=5 AND menu_id BETWEEN 1780 AND 1787", Integer.class), "no employee IM management grant retained");
        String audit = String.join("|", jdbc.queryForList("SELECT CONCAT_WS('|',before_val,after_val) FROM sys_audit_log WHERE audit_name LIKE 'IM_SYNC_%'", String.class));
        for (String value : List.of("13988000000", "preview-0@example.test", "config-test-access-token-never-log", ImConfigChecks.APP_SECRET, "im1:")) {
            check(!audit.contains(value), "durable sync audit contains no fixed private sample");
        }
        System.out.println("G4_IM_SYNC_DATABASE: assertions=" + assertions + "; failed=0; real_mysql=true; real_mybatis=true; real_transactions=true; real_loopback_http=true; real_satoken=true; organization_digest_unchanged=true; employee_im_grants=0; vendor_service=false; production_modified=false");
    }

    private void scopeExit() throws Exception {
        jdbc.update("INSERT INTO sys_user(user_id,tenant_id,dept_id,user_name,nick_name,status,deleted) VALUES (998501,100000,?,'im-managed-moved','本地姓名','0',0)", ROOT);
        jdbc.update("INSERT INTO sys_im_user_mapping(tenant_id,config_id,user_id,im_type,im_user_id,bind_type,bind_time,last_sync_time) VALUES (100000,?,998501,'WECOM','managed-moved','AUTO_SYNC',NOW(),NOW())", configId);
        try {
            String before = organizationHash();
            int requests = calls.get();
            ImSyncViews.Report report = preview();
            ImSyncViews.Entry entry = report.entries().getRows().stream().filter(value -> value.externalId().equals("managed-moved")).findFirst().orElseThrow();
            equal(ImSyncPreview.Action.RELEASE, entry.action(), "real database managed list drives real HTTP outside proof");
            equal("本地姓名", entry.after().get("name"), "preview retains local account name");
            equal(11, calls.get() - requests, "managed outsider verified twice in addition to nine snapshot requests");
            equal(before, organizationHash(), "scope exit preview never changes live account or mapping");
            long runs = countRuns();
            hook.set(() -> jdbc.update("UPDATE sys_im_user_mapping SET status='OUT_OF_SCOPE' WHERE tenant_id=100000 AND config_id=? AND user_id=998501", configId));
            rejected(this::preview, "IM_ORG_SNAPSHOT_CHANGED");
            equal(runs, countRuns(), "management changed during network cannot persist stale release");
            requests = calls.get();
            ImSyncViews.Report released = preview();
            check(released.entries().getRows().stream().noneMatch(value -> value.externalId().equals("managed-moved")), "released outsider no longer fetched or managed");
            equal(9, calls.get() - requests, "released outsider incurs no individual lookup");
        } finally {
            jdbc.update("DELETE FROM sys_im_user_mapping WHERE tenant_id=100000 AND config_id=? AND user_id=998501", configId);
            jdbc.update("DELETE FROM sys_user WHERE tenant_id=100000 AND user_id=998501");
        }
    }

    private void fixtures() {
        login.apply(adminId, TENANT);
        jdbc.update("INSERT INTO sys_role_menu(role_id,menu_id,tenant_id) VALUES (990101,1783,990100),(990101,1785,990100)");
        jdbc.update("INSERT INTO sys_dept(dept_id,tenant_id,parent_id,ancestors,dept_name,order_num,status,deleted,version) VALUES (?,100000,0,'0','隔离同步本地根',0,'0',0,0)", ROOT);
        configId = jdbc.queryForObject("SELECT config_id FROM sys_im_config WHERE tenant_id=100000 AND deleted=0", Long.class);
        ImConfigRequest request = ImConfigChecks.editRequest(config());
        request.setStatus("ENABLED");
        ImConfigRequest.SyncScope scope = new ImConfigRequest.SyncScope();
        scope.setLocalRootDeptId(ROOT);
        scope.setRemoteDepartmentIds(List.of(2L));
        request.setSyncScope(scope);
        configService.update(request);
        equal(Boolean.FALSE, config().getSyncEnabled(), "manual preview does not require enabling scheduler");
        equal(0L, service.list(configId, 1, 10).getTotal(), "preview history initially empty");
        equal(configId, service.configurations().configurations().get(0).configId(), "sync page has its own read-authorized configuration summary");
        ImLocalOrganization local = database.read(TENANT, current -> reader.read(current, TENANT, configId));
        check(local.protectedUsers().contains(adminId), "administrator protection loaded from real role rows");
    }

    private void success() throws Exception {
        int beforeCalls = calls.get();
        ImSyncViews.Report report = preview();
        equal("PREVIEWED", report.header().status(), "success persisted as preview only");
        check(report.header().fullSnapshot(), "success marked full");
        equal(1L, report.summary().departmentsCreated(), "one proposed department");
        equal(1L, report.summary().usersCreated(), "one proposed member");
        equal(0L, report.summary().userConflicts(), "complete member has no invented conflict");
        equal(9, calls.get() - beforeCalls, "real token scope department and double member passes");
        long runId = report.header().syncRunId();
        ImSyncRunRow stored = database.read(TENANT, current -> current.syncRun(TENANT, runId));
        check(stored.getSnapshotEncrypted().startsWith("im1:"), "preview persisted with authenticated encryption");
        check(!stored.getSnapshotEncrypted().contains("preview-0@example.test"), "no contact plaintext in database payload");
        ImSyncPreview decoded = codec.decodePreview(ImOrgSnapshotCodec.context(rules.credentials(config())), new ImOrgSnapshotCodec.Sealed(stored.getSnapshotHash(), stored.getSnapshotEncrypted()));
        equal(report.summary(), decoded.summary(), "stored source and change summary independently decrypted");
        equal("13988000000", decoded.source().members().get(0).mobile().value(), "authorized contacts preserved inside encryption");
        equal(report.summary(), service.report(runId, 1, 100).summary(), "persisted report reopens");
        equal(1L, service.list(configId, 1, 10).getTotal(), "one durable history row");
        check(database.read(TENANT, current -> current.syncRuns(TENANT, configId, 0, 10)).get(0).getSnapshotEncrypted() == null, "list SQL does not select encrypted payload");
        String response = JSON.writeValueAsString(service.report(runId, 1, 100));
        for (String value : List.of("13988000000", "preview-0@example.test", "https://wework.qpic.cn/preview-private-0", "im1:")) {
            check(!response.contains(value), "report masks contacts and never returns ciphertext");
        }
        jdbc.update("UPDATE sys_dept SET dept_name='预览后本地改名' WHERE dept_id=?", ROOT);
        equal(report.summary(), service.report(runId, 1, 100).summary(), "reopening uses frozen preview not current organization");
        jdbc.update("UPDATE sys_dept SET dept_name='隔离同步本地根' WHERE dept_id=?", ROOT);
        jdbc.update("UPDATE sys_im_config SET version=version+1 WHERE config_id=?", configId);
        check(service.report(runId, 1, 100).configurationChanged(), "old configuration report remains readable and marked changed");
        equal(0, service.report(runId, 999, 50).entries().getRows().size(), "empty page outside report range");
        jdbc.update("UPDATE sys_im_sync_run SET result_summary=JSON_OBJECT('usersCreated',999) WHERE sync_run_id=?", runId);
        rejected(() -> service.report(runId, 1, 100), "IM_SECRET_UNAVAILABLE");
        jdbc.update("UPDATE sys_im_sync_run SET result_summary=? WHERE sync_run_id=?", stored.getResultSummary(), runId);
        for (String invalid : List.of("null", "{}", stored.getResultSummary().replace("\"usersCreated\": 1", "\"usersCreated\": \"1\"")
                .replace("\"usersCreated\":1", "\"usersCreated\":\"1\""))) {
            check(!invalid.equals(stored.getResultSummary()), "malformed summary fixture differs from original");
            jdbc.update("UPDATE sys_im_sync_run SET result_summary=? WHERE sync_run_id=?", invalid, runId);
            rejected(() -> service.report(runId, 1, 100), "IM_SECRET_UNAVAILABLE");
        }
        jdbc.update("UPDATE sys_im_sync_run SET result_summary=? WHERE sync_run_id=?", stored.getResultSummary(), runId);
        jdbc.update("UPDATE sys_im_sync_run SET snapshot_hash=REPEAT('0',64) WHERE sync_run_id=?", runId);
        rejected(() -> service.report(runId, 1, 100), "IM_SECRET_UNAVAILABLE");
        jdbc.update("UPDATE sys_im_sync_run SET snapshot_hash=? WHERE sync_run_id=?", stored.getSnapshotHash(), runId);
    }

    private void scopeOptions() throws Exception {
        com.cloudflow.common.core.domain.PageResult<ImViews.DepartmentOption> local = scopes.localDepartments("隔离同步本地根", 1, 10);
        equal(1L, local.getTotal(), "local scope picker uses real paginated department query");
        equal(ROOT, local.getRows().get(0).id(), "local department identifier retained");
        equal(0L, scopes.localDepartments("隔离同步%", 1, 10).getTotal(), "search treats wildcard literally");
        equal(0, scopes.localDepartments("隔离同步本地根", 2, 10).getRows().size(), "outside local option page empty");
        equal(3, JSON.valueToTree(local.getRows().get(0)).size(), "local choices expose ID parent and name only");
        ImVersionRequest request = new ImVersionRequest();
        request.setVersion(config().getVersion());
        int before = calls.get();
        ImViews.RemoteDepartments remote = scopes.remoteDepartments(configId, request);
        equal(List.of(2L), remote.departments().stream().map(ImViews.DepartmentOption::id).toList(), "remote choices only include full authorized scope");
        equal(7, calls.get() - before, "choices fetch token plus six department and authority requests without member reads");
        equal(config().getVersion().intValue(), remote.version(), "choice response bound to saved config version");
        rejected(() -> scopes.localDepartments("", 1, 101), "IM_CONFIGURATION_INVALID");
        database.write(TENANT, current -> { rejected(() -> scopes.remoteDepartments(configId, request), "IM_ORG_LOCAL_INVALID"); return null; });
        login.apply(employeeId, TENANT);
        rejected(() -> scopes.localDepartments("", 1, 10), "IM_PERMISSION_DENIED");
        rejected(() -> scopes.remoteDepartments(configId, request), "IM_PERMISSION_DENIED");
        login.apply(990101L, 990100L);
        equal(0L, scopes.localDepartments("隔离同步本地根", 1, 10).getTotal(), "local options tenant isolated");
        rejected(() -> scopes.remoteDepartments(configId, request), "IM_CONFIG_NOT_FOUND");
        login.apply(adminId, TENANT);
        jdbc.update("UPDATE sys_tenant SET package_id=990100,package_version=0,effective_menu_ids='[6,1780]' WHERE tenant_id=100000");
        rejected(() -> scopes.localDepartments("", 1, 10), "IM_PERMISSION_DENIED");
        rejected(() -> scopes.remoteDepartments(configId, request), "IM_PERMISSION_DENIED");
        jdbc.update("UPDATE sys_tenant SET package_id=NULL,package_version=NULL,effective_menu_ids=NULL WHERE tenant_id=100000");
        hook.set(() -> jdbc.update("UPDATE sys_im_config SET version=version+1 WHERE config_id=?", configId));
        rejected(() -> scopes.remoteDepartments(configId, request), "IM_VERSION_CONFLICT");
        equal(0L, countRuns(), "candidate reads never create sync history or write local organization");
    }

    private void failures() {
        members.set("{\"errcode\":48002,\"errmsg\":\"provider-private-detail-never-log\"}");
        ImSyncViews.Report failure = preview();
        equal("FAILED", failure.header().status(), "provider error durably recorded");
        check(!failure.header().fullSnapshot(), "partial read is not a full snapshot");
        check(failure.summary() == null && failure.entries().getRows().isEmpty(), "failure has no invented success counts");
        check(failure.failureCode() != null && !failure.failureCode().contains("private"), "safe failure reason only");
        ImSyncRunRow stored = database.read(TENANT, current -> current.syncRun(TENANT, failure.header().syncRunId()));
        check(stored.getSnapshotEncrypted() == null, "failure persists no partial source payload");
        equal(failure.failureCode(), service.report(stored.getSyncRunId(), 1, 10).failureCode(), "failed report reopens safely");
        for (String invalid : List.of("null", "{}", "{\"reasonCode\":null}", "{\"reasonCode\":\"UNKNOWN\"}")) {
            jdbc.update("UPDATE sys_im_sync_run SET result_summary=? WHERE sync_run_id=?", invalid, stored.getSyncRunId());
            rejected(() -> service.report(stored.getSyncRunId(), 1, 10), "IM_SECRET_UNAVAILABLE");
        }
        jdbc.update("UPDATE sys_im_sync_run SET result_summary=? WHERE sync_run_id=?", stored.getResultSummary(), stored.getSyncRunId());
        failAudit.set(true);
        long beforeRows = countRuns();
        rejected(this::preview, "IM_AUDIT_UNAVAILABLE");
        equal(beforeRows, countRuns(), "failed read audit failure rolls back run insert");
        members.set(members(1));
        rejected(this::preview, "IM_AUDIT_UNAVAILABLE");
        equal(beforeRows, countRuns(), "successful preview audit failure rolls back run insert");
        failAudit.set(false);
        jdbc.execute("CREATE TRIGGER owned_sync_insert_failure BEFORE INSERT ON sys_im_sync_run FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='storage-private-detail-never-log'");
        try {
            rejected(this::preview, "IM_ORG_PREVIEW_SAVE_FAILED");
            equal(beforeRows, countRuns(), "database insert failure never reports success");
        } finally { jdbc.execute("DROP TRIGGER owned_sync_insert_failure"); }
        int beforeCalls = calls.get();
        database.write(TENANT, current -> { rejected(this::preview, "IM_ORG_LOCAL_INVALID"); return null; });
        equal(beforeCalls, calls.get(), "outer transaction rejected before any network");
        properties.setEnabled(false);
        rejected(this::preview, "IM_DISABLED");
        equal(beforeCalls, calls.get(), "deployment disabled makes zero network calls");
        properties.setEnabled(true);
        jdbc.update("UPDATE sys_im_config SET status='DISABLED' WHERE config_id=?", configId);
        rejected(this::preview, "IM_DISABLED");
        jdbc.update("UPDATE sys_im_config SET status='ENABLED' WHERE config_id=?", configId);
        equal(beforeCalls, calls.get(), "configuration disabled makes zero network calls");
    }

    private void permissions() {
        long runId = jdbc.queryForObject("SELECT MIN(sync_run_id) FROM sys_im_sync_run WHERE tenant_id=100000", Long.class);
        login.apply(employeeId, TENANT);
        rejected(this::preview, "IM_PERMISSION_DENIED");
        rejected(() -> service.list(configId, 1, 10), "IM_PERMISSION_DENIED");
        rejected(() -> service.report(runId, 1, 10), "IM_PERMISSION_DENIED");
        jdbc.update("INSERT INTO sys_role_menu(role_id,menu_id,tenant_id) VALUES (5,1783,100000),(5,1785,100000)");
        rejected(this::preview, "IM_PERMISSION_DENIED");
        rejected(() -> service.list(configId, 1, 10), "IM_PERMISSION_DENIED");
        rejected(() -> service.report(runId, 1, 10), "IM_PERMISSION_DENIED");
        jdbc.update("DELETE FROM sys_role_menu WHERE role_id=5 AND menu_id IN (1783,1785)");
        login.apply(990101L, 990100L);
        rejected(this::preview, "IM_CONFIG_NOT_FOUND");
        rejected(() -> service.list(configId, 1, 10), "IM_CONFIG_NOT_FOUND");
        rejected(() -> service.report(runId, 1, 10), "IM_ORG_RUN_NOT_FOUND");
        login.apply(adminId, TENANT);
        TenantContext.setTenantId(990100L);
        TenantContext.setTenantSkip();
        equal(configId, service.report(runId, 1, 10).header().configId(), "trusted session overrides hostile tenant context");
        equal(990100L, TenantContext.getTenantId(), "caller context restored");
        check(TenantContext.getTenantSkip(), "caller skip flag restored");
        TenantContext.clear();
        jdbc.update("UPDATE sys_tenant SET package_id=990100,package_version=0,effective_menu_ids='[6,1785]' WHERE tenant_id=100000");
        equal(1, service.configurations().configurations().size(), "sync read package does not require config-management page");
        rejected(this::preview, "IM_PERMISSION_DENIED");
        check(service.list(configId, 1, 10).getTotal() > 0, "package read remains without preview permission");
        jdbc.update("UPDATE sys_tenant SET effective_menu_ids='[6]' WHERE tenant_id=100000");
        rejected(() -> service.list(configId, 1, 10), "IM_PERMISSION_DENIED");
        rejected(() -> service.report(runId, 1, 10), "IM_PERMISSION_DENIED");
        jdbc.update("UPDATE sys_tenant SET package_id=NULL,package_version=NULL,effective_menu_ids=NULL WHERE tenant_id=100000");
        for (int invalid : List.of(0, 1000001)) rejected(() -> service.list(configId, invalid, 10), "IM_CONFIGURATION_INVALID");
        rejected(() -> service.report(runId, 1, 101), "IM_CONFIGURATION_INVALID");
    }

    private void races() {
        long beforeRows = countRuns();
        hook.set(() -> jdbc.update("UPDATE sys_im_config SET version=version+1 WHERE config_id=?", configId));
        rejected(this::preview, "IM_VERSION_CONFLICT");
        equal(beforeRows, countRuns(), "changed version during remote read never persists preview");
        hook.set(() -> jdbc.update("DELETE FROM sys_role_menu WHERE role_id=1 AND menu_id=1783 AND tenant_id=100000"));
        rejected(this::preview, "IM_PERMISSION_DENIED");
        jdbc.update("INSERT INTO sys_role_menu(role_id,menu_id,tenant_id) VALUES (1,1783,100000)");
        equal(beforeRows, countRuns(), "revoked role grant during remote read prevents persistence");
        jdbc.update("UPDATE sys_tenant SET package_id=990100,package_version=0,effective_menu_ids='[6,1783,1785]' WHERE tenant_id=100000");
        hook.set(() -> jdbc.update("UPDATE sys_tenant SET effective_menu_ids='[6,1785]',version=version+1 WHERE tenant_id=100000"));
        rejected(this::preview, "IM_PERMISSION_DENIED");
        jdbc.update("UPDATE sys_tenant SET package_id=NULL,package_version=NULL,effective_menu_ids=NULL WHERE tenant_id=100000");
        equal(beforeRows, countRuns(), "package removal during remote read prevents persistence");
        hook.set(() -> properties.setEnabled(false));
        rejected(this::preview, "IM_DISABLED");
        properties.setEnabled(true);
        equal(beforeRows, countRuns(), "deployment disabled during remote read prevents persistence");
        hook.set(() -> jdbc.update("UPDATE sys_user SET status='1' WHERE user_id=?", adminId));
        rejected(this::preview, "IM_AUTHENTICATION_REQUIRED");
        jdbc.update("UPDATE sys_user SET status='0' WHERE user_id=?", adminId);
        equal(beforeRows, countRuns(), "disabled actor during remote read prevents persistence");
    }

    private void performance() {
        members.set(members(1000));
        long start = System.nanoTime();
        ImSyncViews.Report report = preview();
        equal(1000L, report.summary().usersCreated(), "1000-person complete preview persisted");
        equal(1001L, service.report(report.header().syncRunId(), 1, 100).entries().getTotal(), "1000 members plus one department frozen");
        long millis = Duration.ofNanos(System.nanoTime() - start).toMillis();
        check(millis < 300000, "complete database preview within five minutes");
        members.set(members(1));
        System.out.println("G4_IM_SYNC_PREVIEW_DATABASE_PERFORMANCE: members=1000; elapsed_ms=" + millis + "; real_mysql=true; real_loopback_http=true; complete_sync=false; vendor_service=false");
    }

    private ImConfigRow config() { return database.read(TENANT, current -> current.config(TENANT, configId)); }
    private ImSyncViews.Report preview() {
        ImVersionRequest request = new ImVersionRequest();
        request.setVersion(config().getVersion());
        return service.preview(configId, request);
    }
    private long countRuns() { return jdbc.queryForObject("SELECT COUNT(*) FROM sys_im_sync_run", Long.class); }
    private String organizationHash() throws Exception {
        Map<String, List<Map<String, Object>>> rows = new LinkedHashMap<>();
        for (String query : ORGANIZATION_READS) rows.put(query, jdbc.queryForList(query));
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(JSON.writeValueAsBytes(rows)));
    }
    private static String members(int size) {
        ObjectNode body = JSON.createObjectNode().put("errcode", 0);
        ArrayNode people = body.putArray("userlist");
        for (int index = 0; index < size; index++) {
            ObjectNode person = people.addObject().put("userid", "preview-person-" + index).put("name", "预览人员" + index)
                    .put("status", 1).put("mobile", String.format(java.util.Locale.ROOT, "1398800%04d", index))
                    .put("email", "preview-" + index + "@example.test").put("avatar", "https://wework.qpic.cn/preview-private-" + index);
            person.putArray("department").add(2);
        }
        return body.toString();
    }
    private static void respond(HttpExchange exchange, String body) throws IOException {
        byte[] content = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        exchange.sendResponseHeaders(200, content.length);
        exchange.getResponseBody().write(content);
        exchange.close();
    }
    private static void rejected(Runnable operation, String reason) {
        try { operation.run(); throw new AssertionError("expected " + reason); }
        catch (ImFailure failure) {
            equal(reason, failure.getReasonCode(), "safe failure code expected=" + reason + "; actual=" + failure.getReasonCode());
            check(failure.getCause() == null, "safe failure has no raw cause");
        }
    }
    private static synchronized void check(boolean condition, String message) { assertions++; if (!condition) throw new AssertionError(message); }
    private static void equal(Object expected, Object actual, String message) { check(Objects.equals(expected, actual), message); }
}
