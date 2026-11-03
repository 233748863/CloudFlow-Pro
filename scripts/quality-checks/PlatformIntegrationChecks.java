package com.cloudflow.auth.checks;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.cloudflow.auth.config.properties.TotpProperties;
import com.cloudflow.auth.controller.RemoteAuthController;
import com.cloudflow.auth.domain.SysDept;
import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.auth.domain.SysUserTotp;
import com.cloudflow.auth.mapper.SysDeptMapper;
import com.cloudflow.auth.mapper.SysUserMapper;
import com.cloudflow.auth.mapper.SysUserTotpMapper;
import com.cloudflow.auth.service.SecurityChangeNoticeService;
import com.cloudflow.auth.service.SysDeptAdminService;
import com.cloudflow.auth.service.TotpSecretCipher;
import com.cloudflow.auth.service.TotpService;
import com.cloudflow.auth.util.DeptTreeBuilder;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.event.SystemNoticeCreatedEvent;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.holiday.api.HolidayCalendarService;
import com.cloudflow.common.message.api.MessageSendRequest;
import com.cloudflow.common.message.constant.MessageChannelType;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.fasterxml.jackson.datatype.jsr310.ser.LocalDateTimeSerializer;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.apache.ibatis.builder.MapperBuilderAssistant;

/** Direct integration of the restored platform entry points; no server or external sends. */
public final class PlatformIntegrationChecks {
    private static final Long TENANT = 91001L;
    private static int checks;

    public static void main(String[] arguments) throws Exception {
        MapperBuilderAssistant assistant = new MapperBuilderAssistant(new MybatisConfiguration(), "platform-integration");
        assistant.setCurrentNamespace("platform-integration");
        for (Class<?> type : List.of(SysDept.class, SysUser.class, SysUserTotp.class)) {
            TableInfoHelper.initTableInfo(assistant, type);
        }
        UserContext.setTenantId(TENANT);
        try {
            departments();
            noticeTime();
            disableTotp();
            System.out.println("PLATFORM_INTEGRATION_CHECKS passed=" + checks
                    + "; real_controllers_services=true; mapper=counted_double; mysql=false; http=false");
        } finally {
            UserContext.clear();
        }
    }

    private static void departments() {
        DeptFixture fixture = new DeptFixture();
        List<SysDept> roots = fixture.controller.getDeptTree(TENANT).getData();
        check(roots.size() == 1 && roots.get(0).getChildren().stream().map(SysDept::getDeptId).toList().equals(List.of(11L, 12L)),
                "internal department tree preserves root and sibling order");
        check("负责人".equals(roots.get(0).getLeaderName()) && fixture.batchReads.get() == 1,
                "internal tree resolves names in one batch");
        check(roots.get(0).getChildren().get(1).getLeaderName() == null,
                "internal tree does not expose another tenant's leader name");
        check("负责人".equals(fixture.controller.getDeptById(10L).getData().getLeaderName()),
                "internal detail resolves its leader name");
        check(fixture.controller.getDeptById(999L).getData() == null, "missing department detail stays empty");

        SysDept request = dept(null, null, 91L);
        request.setTenantId(999L);
        request.setHolidayCalendarId(5L);
        Long createdId = fixture.controller.createDept(request).getData();
        check(createdId != null && TENANT.equals(request.getTenantId()), "internal create uses the trusted tenant");
        check(request.getParentId() == 0L && "0".equals(request.getAncestors()) && "0".equals(request.getStatus())
                        && request.getDeleted() == 0 && request.getVersion() == 0,
                "internal root create initializes the persisted department fields");
        check(fixture.calendarReads.get() == 1 && fixture.invalidations.get() == 1,
                "internal create validates calendar and invalidates assignments");
        SysDept child = dept(null, 10L, 91L);
        fixture.controller.createDept(child);
        check("0,10".equals(child.getAncestors()), "internal child create retains the parent's ancestor path");
        int writesBefore = fixture.writes.get();
        for (Long leaderId : List.of(92L, 93L, 94L, 999L)) {
            rejects(() -> fixture.controller.createDept(dept(null, 0L, leaderId)), ServiceException.class,
                    "foreign, disabled, deleted or missing leader rejected: " + leaderId);
        }
        UserContext.setTenantId(null);
        try {
            rejects(() -> fixture.controller.createDept(dept(null, 0L, null)), ServiceException.class,
                    "internal create requires tenant context");
        } finally {
            UserContext.setTenantId(TENANT);
        }
        check(fixture.writes.get() == writesBefore && fixture.invalidations.get() == writesBefore,
                "rejected department creates never write or invalidate calendars");
        rejects(() -> DeptTreeBuilder.build(List.of(dept(1L, 0L, null), dept(1L, 1L, null))),
                IllegalStateException.class, "shared tree retains reachable duplicate and cycle rejection");
    }

    private static void noticeTime() throws Exception {
        ObjectMapper json = new ObjectMapper().findAndRegisterModules();
        JavaTimeModule pageTime = new JavaTimeModule();
        pageTime.addSerializer(LocalDateTime.class, new LocalDateTimeSerializer(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")));
        ObjectMapper pageJson = new ObjectMapper().registerModule(pageTime).disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        for (int nanos : List.of(0, 123456789)) {
            LocalDateTime createdAt = LocalDateTime.of(2026, 11, 3, 9, 10, 11, nanos);
            SystemNoticeCreatedEvent notice = new SystemNoticeCreatedEvent();
            notice.setCreateTime(createdAt);
            for (ObjectMapper writer : List.of(json, pageJson)) {
                String payload = writer.writeValueAsString(notice);
                String expected = createdAt.format(DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSSSSSSSS"));
                check(expected.equals(json.readTree(payload).get("createTime").asText()),
                        "notice time has exactly nine fractional digits under both service formatter configurations");
                BusinessEventEnvelope event = BusinessEventEnvelope.builder().eventId("notice-time")
                        .tenantId(TENANT).occurredAt(createdAt).payload(payload).build();
                BusinessEventEnvelope decoded = json.readValue(writer.writeValueAsString(event), BusinessEventEnvelope.class);
                check(createdAt.equals(decoded.getOccurredAt()) && createdAt.equals(json.readValue(decoded.getPayload(),
                                SystemNoticeCreatedEvent.class).getCreateTime()),
                        "envelope and inner notice timestamps survive the same serialized event without precision loss");
            }
        }
    }

    private static void disableTotp() throws Exception {
        SysUser user = user(91L, TENANT, "0", 0);
        SysUserTotp record = new SysUserTotp();
        record.setId(1L); record.setUserId(user.getUserId()); record.setTenantId(TENANT); record.setEnabled(1);
        AtomicInteger deletions = new AtomicInteger();
        AtomicInteger notices = new AtomicInteger();
        AtomicReference<MessageSendRequest> sent = new AtomicReference<>();
        SysUserTotpMapper mapper = proxy(SysUserTotpMapper.class, (object, method, values) -> {
            if ("selectOne".equals(method.getName())) return record;
            if ("deleteById".equals(method.getName())) { deletions.incrementAndGet(); return 1; }
            throw new AssertionError("Unexpected TOTP mapper call: " + method.getName());
        });
        SecurityChangeNoticeService notifications = new SecurityChangeNoticeService(request -> {
            check(deletions.get() == 1, "deactivation notification follows actual TOTP removal");
            notices.incrementAndGet(); sent.set(request);
        });
        TotpProperties properties = new TotpProperties();
        properties.setEnabled(true); properties.setEncryptionKey("platform-integration-test-key-only-123456789");
        TotpService service = new TotpService(mapper, new TotpSecretCipher(properties), properties, null,
                new ObjectMapper(), notifications);
        service.disable(user);
        check(deletions.get() == 1 && notices.get() == 1 && sent.get().safeReceivers().get(0).getReceiverId().equals(user.getUserId())
                        && sent.get().safeChannelTypes().equals(List.of(MessageChannelType.INTERNAL)),
                "TOTP disable sends exactly one internal notice to the affected user");
        Audit audit = TotpService.class.getMethod("disable", SysUser.class).getAnnotation(Audit.class);
        check(audit != null && audit.highRisk()
                        && SecurityChangeNoticeService.class.getMethod("sendTotpDeactivationNotice", SysUser.class).getAnnotation(Audit.class) == null,
                "deactivation retains the high-risk audit without a duplicate notification audit");
    }

    private static final class DeptFixture {
        private final Map<Long, SysDept> departments = new LinkedHashMap<>();
        private final Map<Long, SysUser> users = new LinkedHashMap<>();
        private final AtomicInteger batchReads = new AtomicInteger();
        private final AtomicInteger writes = new AtomicInteger();
        private final AtomicInteger calendarReads = new AtomicInteger();
        private final AtomicInteger invalidations = new AtomicInteger();
        private final RemoteAuthController controller;

        private DeptFixture() {
            departments.put(10L, dept(10L, 0L, 91L));
            departments.put(11L, dept(11L, 10L, 91L));
            departments.put(12L, dept(12L, 10L, 92L));
            users.put(91L, user(91L, TENANT, "0", 0));
            users.put(92L, user(92L, 91002L, "0", 0));
            users.put(93L, user(93L, TENANT, "1", 0));
            users.put(94L, user(94L, TENANT, "0", 1));
            SysDeptMapper departmentMapper = proxy(SysDeptMapper.class, (object, method, values) -> {
                if ("selectList".equals(method.getName())) return new ArrayList<>(departments.values());
                if ("selectById".equals(method.getName())) return departments.get(values[0]);
                if ("insert".equals(method.getName())) {
                    SysDept added = (SysDept) values[0];
                    added.setDeptId(100L + writes.incrementAndGet()); departments.put(added.getDeptId(), added); return 1;
                }
                throw new AssertionError("Unexpected department mapper call: " + method.getName());
            });
            SysUserMapper userMapper = proxy(SysUserMapper.class, (object, method, values) -> {
                if ("selectById".equals(method.getName())) return users.get(values[0]);
                if ("selectBatchIds".equals(method.getName())) { batchReads.incrementAndGet(); return new ArrayList<>(users.values()); }
                throw new AssertionError("Unexpected leader mapper call: " + method.getName());
            });
            HolidayCalendarService calendars = proxy(HolidayCalendarService.class, (object, method, values) -> {
                if ("getDateType".equals(method.getName())) { calendarReads.incrementAndGet(); return null; }
                if ("invalidateAssignments".equals(method.getName())) { invalidations.incrementAndGet(); return null; }
                throw new AssertionError("Unexpected calendar call: " + method.getName());
            });
            SysDeptAdminService admin = new SysDeptAdminService(departmentMapper, userMapper, null, calendars);
            controller = new RemoteAuthController(departmentMapper, null, null, null, null, admin);
        }
    }

    private static SysDept dept(Long id, Long parent, Long leader) {
        SysDept department = new SysDept();
        department.setDeptId(id); department.setParentId(parent); department.setLeaderUserId(leader);
        department.setTenantId(TENANT); department.setAncestors("0");
        return department;
    }

    private static SysUser user(Long id, Long tenant, String status, int deleted) {
        SysUser user = new SysUser();
        user.setUserId(id); user.setTenantId(tenant); user.setStatus(status); user.setDeleted(deleted); user.setNickName("负责人");
        return user;
    }

    private static <T> T proxy(Class<T> type, InvocationHandler handler) {
        return type.cast(Proxy.newProxyInstance(type.getClassLoader(), new Class<?>[]{type}, handler));
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
        checks++;
    }

    private static void rejects(Runnable action, Class<? extends RuntimeException> expected, String message) {
        try {
            action.run();
        } catch (RuntimeException failure) {
            if (!expected.isInstance(failure)) throw failure;
            checks++;
            return;
        }
        throw new AssertionError(message);
    }
}
