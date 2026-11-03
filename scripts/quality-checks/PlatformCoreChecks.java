package com.cloudflow.auth.checks;

import cn.dev33.satoken.stp.StpLogic;
import cn.dev33.satoken.stp.StpUtil;
import cn.hutool.crypto.SecureUtil;
import cn.hutool.crypto.digest.BCrypt;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.AbstractWrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.auth.util.DeptTreeBuilder;
import com.cloudflow.auth.domain.SysDept;
import com.cloudflow.auth.domain.SysFile;
import com.cloudflow.auth.domain.SysJob;
import com.cloudflow.auth.domain.SysMenu;
import com.cloudflow.auth.domain.SysRole;
import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.auth.domain.SysUserRole;
import com.cloudflow.auth.domain.report.SysReportDataset;
import com.cloudflow.auth.domain.vo.SysJobVO;
import com.cloudflow.auth.download.HrFileAccessChecker;
import com.cloudflow.auth.mapper.SysDeptMapper;
import com.cloudflow.auth.mapper.SysFileMapper;
import com.cloudflow.auth.mapper.SysJobMapper;
import com.cloudflow.auth.mapper.SysRoleMapper;
import com.cloudflow.auth.mapper.SysUserMapper;
import com.cloudflow.auth.mapper.SysUserRoleMapper;
import com.cloudflow.auth.mapper.report.SysReportDatasetMapper;
import com.cloudflow.auth.message.AuthMessagePushGateway;
import com.cloudflow.auth.message.InternalChannelSender;
import com.cloudflow.auth.message.MessageDispatchService;
import com.cloudflow.auth.preview.HrFileDownloadClient;
import com.cloudflow.auth.service.JobPlatformService;
import com.cloudflow.auth.service.PasswordService;
import com.cloudflow.auth.service.UserDataScopeService;
import com.cloudflow.auth.service.impl.SysMenuServiceImpl;
import com.cloudflow.auth.service.impl.SysUserServiceImpl;
import com.cloudflow.auth.service.report.ReportDatasetRegistration;
import com.cloudflow.auth.service.report.ReportDatasetService;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.context.UserDataScopeSnapshot;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.event.SystemNoticeCreatedEvent;
import com.cloudflow.common.core.file.FilePreviewBinding;
import com.cloudflow.common.core.file.FilePreviewRequest;
import com.cloudflow.common.core.report.ReportRegistry;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.common.message.api.MessageReceiver;
import com.cloudflow.common.message.channel.ChannelSendContext;
import com.cloudflow.common.redis.core.UserDataScopeStore;
import com.cloudflow.common.tenant.TenantBroker;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.lang.reflect.Field;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.springframework.core.env.StandardEnvironment;

/** Queries use counted mapper doubles; no database, remote service, or server changes. */
public final class PlatformCoreChecks {
    private static final Long TENANT = 91001L;
    private static final ObjectMapper JSON = new ObjectMapper().findAndRegisterModules();
    private static int checks;

    public static void main(String[] arguments) throws Exception {
        StpLogic previous = StpUtil.getStpLogic();
        StpUtil.setStpLogic(new StpLogic("platform-quality") {
            @Override public void checkLogin() { }
            @Override public long getLoginIdAsLong() { return 91L; }
            @Override public Object getLoginIdByToken(String token) { return "quality-session".equals(token) ? 91L : null; }
            @Override public boolean hasPermission(String permission) { return true; }
            @Override public void checkPermission(String permission) { }
        });
        try {
            UserContext.setTenantId(TENANT); UserContext.setUserId(91L); UserContext.setDeptId(10L);
            UserContext.setUserName("quality-user"); UserContext.setAuthToken("quality-session");
            MapperBuilderAssistant assistant = new MapperBuilderAssistant(new MybatisConfiguration(), "quality-models");
            assistant.setCurrentNamespace("quality");
            for (Class<?> type : List.of(SysUser.class, SysUserRole.class, SysRole.class, SysDept.class, SysJob.class)) {
                TableInfoHelper.initTableInfo(assistant, type);
            }
            passwords();
            QueryFixture fixture = new QueryFixture();
            userQueries(fixture);
            trees(fixture);
            scopes(fixture);
            receivers(fixture);
            jobs();
            reports();
            notices();
            files();
            System.out.println("PLATFORM_CORE_CHECKS: passed=" + checks
                    + "; real_services=true; mapper=counted_double; identity=controlled; mysql=false; http=false");
        } finally {
            UserContext.clear(); StpUtil.setStpLogic(previous);
        }
    }

    private static void passwords() {
        PasswordService service = new PasswordService();
        String input = "Current-Protocol-Only!";
        String encoded = service.encodePassword("  " + input + "  ");
        check(service.matchesPassword(input, encoded) && service.matchesPassword(" " + input, encoded), "plain password is normalized consistently");
        check(BCrypt.checkpw(SecureUtil.sha256(input), encoded), "stored representation is exactly BCrypt of SHA256");
        check(!service.matchesPassword("wrong", encoded), "incorrect password is rejected");
        check(!service.matchesPassword(SecureUtil.sha256(input), encoded), "client-side SHA256 is not accepted as a second input protocol");
        check(!service.matchesPassword(input, BCrypt.hashpw(input, BCrypt.gensalt(4))), "old direct BCrypt password is rejected");
        String hexadecimalPassword = "0123456789abcdef".repeat(4);
        check(service.matchesPassword(hexadecimalPassword, service.encodePassword(hexadecimalPassword)), "64-character hexadecimal passwords remain real plain passwords");
        rejects(() -> service.encodePassword("   "), "blank password rejected");
    }

    private static void userQueries(QueryFixture fixture) throws Exception {
        SysUserServiceImpl service = new SysUserServiceImpl();
        set(service, "sysUserMapper", fixture.users); set(service, "sysUserRoleMapper", fixture.bindings);
        set(service, "sysRoleMapper", fixture.roles); set(service, "sysDeptMapper", fixture.departments);
        List<SysUser> users = service.selectUserList(new SysUser());
        check(fixture.calls.values().stream().mapToInt(Integer::intValue).sum() == 4, "user list uses one batch query for each required relation");
        check(users.size() == 3 && "Root".equals(users.get(0).getDeptName())
                && "Role one".equals(users.get(0).getRole()), "batched query preserves user, department, and role-name output");
        check(Arrays.equals(users.get(0).getRoleIds(), new Long[]{20L, 21L}), "multiple roles preserve mapper order");
        fixture.calls.clear();
    }

    private static void trees(QueryFixture fixture) throws Exception {
        List<SysDept> roots = DeptTreeBuilder.build(fixture.deptRows);
        check(roots.size() == 1 && roots.get(0).getChildren().size() == 2, "department tree preserves both children and their order");
        SysMenu root = menu(1L, 0L); SysMenu child = menu(2L, 1L); SysMenu peer = menu(3L, 0L);
        List<SysMenu> menus = new SysMenuServiceImpl().getChildPerms(List.of(root, child, peer), 0);
        check(menus.size() == 2 && menus.get(0).getChildren().equals(List.of(child)), "menu tree attaches children by parent with stable roots");
        rejects(() -> new SysMenuServiceImpl().getChildPerms(List.of(root, menu(1L, 1L)), 0), "reachable duplicate/cyclic menu is rejected");
        SysDept clearLeader = JSON.readValue("{\"leaderUserId\":null}", SysDept.class);
        check(clearLeader.isLeaderUserIdSpecified() && clearLeader.getLeaderUserId() == null,
                "clearing a department leader is distinct from omitting the field");
    }

    private static void scopes(QueryFixture fixture) {
        Map<Long, UserDataScopeSnapshot> saved = new LinkedHashMap<>();
        UserDataScopeStore store = new UserDataScopeStore(null) {
            @Override public void save(UserDataScopeSnapshot snapshot) { saved.put(snapshot.getUserId(), snapshot); }
        };
        UserDataScopeService service = new UserDataScopeService(fixture.users, fixture.bindings, fixture.roles, fixture.departments, store);
        service.refreshByDeptIds(List.of(10L, 11L, 10L));
        check(fixture.calls.values().stream().mapToInt(Integer::intValue).sum() == 4 && saved.size() == 3,
                "overlapping department changes query each relation once and refresh each user once");
        check(Set.copyOf(saved.get(91L).getDsDeptIds()).equals(Set.of(10L, 11L, 12L)), "department-and-children role includes exact descendants");
        check(saved.get(92L).getDsDeptIds().equals(List.of(11L)) && saved.get(93L).getDsType() == 4,
                "department-only and self-only roles remain distinct");
        check(saved.values().stream().allMatch(value -> TENANT.equals(value.getTenantId())), "scope refresh retains tenant ownership");
        fixture.calls.clear();
    }

    @SuppressWarnings("unchecked")
    private static void receivers(QueryFixture fixture) throws Exception {
        MessageDispatchService service = new MessageDispatchService(JSON, null, null, null, null, fixture.users,
                fixture.bindings, fixture.departments, null, null, null, null, null, null);
        Method expand = MessageDispatchService.class.getDeclaredMethod("expandReceivers", List.class, Long.class);
        expand.setAccessible(true);
        List<MessageReceiver> input = List.of(receiver("USER", 91L), receiver("ROLE", 20L), receiver("DEPT", 10L),
                receiver("ROLE", 21L), receiver("DEPT", 11L));
        List<MessageReceiver> expanded = (List<MessageReceiver>) expand.invoke(service, input, TENANT);
        check(expanded.stream().map(MessageReceiver::getReceiverId).toList().equals(List.of(91L, 92L, 93L)),
                "overlapping people, roles and nested departments retain first appearance and send once");
        check(fixture.calls.values().stream().mapToInt(Integer::intValue).sum() == 3, "receiver expansion loads departments, bindings and active users once");
        set(service, "receiverExpandLimit", 2);
        rejects(() -> invoke(expand, service, input, TENANT), "expanded distinct recipient limit is enforced");
        Method stage = MessageDispatchService.class.getDeclaredMethod("stage", BusinessEventEnvelope.class);
        stage.setAccessible(true);
        BusinessEventEnvelope missingTenant = BusinessEventEnvelope.builder().eventId("event").payload("{}").build();
        rejects(() -> invoke(stage, service, missingTenant), "dispatch refuses a missing event tenant before reading recipients");
        check(missingTenant.getTenantId() == null, "dispatch never fills a missing tenant from default or operator context");
        fixture.calls.clear();
    }

    private static void jobs() {
        AtomicInteger reads = new AtomicInteger();
        SysJobMapper mapper = proxy(SysJobMapper.class, (object, method, values) -> {
            if (!"selectPage".equals(method.getName())) throw new AssertionError("job list must use database pagination");
            reads.incrementAndGet();
            @SuppressWarnings("unchecked") Page<SysJob> page = (Page<SysJob>) values[0];
            check(page.getCurrent() == 3 && page.getSize() == 2, "requested page reaches the mapper");
            SysJob row = new SysJob(); row.setJobId(105L); row.setTenantId(TENANT); row.setJobName("current page only");
            page.setTotal(9); page.setRecords(List.of(row)); return page;
        });
        JobPlatformService service = new JobPlatformService(mapper, null, null, null, null, null, null, null, JSON, null, null);
        PageResult<SysJobVO> page = service.list(null, 3, 2);
        check(reads.get() == 1 && page.getTotal() == 9 && page.getRows().size() == 1 && page.getPageNum() == 3,
                "only mapper page records are converted while full total is retained");
    }

    private static void reports() {
        Map<String, SysReportDataset> records = new LinkedHashMap<>();
        AtomicInteger reads = new AtomicInteger(); AtomicInteger writes = new AtomicInteger();
        SysReportDatasetMapper mapper = proxy(SysReportDatasetMapper.class, (object, method, values) -> {
            if ("registered".equals(method.getName())) { reads.incrementAndGet(); return new ArrayList<>(records.values()); }
            if ("byCode".equals(method.getName())) { reads.incrementAndGet(); return records.get(values[1]); }
            if ("registerMissing".equals(method.getName())) {
                SysReportDataset row = (SysReportDataset) values[0];
                row.setDatasetId((long) records.size() + 1); row.setStatus("ACTIVE"); row.setDeleted(0);
                row.setDataScopeFlag(1); row.setTenantIsolatedFlag(1);
                records.put(row.getDatasetCode(), row); writes.incrementAndGet(); return 1;
            }
            throw new AssertionError("unexpected dataset query: " + method.getName());
        });
        ReportDatasetRegistration registration = new ReportDatasetRegistration(mapper, JSON);
        rejects(() -> registration.registerTenant(91002L), "registration cannot use another tenant's context");
        registration.registerTenant(TENANT);
        check(writes.get() == ReportRegistry.datasets().size(), "explicit initialization registers each missing definition once");
        SysReportDataset existing = records.values().iterator().next(); existing.setStatus("DISABLED");
        int inserted = writes.get();
        registration.registerTenant(TENANT);
        check(writes.get() == inserted && "DISABLED".equals(existing.getStatus()), "initialization retains existing disabled definitions");
        ReportDatasetService service = new ReportDatasetService(mapper, JSON);
        reads.set(0);
        check(service.list().size() == records.size() && reads.get() == 1 && writes.get() == inserted,
                "dataset list reads registrations once and performs no writes");
        existing.setStatus("ACTIVE"); reads.set(0); service.require(existing.getDatasetCode());
        check(reads.get() == 1 && writes.get() == inserted, "single dataset access performs one read and no registration");
        existing.setMapperMethod("unregistered mapper");
        rejects(() -> service.require(existing.getDatasetCode()), "registration simplification keeps executable metadata verification");
        TenantBroker.runAs(91002L, tenant -> check(tenant.equals(UserContext.getTenantId()), "new-tenant registration scope sets exact ownership"));
        check(TENANT.equals(UserContext.getTenantId()), "temporary registration scope restores caller tenant");
    }

    private static void notices() throws Exception {
        AtomicReference<BusinessEventEnvelope> published = new AtomicReference<>();
        OutboxPublisher outbox = new OutboxPublisher(null, JSON) {
            @Override public void publish(BusinessEventEnvelope envelope) { published.set(envelope); }
        };
        AuthMessagePushGateway gateway = new AuthMessagePushGateway(outbox, JSON, new StandardEnvironment());
        InternalChannelSender sender = new InternalChannelSender(gateway);
        sender.send(ChannelSendContext.builder().recordId(700L).tenantId(TENANT).receiver(receiver("USER", 91L))
                .title("Current title").content("Current content").messageCategory("SYSTEM")
                .params(Map.of("senderId", 92L, "senderName", "sender")).build());
        SystemNoticeCreatedEvent event = JSON.readValue(published.get().getPayload(), SystemNoticeCreatedEvent.class);
        check(event.getNoticeId().equals(700L) && event.getRecipientId().equals(91L) && event.getTenantId().equals(TENANT)
                && event.getSenderId().equals(92L) && event.getTitle().equals("Current title"), "typed notice retains message, tenant, recipient and sender fields");
        event.setTenantId(null); rejects(() -> gateway.push(event), "notice gateway requires explicit tenant");
    }

    private static void files() {
        AtomicReference<SysFile> current = new AtomicReference<>();
        SysFileMapper files = proxy(SysFileMapper.class, (object, method, values) -> current.get());
        HrFileDownloadClient hr = proxy(HrFileDownloadClient.class, (object, method, values) ->
                R.ok(new FilePreviewBinding("/api/auth/system/file/501/content", "current-evidence")));
        HrFileAccessChecker checker = new HrFileAccessChecker(hr, files, JSON);
        FilePreviewRequest request = new FilePreviewRequest("HR_DISPUTE_EVIDENCE", "77", 501L, null, null, null, null, null, null, null, null);
        SysFile file = new SysFile(); file.setFileId(501L); file.setTenantId(TENANT); file.setDeleted(0);
        file.setStorageType("LOCAL"); file.setAccessType("PRIVATE"); file.setFileType("HR_DISPUTE_EVIDENCE"); current.set(file);
        check(checker.authorize(request).file().getFileId().equals(501L), "current private dispute evidence has a valid download binding");
        file.setFileType("HR_GRIEVANCE_EVIDENCE");
        check(checker.authorize(request).file().getFileId().equals(501L), "archived grievance evidence retains its authorized purpose");
        file.setAccessType("PUBLIC"); rejects(() -> checker.authorize(request), "public legacy HR attachment cannot bypass private-file policy");
        file.setAccessType("PRIVATE"); file.setUrl("https://public.invalid/evidence");
        rejects(() -> checker.authorize(request), "private label with a public URL is rejected");
        file.setUrl(null); file.setTenantId(91002L); rejects(() -> checker.authorize(request), "foreign tenant attachment is rejected");
        file.setTenantId(TENANT); file.setFileType("HR_TAX_PROOF"); rejects(() -> checker.authorize(request), "unrelated sensitive attachment purpose is rejected");
        UserContext.setAuthToken("wrong-session"); rejects(() -> checker.authorize(request), "invalid session is rejected before attachment access");
        UserContext.setAuthToken("quality-session");
    }

    private static final class QueryFixture {
        private final List<SysDept> deptRows = List.of(dept(10L, 0L, "Root", "0"), dept(11L, 10L, "Child", "0,10"), dept(12L, 10L, "Peer", "0,10"));
        private final List<SysUser> userRows = List.of(user(91L, 10L), user(92L, 11L), user(93L, 12L));
        private final List<SysUserRole> bindingRows = List.of(binding(91L, 20L), binding(91L, 21L), binding(92L, 21L));
        private final Map<String, Integer> calls = new HashMap<>();
        private final SysUserMapper users = proxy(SysUserMapper.class, (object, method, values) -> queried("users", method, values, userRows));
        private final SysUserRoleMapper bindings = proxy(SysUserRoleMapper.class, (object, method, values) -> queried("bindings", method, values, bindingRows));
        private final SysRoleMapper roles = proxy(SysRoleMapper.class, (object, method, values) -> queried("roles", method, values, List.of(role(20L, 2, "Role one"), role(21L, 3, "Role two"))));
        private final SysDeptMapper departments = proxy(SysDeptMapper.class, (object, method, values) -> queried("departments", method, values, deptRows));

        private Object queried(String name, Method method, Object[] values, Object result) {
            if (!List.of("selectList", "selectBatchIds").contains(method.getName())) throw new AssertionError("per-record lookup: " + name + "." + method.getName());
            calls.merge(name, 1, Integer::sum);
            if (values[0] instanceof AbstractWrapper<?, ?, ?> wrapper) wrapper.getSqlSegment();
            return result;
        }
    }

    private static SysDept dept(Long id, Long parent, String name, String ancestors) {
        SysDept value = new SysDept(); value.setDeptId(id); value.setParentId(parent); value.setDeptName(name);
        value.setAncestors(ancestors); value.setTenantId(TENANT); value.setStatus("0"); value.setDeleted(0); return value;
    }
    private static SysMenu menu(Long id, Long parent) { SysMenu value = new SysMenu(); value.setMenuId(id); value.setParentId(parent); return value; }
    private static SysUser user(Long id, Long department) {
        SysUser value = new SysUser(); value.setUserId(id); value.setDeptId(department); value.setTenantId(TENANT);
        value.setNickName("user-" + id); value.setVersion(1); value.setStatus("0"); value.setDeleted(0); return value;
    }
    private static SysRole role(Long id, int type, String name) { SysRole value = new SysRole(); value.setRoleId(id); value.setDsType(type); value.setRoleName(name); return value; }
    private static SysUserRole binding(Long user, Long role) { SysUserRole value = new SysUserRole(); value.setUserId(user); value.setRoleId(role); value.setTenantId(TENANT); return value; }
    private static MessageReceiver receiver(String type, Long id) { return MessageReceiver.builder().receiverType(type).receiverId(id).build(); }
    private static void set(Object target, String name, Object value) throws Exception { Field field = target.getClass().getDeclaredField(name); field.setAccessible(true); field.set(target, value); }
    private static <T> T proxy(Class<T> type, InvocationHandler handler) { return type.cast(Proxy.newProxyInstance(type.getClassLoader(), new Class<?>[]{type}, handler)); }
    private static Object invoke(Method method, Object target, Object... values) {
        try { return method.invoke(target, values); }
        catch (InvocationTargetException failure) { if (failure.getCause() instanceof RuntimeException cause) throw cause; throw new AssertionError(failure.getCause()); }
        catch (IllegalAccessException failure) { throw new AssertionError(failure); }
    }
    private static void rejects(Runnable operation, String message) {
        try { operation.run(); } catch (RuntimeException expected) { check(true, message); return; }
        throw new AssertionError(message);
    }
    private static void check(boolean condition, String message) { if (!condition) throw new AssertionError(message); checks++; }
}
