package com.cloudflow.oa.service.impl;

import cn.dev33.satoken.stp.StpLogic;
import cn.dev33.satoken.stp.StpUtil;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.config.GlobalConfig;
import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.cloudflow.common.config.MybatisPlusConfig;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.datascope.DataScopeHandle;
import com.cloudflow.common.event.outbox.OutboxEventMapper;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.oa.domain.OaMeetingAttendance;
import com.cloudflow.oa.domain.dto.OaApprovalRequest;
import com.cloudflow.oa.domain.dto.OaMeetingWorkflowClosed;
import com.cloudflow.common.handler.MyMetaObjectHandler;
import com.cloudflow.common.holiday.api.HolidayCalendarService;
import com.cloudflow.common.tenant.TenantConfigProperties;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.oa.config.properties.OaProperties;
import com.cloudflow.oa.domain.MeetingRoom;
import com.cloudflow.oa.domain.SysScheduleEvent;
import com.cloudflow.oa.domain.dto.MeetingCommands;
import com.cloudflow.oa.domain.vo.MeetingViews;
import com.cloudflow.oa.event.consumer.OaMeetingApprovalWithdrawnConsumer;
import com.cloudflow.oa.mapper.MeetingRoomMapper;
import com.cloudflow.oa.mapper.OaIdentityReferenceMapper;
import com.cloudflow.oa.mapper.OaMeetingAttendanceMapper;
import com.cloudflow.oa.mapper.OaMeetingMapper;
import com.cloudflow.oa.mapper.OaTraceEventMapper;
import com.cloudflow.oa.mapper.SysScheduleEventMapper;
import com.cloudflow.oa.service.IOaTraceEventService;
import com.cloudflow.oa.service.remote.RemoteWorkflowService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.lang.reflect.Field;
import java.lang.reflect.Proxy;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.TransactionTemplate;

public final class OaMeetingDatabaseChecks {
    private static final long TENANT = 100000L;
    private static final long HOST = 9391001L;
    private static final long GUEST = 9391002L;
    private static final long OUTSIDER = 9391003L;
    private static final long FOREIGN = 9391999L;
    private static final AtomicInteger ASSERTIONS = new AtomicInteger();
    private final JdbcTemplate jdbc;
    private final SqlSessionTemplate sessions;
    private final DataSourceTransactionManager transactions;
    private final ObjectMapper json = new ObjectMapper().findAndRegisterModules();
    private final OaMeetingMapper mapper;
    private final OaMeetingAccess access;
    private final OaMeetingInvitationService invitations;
    private final OaMeetingCalendarService calendars;
    private final OaApprovalOutboxService approvals;
    private final OaMeetingWorkflowService workflow;
    private final OaMeetingQueryService queries;
    private final OaMeetingRoomRuleService roomRules;
    private final OaMeetingRecurrence recurrence = new OaMeetingRecurrence();
    private final OaMeetingSeriesService series;
    private final OaMeetingParticipantService participants;
    private final OaMeetingMessageFixture messageFixture;
    private final OaMeetingReminderService reminders;
    private final com.cloudflow.crm.service.impl.CrmParticipantBusyService crmParticipants;
    private final java.util.concurrent.atomic.AtomicBoolean crmUnavailable = new java.util.concurrent.atomic.AtomicBoolean();
    private final IOaTraceEventService trace;
    private final OaProperties properties = new OaProperties() {
        @Override public MeetingRoomConfig getMeetingRoom() { return new MeetingRoomConfig(); }
    };
    private final OaMeetingBookingService bookings;
    private final MeetingRoomServiceImpl rooms;
    private final SysScheduleServiceImpl legacy;
    private final LocalDateTime start = LocalDate.now().plusDays(10).atTime(9, 0);
    private int races;

    public static void main(String[] arguments) throws Exception {
        StpLogic original = StpUtil.getStpLogic();
        try {
            identity(TENANT, HOST);
            OaMeetingDatabaseChecks fixture = new OaMeetingDatabaseChecks(arguments[0]);
            fixture.identityFixtures(); fixture.basic(); fixture.races(); fixture.approvalReservation(); fixture.approvalLifecycle(); fixture.rollback();
            fixture.queryRules(); fixture.series(); fixture.participantConflicts();
            ASSERTIONS.addAndGet(fixture.messageFixture.exercise(fixture.bookings, fixture.rooms)); fixture.races += fixture.messageFixture.races;
            ASSERTIONS.addAndGet(new OaMeetingMinutesFixture(fixture.bookings, fixture.access, fixture.sessions, fixture.jdbc, fixture.transactions,
                    fixture.json, TENANT, HOST, GUEST, OUTSIDER).exercise()); fixture.races++;
            try (OaMeetingPhotoFixture photos = new OaMeetingPhotoFixture(fixture.sessions, fixture.jdbc, fixture.transactions, fixture.rooms, fixture.roomRules, TENANT, HOST, GUEST)) {
                ASSERTIONS.addAndGet(photos.exercise());
            }
            fixture.calendarOptions(); fixture.recurrence.close();
            System.out.println("MEETING_H4_DATABASE: assertions=" + ASSERTIONS.get() + "; failed=0; real_mysql=true; real_services=true; real_transactions=true; real_db_races="
                    + fixture.races + "; http=false; redis=false; identity_and_calendar_fixtures=true; message_pipeline=real_database; email_provider=fixture; production_modified=false");
        } finally { StpUtil.setStpLogic(original); TenantContext.clear(); UserContext.clear(); }
    }

    private OaMeetingDatabaseChecks(String url) throws Exception {
        if (!url.startsWith("jdbc:mysql://127.0.0.1:")) throw new IllegalArgumentException("Only owned loopback MySQL is allowed");
        DriverManagerDataSource source = new DriverManagerDataSource(url, "root", "");
        jdbc = new JdbcTemplate(source);
        String directory = Objects.requireNonNull(jdbc.queryForObject("SELECT @@datadir", String.class)).replace('\\', '/');
        if (!directory.contains("/target/batch-f-mysql-")) throw new IllegalArgumentException("Unexpected database directory");
        MybatisConfiguration configuration = new MybatisConfiguration(); configuration.setMapUnderscoreToCamelCase(true);
        configuration.setLogImpl(org.apache.ibatis.logging.nologging.NoLoggingImpl.class);
        configuration.addMappers("com.cloudflow.oa.mapper"); configuration.addMappers("com.cloudflow.common.event.outbox"); configuration.addMappers("com.cloudflow.common.audit.mapper");
        configuration.addMapper(com.cloudflow.crm.mapper.CrmActivityMapper.class);
        configuration.addMappers("com.cloudflow.auth.mapper");
        configuration.addMappers("com.cloudflow.common.tenant.quota.mapper");
        MybatisPlusConfig plugins = new MybatisPlusConfig(new TenantConfigProperties());
        field(plugins, "dataScopeHandle", (DataScopeHandle) scope -> {
            if (Objects.equals(UserContext.getDsType(), 0)) return true;
            scope.setUserId(UserContext.getUserId()); scope.setDeptList(List.of()); return false;
        });
        GlobalConfig global = new GlobalConfig(); global.setDbConfig(new GlobalConfig.DbConfig().setLogicDeleteField("deleted").setLogicDeleteValue("1").setLogicNotDeleteValue("0"));
        global.setMetaObjectHandler(new MyMetaObjectHandler());
        MybatisSqlSessionFactoryBean factory = new MybatisSqlSessionFactoryBean(); factory.setDataSource(source); factory.setConfiguration(configuration);
        factory.setGlobalConfig(global); factory.setPlugins(plugins.mybatisPlusInterceptor());
        factory.setMapperLocations(new PathMatchingResourcePatternResolver().getResources("classpath*:mapper/**/*Mapper.xml"));
        sessions = new SqlSessionTemplate(Objects.requireNonNull(factory.getObject())); transactions = new DataSourceTransactionManager(source);
        mapper = sessions.getMapper(OaMeetingMapper.class);
        access = new OaMeetingAccess(mapper, sessions.getMapper(SysScheduleEventMapper.class));
        invitations = new OaMeetingInvitationService(mapper, sessions.getMapper(OaMeetingAttendanceMapper.class), sessions.getMapper(OaIdentityReferenceMapper.class), json);
        HolidayCalendarService calendarFixture = (HolidayCalendarService) Proxy.newProxyInstance(HolidayCalendarService.class.getClassLoader(), new Class<?>[]{HolidayCalendarService.class},
                (proxy, method, values) -> {
                    if (method.getName().equals("getDateType")) return mapper.calendarFact(TENANT, (Long) values[0], (LocalDate) values[1]);
                    throw new IllegalStateException("Unexpected calendar operation " + method.getName());
                });
        calendars = new OaMeetingCalendarService(mapper, calendarFixture);
        crmParticipants = new com.cloudflow.crm.service.impl.CrmParticipantBusyService(sessions.getMapper(com.cloudflow.crm.mapper.CrmActivityMapper.class));
        participants = transactional(new OaMeetingParticipantService(mapper, access, invitations, sessions.getMapper(OaIdentityReferenceMapper.class),
                (people, from, to) -> {
                    if (org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive()) throw new AssertionError("CRM通信不可持有业务事务");
                    if (crmUnavailable.get()) throw new IllegalStateException("CRM隔离故障夹具");
                    DateTimeFormatter format = java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
                    return com.cloudflow.common.core.domain.R.ok(crmParticipants.query(people, LocalDateTime.parse(from, format), LocalDateTime.parse(to, format)));
                }));
        OaTraceEventServiceImpl tracing = new OaTraceEventServiceImpl(json); field(tracing, "baseMapper", sessions.getMapper(OaTraceEventMapper.class)); trace = tracing;
        messageFixture = new OaMeetingMessageFixture(sessions, jdbc, transactions, access, mapper, trace, json, TENANT, HOST, GUEST, OUTSIDER);
        reminders = messageFixture.reminders;
        approvals = new OaApprovalOutboxService(new OutboxPublisher(sessions.getMapper(OutboxEventMapper.class), json), json, trace, sessions.getMapper(OaTraceEventMapper.class));
        workflow = new OaMeetingWorkflowService(access, mapper, approvals, reminders, new OutboxPublisher(sessions.getMapper(OutboxEventMapper.class), json), trace, json, transactions);
        queries = transactional(new OaMeetingQueryService(mapper, sessions.getMapper(MeetingRoomMapper.class), access, calendars, properties));
        roomRules = transactional(new OaMeetingRoomRuleService(mapper, calendars, queries, trace, json));
        bookings = service(trace);
        series = new OaMeetingSeriesService(access, mapper, sessions.getMapper(SysScheduleEventMapper.class), bookings, workflow, recurrence, participants, reminders, transactions, json);
        MeetingRoomServiceImpl roomTarget = new MeetingRoomServiceImpl(mapper); field(roomTarget, "baseMapper", sessions.getMapper(MeetingRoomMapper.class));
        rooms = transactional(roomTarget);
        SysScheduleServiceImpl legacyTarget = new SysScheduleServiceImpl(); field(legacyTarget, "baseMapper", sessions.getMapper(SysScheduleEventMapper.class));
        field(legacyTarget, "meetings", bookings); field(legacyTarget, "meetingAccess", access); field(legacyTarget, "meetingQueries", queries); legacy = transactional(legacyTarget);
        StpUtil.setStpLogic(new StpLogic("meeting-db-check") { @Override public boolean hasPermission(String permission) {
            return Objects.equals(UserContext.getUserId(), HOST) && "oa:meeting:manage".equals(permission);
        } });
    }

    private OaMeetingBookingService service(IOaTraceEventService tracer) {
        return new OaMeetingBookingService(access, mapper, sessions.getMapper(SysScheduleEventMapper.class), invitations, participants, reminders, calendars,
                sessions.getMapper(OaIdentityReferenceMapper.class), approvals, workflow, tracer, transactions, properties, json);
    }

    private void identityFixtures() {
        jdbc.update("INSERT INTO sys_tenant(tenant_id,tenant_code,tenant_name,status,storage_limit) VALUES(?, 'H4_OTHER_TENANT', 'H4独立库第二租户', '0', 10240)", TENANT + 1);
        for (long userId : new long[]{HOST, GUEST, OUTSIDER}) {
            jdbc.update("INSERT INTO sys_user(user_id,tenant_id,dept_id,user_name,nick_name,status,deleted) VALUES(?,?,?,?,?,'0',0)",
                    userId, TENANT, 100L, "meeting-check-" + userId, "会议数据库检查" + userId);
        }
        jdbc.update("INSERT INTO sys_user_role(user_id,role_id,tenant_id) VALUES(?,?,?)", HOST, 5L, TENANT);
        jdbc.update("INSERT INTO sys_user_role(user_id,role_id,tenant_id) VALUES(?,?,?)", GUEST, 1L, TENANT);
        jdbc.update("INSERT INTO sys_user(user_id,tenant_id,dept_id,user_name,nick_name,status,deleted) VALUES(?,?,?,?,?,'0',0)",
                FOREIGN, TENANT + 1, 100L, "meeting-foreign-check", "其他租户会议检查");
        equal(374L, count("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE()"), "当前批准的正式脚本374表");
        equal(10L, count("SELECT COUNT(*) FROM sys_menu WHERE menu_id BETWEEN 1950 AND 1969"), "H4十个菜单均在批准段位内");
        equal(7L, count("SELECT COUNT(*) FROM sys_role_menu WHERE tenant_id=100000 AND role_id=5 AND menu_id BETWEEN 1950 AND 1969"), "EMPLOYEE仅有两项读取及五项本人写权限");
        equal(0L, count("SELECT COUNT(*) FROM sys_role_menu WHERE tenant_id=100000 AND role_id=5 AND menu_id BETWEEN 1950 AND 1969 AND menu_id NOT IN(1950,1952,1953,1954,1955,1958,1959)"), "EMPLOYEE没有会议室管理或他人会议写权限");
    }

    private void calendarOptions() {
        for (int index = 0; index < 51; index++) {
            jdbc.update("INSERT INTO sys_holiday_calendar(tenant_id,calendar_code,calendar_name,status,deleted) VALUES(?,?,?,'ENABLED',0)",
                    TENANT, "H4_OPTION_" + index, "H4可选日历" + index);
        }
        jdbc.update("INSERT INTO sys_holiday_calendar(tenant_id,calendar_code,calendar_name,status,deleted) VALUES(?, 'H4_DISABLED', 'H4停用', 'DISABLED',0),(?, 'H4_DELETED', 'H4删除', 'ENABLED',1),(?, 'H4_FOREIGN', 'H4外租户', 'ENABLED',0)", TENANT, TENANT, TENANT + 1);
        long expected = count("SELECT COUNT(*) FROM sys_holiday_calendar WHERE tenant_id=? AND status='ENABLED' AND deleted=0", TENANT);
        PageResult<MeetingViews.CalendarOption> first = roomRules.calendars(1, 50); PageResult<MeetingViews.CalendarOption> second = roomRules.calendars(2, 50);
        equal(expected, first.getTotal(), "房间规则日历选项仅统计本租户启用日历");
        equal(50, first.getRows().size(), "日历选择第一页明确分页50条");
        equal(expected - 50, (long) second.getRows().size(), "第51个及后续可选日历不会被截断");
        check(java.util.stream.Stream.concat(first.getRows().stream(), second.getRows().stream()).noneMatch(value -> Set.of("H4停用", "H4删除", "H4外租户").contains(value.calendarName())), "停用、删除与外租户日历都不可选");
        reject("MEETING_PAGE_INVALID", () -> roomRules.calendars(1, 51), "日历选项每页上限不可绕过");
        MeetingRoom fresh = new MeetingRoom(); fresh.setName("H4无效日历绑定"); fresh.setCapacity(8); fresh.setStatus("1"); fresh.setHolidayCalendarId(Long.MAX_VALUE);
        reject("ROOM_CALENDAR_UNAVAILABLE", () -> rooms.createRoom(fresh), "新建房间不能绑定不存在的日历");
        fresh.setHolidayCalendarId(first.getRows().get(0).calendarId()); rooms.createRoom(fresh);
        Long roomId = jdbc.queryForObject("SELECT room_id FROM oa_meeting_room WHERE tenant_id=? AND name=?", Long.class, TENANT, fresh.getName());
        MeetingCommands.Rule change = new MeetingCommands.Rule(); change.setVersion(rooms.getById(roomId).getVersion());
        change.setHolidayCalendarId(jdbc.queryForObject("SELECT calendar_id FROM sys_holiday_calendar WHERE tenant_id=? AND calendar_code='H4_FOREIGN'", Long.class, TENANT + 1));
        reject("ROOM_CALENDAR_UNAVAILABLE", () -> roomRules.save(roomId, change), "规则修改不能绑定其他租户日历");
        change.setHolidayCalendarId(jdbc.queryForObject("SELECT calendar_id FROM sys_holiday_calendar WHERE tenant_id=? AND calendar_code='H4_DISABLED'", Long.class, TENANT));
        reject("ROOM_CALENDAR_UNAVAILABLE", () -> roomRules.save(roomId, change), "规则修改不能绑定停用日历");
    }

    private Long room(String name, Integer capacity, Long approver) {
        MeetingRoom room = new MeetingRoom(); room.setName(name); room.setCapacity(capacity); room.setStatus("1");
        room.setBufferMinutes(10); room.setMinBookingMinutes(15); room.setMaxBookingMinutes(180);
        room.setNeedApprovalFlag(approver == null ? 0 : 1); room.setApproverId(approver);
        check(rooms.createRoom(room), "真实服务创建会议室 " + name);
        return jdbc.queryForObject("SELECT room_id FROM oa_meeting_room WHERE tenant_id=? AND name=?", Long.class, TENANT, name);
    }

    private MeetingCommands.Booking command(Long roomId, String name, LocalDateTime at) {
        MeetingCommands.Booking request = new MeetingCommands.Booking(); request.setTitle(name); request.setRoomId(roomId);
        request.setStartTime(at); request.setEndTime(at.plusHours(1)); request.setAttendeeIds(List.of(GUEST)); request.setExpectedAttendees(2);
        request.setConfirmParticipantConflicts(true);
        return request;
    }

    private void basic() throws Exception {
        Long roomId = room("H4基本规则", 5, null);
        SysScheduleEvent created = bookings.create(command(roomId, "H4实测基本会议", start));
        equal("PLANNED", created.getStatus(), "会议初始计划状态");
        equal(1L, count("SELECT COUNT(*) FROM oa_schedule_event WHERE event_id=? AND tenant_id=? AND creator_id=?", created.getEventId(), TENANT, HOST), "真实会议入库及归属");
        equal(2L, count("SELECT COUNT(*) FROM oa_meeting_attendance WHERE schedule_event_id=? AND tenant_id=? AND minutes_id IS NULL AND acceptance_status='NONE' AND attend_status='NOT_CHECKED'", created.getEventId(), TENANT), "会前两份邀请无虚构签到或纪要");
        equal(10, created.getBufferMinutesSnapshot(), "真实保存会后缓冲快照");
        reject("MEETING_ROOM_CONFLICT", () -> bookings.create(command(roomId, "H4冲突拒绝", start.plusMinutes(69))), "缓冲内一分钟拒绝");
        SysScheduleEvent adjacent = bookings.create(command(roomId, "H4缓冲边界", start.plusMinutes(70)));
        equal(start.plusMinutes(70), adjacent.getStartTime(), "会后十分钟整允许预约");
        MeetingCommands.Booking overCapacity = command(roomId, "H4超容量", start.plusDays(1)); overCapacity.setExpectedAttendees(6);
        reject("ROOM_CAPACITY_EXCEEDED", () -> bookings.create(overCapacity), "真实超容量拒绝");
        identity(TENANT, GUEST);
        OaMeetingAttendance response = bookings.respond(created.getEventId(), new MeetingCommands.Response(created.getScheduleVersion(), "ACCEPTED"));
        equal("ACCEPTED", response.getAcceptanceStatus(), "受邀本人接受");
        equal(0L, count("SELECT COUNT(*) FROM oa_meeting_attendance WHERE schedule_event_id=? AND check_in_time IS NOT NULL", created.getEventId()), "回应不产生签到");
        identity(TENANT, OUTSIDER);
        reject("MEETING_INVITATION_REQUIRED", () -> bookings.respond(created.getEventId(), new MeetingCommands.Response(created.getScheduleVersion(), "DECLINED")), "未受邀本人拒绝回应");
        MeetingCommands.Booking otherEdit = command(roomId, "H4他人修改", start.plusDays(1)); otherEdit.setVersion(created.getVersion());
        reject("MEETING_OWNER_REQUIRED", () -> bookings.update(created.getEventId(), otherEdit), "同租户他人不能编辑");
        reject("MEETING_OWNER_REQUIRED", () -> bookings.cancel(created.getEventId(), new MeetingCommands.Change(created.getVersion(), "他人取消", null)), "同租户他人不能取消");
        SysScheduleEvent hidden = legacy.getRoomEvents(roomId, start.toLocalDate().toString()).stream().filter(event -> event.getEventId().equals(created.getEventId())).findFirst().orElseThrow();
        equal("忙碌时段", hidden.getTitle(), "旧房间接口隐藏他人会议标题");
        check(hidden.getAttendees() == null && hidden.getDescription() == null && hidden.getCreatorId() == null, "旧房间接口无参会人和创建人泄露");
        identity(TENANT + 1, FOREIGN);
        reject("MEETING_NOT_FOUND", () -> access.get(created.getEventId()), "跨租户日程拒绝");
        MeetingCommands.Booking foreignBooking = command(roomId, "H4跨租户创建", start.plusDays(1)); foreignBooking.setAttendeeIds(List.of());
        reject("ROOM_UNAVAILABLE", () -> bookings.create(foreignBooking), "跨租户房间拒绝");
        identity(TENANT, HOST);
        LocalDateTime checkInFixture = start.minusMinutes(1);
        jdbc.update("UPDATE oa_meeting_attendance SET attend_status='LATE',check_in_time=? WHERE tenant_id=? AND schedule_event_id=? AND user_id=?", checkInFixture, TENANT, created.getEventId(), GUEST);
        MeetingCommands.Booking editing = command(roomId, "H4改期", start.plusHours(3)); editing.setVersion(created.getVersion());
        SysScheduleEvent changed = bookings.update(created.getEventId(), editing);
        equal(created.getScheduleVersion() + 1, changed.getScheduleVersion(), "改期增加邀请版本");
        equal("NONE", scalar("SELECT acceptance_status FROM oa_meeting_attendance WHERE schedule_event_id=? AND user_id=?", created.getEventId(), GUEST), "改期重置接受状态");
        equal("LATE", scalar("SELECT attend_status FROM oa_meeting_attendance WHERE schedule_event_id=? AND user_id=?", created.getEventId(), GUEST), "改期保留已有出席事实夹具");
        equal(checkInFixture, jdbc.queryForObject("SELECT check_in_time FROM oa_meeting_attendance WHERE schedule_event_id=? AND user_id=?", LocalDateTime.class, created.getEventId(), GUEST), "改期保留已有签到时间夹具");
        reject("MEETING_VERSION_CONFLICT", () -> bookings.update(created.getEventId(), editing), "陈旧版本不覆盖新会议");
        identity(TENANT, GUEST);
        reject("MEETING_INVITATION_EXPIRED", () -> bookings.respond(created.getEventId(), new MeetingCommands.Response(created.getScheduleVersion(), "ACCEPTED")), "旧邀请版本拒绝");
        identity(TENANT, HOST);
        editing.setVersion(changed.getVersion()); editing.setAttendeeIds(List.of());
        SysScheduleEvent withoutGuest = bookings.update(created.getEventId(), editing);
        equal(1L, count("SELECT COUNT(*) FROM oa_meeting_attendance WHERE schedule_event_id=? AND user_id=? AND deleted=1 AND attend_status='LATE'", created.getEventId(), GUEST), "移除参会人保留历史");
        identity(TENANT, GUEST);
        reject("MEETING_INVITATION_REQUIRED", () -> bookings.respond(created.getEventId(), new MeetingCommands.Response(withoutGuest.getScheduleVersion(), "ACCEPTED")), "被移除人员不能回应");
        identity(TENANT, HOST);
        bookings.cancel(created.getEventId(), new MeetingCommands.Change(withoutGuest.getVersion(), "会议数据库专项取消", null));
        equal("CANCELLED", scalar("SELECT status FROM oa_schedule_event WHERE event_id=?", created.getEventId()), "取消保存五态记录");
        equal(0L, count("SELECT deleted FROM oa_schedule_event WHERE event_id=?", created.getEventId()), "取消不删除历史");
        check(bookings.create(command(roomId, "H4取消后重新预约", start.plusHours(3))).getEventId() != null, "取消立即释放占位");
        check(count("SELECT COUNT(*) FROM oa_trace_event WHERE business_type='OA_MEETING_BOOKING' AND business_id=?", created.getEventId()) >= 4, "真实审计事件保存");
        SysScheduleEvent legacyInput = new SysScheduleEvent(); legacyInput.setTitle("H4旧入口字段白名单"); legacyInput.setRoomId(roomId);
        legacyInput.setStartTime(start.plusDays(2)); legacyInput.setEndTime(start.plusDays(2).plusHours(1)); legacyInput.setAttendees("[9391002]");
        legacyInput.setTenantId(TENANT + 1); legacyInput.setStatus("COMPLETED"); legacyInput.setApprovalStatus("APPROVED"); legacyInput.setCreatorId(HOST);
        legacy.createEvent(legacyInput);
        equal("PLANNED", legacyInput.getStatus(), "旧入口不能直接写完成状态");
        equal("NOT_REQUIRED", legacyInput.getApprovalStatus(), "旧入口不能伪造审批状态");
        equal(TENANT, legacyInput.getTenantId(), "旧入口忽略伪造租户并使用可信上下文");
        List<SysScheduleEvent> rootEvents = sessions.getMapper(SysScheduleEventMapper.class).getMyEvents(1L, start.plusDays(2), start.plusDays(3));
        check(rootEvents.stream().noneMatch(event -> event.getEventId().equals(legacyInput.getEventId())), "参会人按完整ID匹配，1不能命中9391001");
        legacyInput.setCreatorId(OUTSIDER);
        reject("MEETING_OWNER_REQUIRED", () -> legacy.createEvent(legacyInput), "旧入口拒绝代他人创建");
        MeetingRoom roomUpdate = sessions.getMapper(MeetingRoomMapper.class).selectById(roomId); roomUpdate.setStatus("0");
        reject("ROOM_EXISTING_BOOKINGS", () -> rooms.updateRoom(roomUpdate), "旧会议室入口不能停用有效预约房间");
        reject("ROOM_EXISTING_BOOKINGS", () -> rooms.removeRoom(roomId, roomUpdate.getVersion()), "旧会议室入口不能删除有效预约房间");
    }

    private void races() throws Exception {
        for (int round = 0; round < 3; round++) {
            Long roomId = room("H4抢订" + round, 5, null);
            LocalDateTime at = start.plusDays(3 + round);
            List<String> results = race(() -> bookings.create(command(roomId, "H4竞争甲", at)), () -> bookings.create(command(roomId, "H4竞争乙", at)));
            equal(1L, results.stream().filter("SUCCESS"::equals).count(), "外层旧快照并发抢订仅一份成功 " + round);
            equal(1L, results.stream().filter("MEETING_ROOM_CONFLICT"::equals).count(), "竞争者明确房间冲突 " + round);
            equal(1L, count("SELECT COUNT(*) FROM oa_schedule_event WHERE tenant_id=? AND room_id=? AND start_time=?", TENANT, roomId, at), "并发数据库仅一份占位 " + round);
            races++;
        }
        Long firstRoom = room("H4换房甲", 5, null); Long secondRoom = room("H4换房乙", 5, null);
        SysScheduleEvent first = bookings.create(command(firstRoom, "H4换房会议甲", start.plusDays(7)));
        SysScheduleEvent second = bookings.create(command(secondRoom, "H4换房会议乙", start.plusDays(7).plusHours(3)));
        MeetingCommands.Booking firstMove = command(secondRoom, first.getTitle(), first.getStartTime()); firstMove.setVersion(first.getVersion());
        MeetingCommands.Booking secondMove = command(firstRoom, second.getTitle(), second.getStartTime()); secondMove.setVersion(second.getVersion());
        List<String> swaps = race(() -> bookings.update(first.getEventId(), firstMove), () -> bookings.update(second.getEventId(), secondMove));
        equal(List.of("SUCCESS", "SUCCESS"), swaps, "相反方向换房按房间ID顺序锁定无死锁"); races++;
        equal(secondRoom, access.get(first.getEventId()).getRoomId(), "换房甲写入正确");
        equal(firstRoom, access.get(second.getEventId()).getRoomId(), "换房乙写入正确");
        SysScheduleEvent current = access.get(first.getEventId());
        MeetingCommands.Booking firstEdit = command(secondRoom, "H4双写甲", current.getStartTime().plusDays(1)); firstEdit.setVersion(current.getVersion());
        MeetingCommands.Booking secondEdit = command(secondRoom, "H4双写乙", current.getStartTime().plusDays(1)); secondEdit.setVersion(current.getVersion());
        List<String> versions = race(() -> bookings.update(current.getEventId(), firstEdit), () -> bookings.update(current.getEventId(), secondEdit));
        equal(1L, versions.stream().filter("SUCCESS"::equals).count(), "同会议版本竞争仅一个成功");
        equal(1L, versions.stream().filter("MEETING_VERSION_CONFLICT"::equals).count(), "同版本另一修改拒绝"); races++;
    }

    private List<String> race(Callable<?> first, Callable<?> second) throws Exception {
        CyclicBarrier snapshots = new CyclicBarrier(2);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            List<Callable<String>> tasks = List.of(racer(first, snapshots), racer(second, snapshots));
            List<Future<String>> futures = tasks.stream().map(pool::submit).toList();
            List<String> result = new java.util.ArrayList<>();
            for (Future<String> future : futures) result.add(future.get(25, TimeUnit.SECONDS));
            return result;
        } finally { pool.shutdownNow(); pool.awaitTermination(5, TimeUnit.SECONDS); identity(TENANT, HOST); }
    }

    private Callable<String> racer(Callable<?> operation, CyclicBarrier snapshots) {
        return () -> {
            identity(TENANT, HOST);
            try {
                return new TransactionTemplate(transactions).execute(status -> {
                    jdbc.queryForObject("SELECT COUNT(*) FROM oa_schedule_event WHERE tenant_id=?", Long.class, TENANT);
                    try { snapshots.await(8, TimeUnit.SECONDS); operation.call(); return "SUCCESS"; }
                    catch (ServiceException failure) { throw failure; }
                    catch (Exception failure) { throw new IllegalStateException(failure); }
                });
            } catch (ServiceException failure) { return failure.getMessage().split(":", 2)[0]; }
            finally { TenantContext.clear(); UserContext.clear(); }
        };
    }

    private void approvalReservation() {
        Long roomId = room("H4需审批", 5, GUEST);
        SysScheduleEvent pending = bookings.create(command(roomId, "H4真实审批发件箱", start));
        equal("PENDING", pending.getApprovalStatus(), "需审批预约进入PENDING");
        check(pending.getInstanceId().startsWith("F:"), "流程未启动时仅保存可重试预占标识");
        equal(1L, count("SELECT COUNT(*) FROM outbox_event WHERE tenant_id=? AND aggregate_id=? AND event_type='OA_F_APPROVAL_SUBMITTED' AND status='PENDING'", TENANT, pending.getEventId()), "审批请求与预约同事务持久化");
        reject("MEETING_ROOM_CONFLICT", () -> bookings.create(command(roomId, "H4待审批也占位", start)), "PENDING占位拒绝竞争");
        reject("MEETING_APPROVAL_REQUIRED", () -> bookings.state(pending.getEventId(), new MeetingCommands.Change(pending.getVersion(), null, "IN_PROGRESS")), "未经批准不可开始");
        Long selfRoom = room("H4禁止自批", 5, HOST);
        reject("MEETING_SELF_APPROVAL_FORBIDDEN", () -> bookings.create(command(selfRoom, "H4自批拒绝", start)), "审批人为本人须配置替代人");
        equal(0L, count("SELECT COUNT(*) FROM oa_schedule_event WHERE room_id=?", selfRoom), "自批失败不落库");
        MeetingCommands.Booking draft = command(roomId, "H4草稿不占位", start); draft.setDraft(true);
        SysScheduleEvent saved = bookings.create(draft);
        equal("DRAFT", saved.getApprovalStatus(), "已占用时仍可保存草稿");
        equal(0L, count("SELECT COUNT(*) FROM oa_meeting_attendance WHERE schedule_event_id=?", saved.getEventId()), "草稿不发邀请");
        reject("MEETING_ROOM_CONFLICT", () -> bookings.submit(saved.getEventId(), saved.getVersion()), "提交草稿临近提交再次检查冲突");
        bookings.cancel(pending.getEventId(), new MeetingCommands.Change(pending.getVersion(), "撤回审批", null));
        SysScheduleEvent submitted = bookings.submit(saved.getEventId(), saved.getVersion(), true);
        equal("PENDING", submitted.getApprovalStatus(), "撤回后另一草稿可提交并占位");
    }

    private void rollback() {
        Long roomId = room("H4原子回滚", 5, GUEST);
        long eventsBefore = count("SELECT COUNT(*) FROM oa_schedule_event");
        long invitationsBefore = count("SELECT COUNT(*) FROM oa_meeting_attendance");
        long outboxBefore = count("SELECT COUNT(*) FROM outbox_event");
        IOaTraceEventService brokenTrace = (IOaTraceEventService) Proxy.newProxyInstance(IOaTraceEventService.class.getClassLoader(), new Class<?>[]{IOaTraceEventService.class},
                (proxy, method, values) -> { throw new IllegalStateException("MEETING_TRACE_FAILURE_INJECTED"); });
        try { service(brokenTrace).create(command(roomId, "H4回滚失败注入", start)); throw new AssertionError("Failure injection did not fail"); }
        catch (IllegalStateException failure) { check(failure.getMessage().contains("MEETING_TRACE_FAILURE_INJECTED"), "已注入审计写入失败"); }
        equal(eventsBefore, count("SELECT COUNT(*) FROM oa_schedule_event"), "失败回滚会议");
        equal(invitationsBefore, count("SELECT COUNT(*) FROM oa_meeting_attendance"), "失败回滚邀请");
        equal(outboxBefore, count("SELECT COUNT(*) FROM outbox_event"), "失败回滚审批请求");
    }

    private void approvalLifecycle() throws Exception {
        Long roomId = room("H4审批闭环", 5, GUEST);
        SysScheduleEvent pending = bookings.create(command(roomId, "H4批准", start));
        OaApprovalRequest request = submission(pending);
        String instanceId = "meeting-approval-" + pending.getEventId();
        workflow.bind(request, instanceId); workflow.bind(request, instanceId);
        equal(instanceId, access.get(pending.getEventId()).getInstanceId(), "真实审批快照绑定实例");
        equal(1L, count("SELECT COUNT(*) FROM oa_trace_event WHERE business_type='OA_MEETING_BOOKING' AND business_id=? AND event_type='APPROVAL_BOUND'", pending.getEventId()), "重复绑定仅一份快照");
        ApprovalResultDTO approved = decision(request, instanceId, true);
        approved.setApproverId(HOST);
        invalid("MEETING_APPROVER_INVALID", () -> workflow.decision(approved, true), "回调本人自批拒绝");
        approved.setApproverId(GUEST); approved.setVariables(java.util.Map.of("oaRequestToken", "F:wrong-token"));
        invalid("MEETING_APPROVAL_TOKEN_INVALID", () -> workflow.decision(approved, true), "错误提交令牌拒绝");
        approved.setVariables(java.util.Map.of("oaRequestToken", request.getReservation()));
        workflow.decision(approved, true);
        equal("APPROVED", access.get(pending.getEventId()).getApprovalStatus(), "合法独立审批人通过预约");
        int approvedVersion = access.get(pending.getEventId()).getVersion();
        workflow.decision(approved, true);
        equal(approvedVersion, access.get(pending.getEventId()).getVersion(), "批准回调重放不重复写业务");
        SysScheduleEvent rejected = bookings.create(command(roomId, "H4拒绝", start.plusDays(1)));
        OaApprovalRequest rejectedRequest = submission(rejected); workflow.bind(rejectedRequest, "meeting-rejected");
        workflow.decision(decision(rejectedRequest, "meeting-rejected", false), false);
        equal("CANCELLED", access.get(rejected.getEventId()).getStatus(), "审批拒绝取消会议");
        equal("REJECTED", access.get(rejected.getEventId()).getApprovalStatus(), "会议五态独立保留拒绝审批状态");
        check(bookings.create(command(roomId, "H4拒绝后释放", start.plusDays(1))).getEventId() != null, "审批拒绝释放房间");
        SysScheduleEvent changing = bookings.create(command(roomId, "H4待批改期", start.plusDays(2)));
        OaApprovalRequest oldRequest = submission(changing); workflow.bind(oldRequest, "meeting-old-instance");
        SysScheduleEvent bound = access.get(changing.getEventId());
        MeetingCommands.Booking change = command(roomId, "H4改后重新审批", start.plusDays(3)); change.setVersion(bound.getVersion());
        SysScheduleEvent updated = bookings.update(bound.getEventId(), change);
        check(updated.getInstanceId().startsWith("F:") && !Objects.equals(oldRequest.getReservation(), updated.getInstanceId()), "待审批改期生成独立新提交令牌");
        equal(1L, count("SELECT COUNT(*) FROM outbox_event WHERE event_type='OA_MEETING_APPROVAL_WITHDRAWN' AND aggregate_id=?", updated.getEventId()), "改期可靠登记旧实例作废");
        workflow.decision(decision(oldRequest, "meeting-old-instance", true), true);
        equal("PENDING", access.get(updated.getEventId()).getApprovalStatus(), "旧批准回调不批准新预约");
        OaApprovalRequest newRequest = submission(updated); workflow.bind(newRequest, "meeting-new-instance");
        OaMeetingWorkflowClosed closed = new OaMeetingWorkflowClosed(TENANT, OaMeetingBookingService.BUSINESS_TYPE, updated.getEventId(), "meeting-new-instance", newRequest.getReservation(), "CANCELLED");
        workflow.closed(closed); workflow.closed(closed);
        equal("CANCELLED", access.get(updated.getEventId()).getStatus(), "流程撤回可靠关闭对应会议且重放幂等");
        workflow.decision(decision(newRequest, "meeting-new-instance", true), true);
        equal("CANCELLED", access.get(updated.getEventId()).getStatus(), "撤回后延迟批准不能复活");
        SysScheduleEvent beforeStart = bookings.create(command(roomId, "H4启动竞争", start.plusDays(4)));
        OaApprovalRequest delayed = submission(beforeStart);
        bookings.cancel(beforeStart.getEventId(), new MeetingCommands.Change(beforeStart.getVersion(), "启动期间取消", null));
        check(workflow.currentInstance(beforeStart.getEventId()) == null, "取消后的提交消息不再启动流程");
        workflow.bind(delayed, "meeting-started-after-cancellation");
        equal("CANCELLED", access.get(beforeStart.getEventId()).getStatus(), "启动返回晚于取消不覆盖会议状态");
        equal(1L, count("SELECT COUNT(*) FROM outbox_event WHERE event_type='OA_MEETING_APPROVAL_WITHDRAWN' AND aggregate_id=?", beforeStart.getEventId()), "在途启动完成后可靠作废真实实例");
        SysScheduleEvent expiring = bookings.create(command(roomId, "H4未批逾期", start.plusDays(5)));
        OaApprovalRequest expiryRequest = submission(expiring); workflow.bind(expiryRequest, "meeting-expired-instance");
        jdbc.update("UPDATE oa_schedule_event SET start_time=?,end_time=? WHERE tenant_id=? AND event_id=?", LocalDateTime.now().minusHours(2), LocalDateTime.now().minusHours(1), TENANT, expiring.getEventId());
        workflow.expirePending(); workflow.expirePending();
        equal("NOT_HELD", access.get(expiring.getEventId()).getStatus(), "定时任务将已过结束时间的未批会议标为未举行");
        equal(1L, count("SELECT COUNT(*) FROM outbox_event WHERE event_type='OA_MEETING_APPROVAL_WITHDRAWN' AND aggregate_id=?", expiring.getEventId()), "逾期任务重复运行不重复发作废请求");
        equal(1L, count("SELECT COUNT(*) FROM oa_trace_event WHERE business_id=? AND event_type='MEETING_APPROVAL_EXPIRED'", expiring.getEventId()), "逾期关闭有真实审计且仅一份");
        SysScheduleEvent racing = bookings.create(command(roomId, "H4绑定与取消并发", start.plusDays(6)));
        OaApprovalRequest racingRequest = submission(racing);
        List<String> result = race(() -> { workflow.bind(racingRequest, "meeting-racing-instance"); return null; },
                () -> bookings.cancel(racing.getEventId(), new MeetingCommands.Change(racing.getVersion(), "绑定并发取消", null)));
        check(result.stream().allMatch(value -> Set.of("SUCCESS", "MEETING_VERSION_CONFLICT").contains(value)), "真实绑定取消并发只有成功或明确版本冲突");
        SysScheduleEvent afterRace = access.get(racing.getEventId());
        if (!"CANCELLED".equals(afterRace.getStatus())) bookings.cancel(afterRace.getEventId(), new MeetingCommands.Change(afterRace.getVersion(), "刷新后确认取消", null));
        equal("CANCELLED", access.get(racing.getEventId()).getStatus(), "绑定取消竞争后可可靠取消");
        check(count("SELECT COUNT(*) FROM outbox_event WHERE event_type='OA_MEETING_APPROVAL_WITHDRAWN' AND aggregate_id=?", racing.getEventId()) >= 1, "绑定取消竞争不遗留未登记的在途审批");
        races++; deferredInvalidation(beforeStart.getEventId());
    }

    private OaApprovalRequest submission(SysScheduleEvent event) throws Exception {
        List<String> rows = jdbc.queryForList("SELECT payload_json FROM outbox_event WHERE tenant_id=? AND aggregate_id=? AND event_type='OA_F_APPROVAL_SUBMITTED' ORDER BY id DESC", String.class, TENANT, event.getEventId());
        for (String row : rows) {
            BusinessEventEnvelope envelope = json.readValue(row, BusinessEventEnvelope.class);
            OaApprovalRequest request = json.readValue(envelope.getPayload(), OaApprovalRequest.class);
            if (Objects.equals(request.getReservation(), event.getInstanceId())) return request;
        }
        throw new AssertionError("Missing persisted meeting approval request");
    }

    private ApprovalResultDTO decision(OaApprovalRequest request, String instanceId, boolean approved) {
        ApprovalResultDTO result = new ApprovalResultDTO(); result.setTenantId(TENANT); result.setBusinessType(OaMeetingBookingService.BUSINESS_TYPE);
        result.setBusinessId(request.getBusinessId()); result.setProcessInstanceId(instanceId); result.setApproverId(GUEST);
        result.setApprovalResult(approved ? "APPROVED" : "REJECTED"); result.setVariables(java.util.Map.of("oaRequestToken", request.getReservation())); return result;
    }

    private void deferredInvalidation(Long eventId) throws Exception {
        BusinessEventEnvelope envelope = json.readValue(scalar("SELECT payload_json FROM outbox_event WHERE tenant_id=? AND aggregate_id=? AND event_type='OA_MEETING_APPROVAL_WITHDRAWN'", TENANT, eventId), BusinessEventEnvelope.class);
        AtomicInteger calls = new AtomicInteger();
        RemoteWorkflowService transport = (com.cloudflow.oa.service.remote.RemoteWorkflowService) Proxy.newProxyInstance(getClass().getClassLoader(), new Class<?>[]{com.cloudflow.oa.service.remote.RemoteWorkflowService.class},
                (proxy, method, values) -> {
                    equal("invalidateByBusiness", method.getName(), "消费持久消息调用真正作废接口协议");
                    check(!org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive(), "远程作废在会议数据库事务外执行");
                    return calls.incrementAndGet() == 1 ? com.cloudflow.common.core.domain.R.fail("transport-fixture-unavailable") : com.cloudflow.common.core.domain.R.ok();
                });
        OaMeetingApprovalWithdrawnConsumer consumer = new com.cloudflow.oa.event.consumer.OaMeetingApprovalWithdrawnConsumer(json, transport);
        try { consumer.consume(envelope); throw new AssertionError("Transport failure must retry"); }
        catch (IllegalStateException failure) { check(failure.getMessage().contains("等待重试"), "工作流通信失败明确重试"); }
        consumer.consume(envelope); equal(2, calls.get(), "作废通信失败后重放成功，协议夹具非HTTP");
    }

    private void queryRules() {
        Long roomId = room("H4空闲与规则", 5, null);
        MeetingCommands.Rule rule = new MeetingCommands.Rule(); rule.setVersion(queries.room(roomId).getVersion());
        rule.setEquipmentTags(List.of("H4专用", "白板")); rule.setMinBookingMinutes(30); rule.setMaxBookingMinutes(120);
        rule.setOpenTime(java.time.LocalTime.of(9, 0)); rule.setCloseTime(java.time.LocalTime.of(17, 0)); rule.setBufferMinutes(10);
        MeetingRoom saved = roomRules.save(roomId, rule);
        SysScheduleEvent booked = bookings.create(command(roomId, "H4规则存量", start));
        rule.setVersion(saved.getVersion()); rule.setCloseTime(java.time.LocalTime.of(9, 30));
        MeetingViews.RulePreview preview = roomRules.preview(roomId, rule);
        equal(1, preview.affected().size(), "更严格规则预览真实存量冲突");
        reject("ROOM_RULE_CONFIRMATION_REQUIRED", () -> roomRules.save(roomId, rule), "规则冲突未确认不能写入");
        rule.setConfirmExistingConflicts(true); rule.setImpactDigest(preview.impactDigest());
        saved = roomRules.save(roomId, rule);
        equal(10, access.get(booked.getEventId()).getBufferMinutesSnapshot(), "规则调整不改存量缓冲快照");
        equal(0L, queries.available(start, start.plusHours(1), 2, List.of("H4专用"), 1, 50).getTotal(), "空闲查询拒绝违反新开放时间的预约");
        rule.setVersion(saved.getVersion()); rule.setCloseTime(java.time.LocalTime.of(17, 0)); rule.setConfirmExistingConflicts(false); rule.setImpactDigest(null);
        roomRules.save(roomId, rule);
        equal(0L, queries.available(start.plusMinutes(69), start.plusMinutes(129), 2, List.of("H4专用"), 1, 50).getTotal(), "查询与锁定提交一致拒绝缓冲内一分钟");
        equal(1L, queries.available(start.plusMinutes(70), start.plusMinutes(130), 2, List.of("H4专用"), 1, 50).getTotal(), "查询与锁定提交一致允许10分钟边界");
        equal(0L, queries.available(start.plusHours(3), start.plusHours(4), 6, List.of("H4专用"), 1, 50).getTotal(), "按人数过滤会议室");
        equal(0L, queries.available(start.plusHours(3), start.plusHours(4), 2, List.of("不存在的设备"), 1, 50).getTotal(), "按结构化设备标签过滤");
        check(legacy.checkConflict(roomId, start.minusHours(1), start), "旧冲突查询也执行开放规则");
        List<Map<String, String>> slots = legacy.getFreeSlots(roomId, start.toLocalDate().toString());
        equal(start.plusMinutes(70).format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")), slots.get(0).get("start"), "旧空闲窗口排除会后缓冲");
        equal(start.withHour(17).format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")), slots.get(0).get("end"), "旧空闲窗口使用配置关闭时间");
        identity(TENANT, OUTSIDER);
        MeetingViews.RoomLane lane = queries.board(start, start.plusDays(1), null, List.of("H4专用"), 1, 50).getRows().get(0);
        equal("忙碌时段", lane.meetings().get(0).title(), "新看板隐藏未授权标题");
        check(lane.meetings().get(0).eventId() == null && !lane.meetings().get(0).detailsVisible(), "新看板不暴露未授权会议标识和详情");
        reject("MEETING_NOT_FOUND", () -> queries.detail(booked.getEventId()), "看板点击详情再次校验关系");
        identity(TENANT, HOST);
        reject("MEETING_QUERY_WINDOW", () -> queries.board(start, start.plusDays(32), null, List.of(), 1, 50), "资源查询限制31天");
        reject("MEETING_PAGE_INVALID", () -> queries.board(start, start.plusDays(1), null, List.of(), 1, 51), "资源每页最多50间");
        usage();
        for (int index = 0; index < 51; index++) {
            jdbc.update("INSERT INTO oa_meeting_room(tenant_id,name,capacity,equipment_tags,status,deleted,version) VALUES(?,?,5,?,'1',0,0)", TENANT, "H4分页夹具" + index, "[\"H4分页专用\"]");
        }
        PageResult<MeetingViews.RoomLane> paged = queries.board(start, start.plusDays(1), null, List.of("H4分页专用"), 2, 50);
        equal(51L, paged.getTotal(), "资源看板总数包含51间房间"); equal(1, paged.getRows().size(), "第51间通过第二页完整返回");
        PageResult<MeetingRoom> available = queries.available(start, start.plusHours(1), 2, List.of("H4分页专用"), 2, 50);
        equal(51L, available.getTotal(), "空闲总数遍历全部候选页而非截断第一页"); equal(1, available.getRows().size(), "第51间空闲房间可见");
    }

    private void usage() {
        Long roomId = room("H4使用率", 5, null);
        MeetingCommands.Rule rule = new MeetingCommands.Rule(); rule.setVersion(queries.room(roomId).getVersion());
        rule.setOpenTime(java.time.LocalTime.of(9, 0)); rule.setCloseTime(java.time.LocalTime.of(17, 0)); rule.setBufferMinutes(10); roomRules.save(roomId, rule);
        SysScheduleEvent used = bookings.create(command(roomId, "H4真实发生事实夹具", start));
        SysScheduleEvent planned = bookings.create(command(roomId, "H4仅预订事实夹具", start.plusHours(2)));
        SysScheduleEvent cancelled = bookings.create(command(roomId, "H4取消事实夹具", start.plusHours(4)));
        bookings.cancel(cancelled.getEventId(), new MeetingCommands.Change(cancelled.getVersion(), "使用率排除取消", null));
        LocalDateTime past = start.minusDays(20);
        jdbc.update("UPDATE oa_schedule_event SET start_time=?,end_time=?,status='COMPLETED' WHERE event_id=?", past, past.plusHours(1), used.getEventId());
        jdbc.update("UPDATE oa_schedule_event SET start_time=?,end_time=? WHERE event_id=?", past.plusHours(2), past.plusHours(3), planned.getEventId());
        jdbc.update("UPDATE oa_schedule_event SET start_time=?,end_time=? WHERE event_id=?", past.plusHours(4), past.plusHours(5), cancelled.getEventId());
        MeetingViews.Usage row = queries.usage(past.toLocalDate().atStartOfDay(), past.toLocalDate().plusDays(1).atStartOfDay(), 1, 50).getRows().stream().filter(value -> value.room().getRoomId().equals(roomId)).findFirst().orElseThrow();
        equal(new java.math.BigDecimal("60.00"), row.usedMinutes(), "使用率只计已发生60分钟，取消及缓冲排除");
        equal(new java.math.BigDecimal("60.00"), row.bookedMinutes(), "计划预订独立60分钟不计实际使用");
        equal(new java.math.BigDecimal("480.00"), row.openMinutes(), "开放窗口9至17时为480分钟");
        equal(new java.math.BigDecimal("12.50"), row.usagePercent(), "人工核算使用率60除480为12.50%");
        equal(new java.math.BigDecimal("12.50"), row.bookingPercent(), "人工核算独立预订占用率12.50%");
    }

    private void series() throws Exception {
        Long roomId = room("H4周期实例", 5, null);
        MeetingCommands.Booking request = command(roomId, "H4每日周期", start.plusDays(60)); request.setRecurrenceRule("FREQ=DAILY;COUNT=3");
        MeetingViews.SeriesPreview preview = series.preview(null, request); check(preview.canSubmit(), "服务端展开并预检全部周期实例");
        equal(3, preview.changes().size(), "服务端预览三个实际实例");
        MeetingViews.SeriesResult created = series.create(request); Long parentId = created.series().getEventId();
        equal(3, created.instances().size(), "原子创建三个实际实例");
        equal(4L, count("SELECT COUNT(*) FROM oa_schedule_event WHERE event_id=? OR parent_event_id=?", parentId, parentId), "一主记录加三实例无双占位");
        equal(0L, count("SELECT COUNT(*) FROM oa_meeting_attendance WHERE schedule_event_id=?", parentId), "周期主记录不发邀请");
        equal(6L, count("SELECT COUNT(*) FROM oa_meeting_attendance attendance JOIN oa_schedule_event meeting ON meeting.event_id=attendance.schedule_event_id WHERE meeting.parent_event_id=?", parentId), "仅三个实例各发两份邀请");
        SysScheduleEvent first = created.instances().get(0); SysScheduleEvent second = created.instances().get(1);
        MeetingCommands.Booking move = command(roomId, "H4独立改期", first.getStartTime().plusHours(4)); move.setVersion(first.getVersion());
        bookings.update(first.getEventId(), move); bookings.cancel(second.getEventId(), new MeetingCommands.Change(second.getVersion(), "单实例取消", null));
        equal(first.getOriginalStartTime(), access.get(first.getEventId()).getOriginalStartTime(), "单实例改期保留原定发生键");
        request.setVersion(created.series().getVersion()); request.setTitle("H4整系列编辑"); request.setRecurrenceRule("FREQ=DAILY;COUNT=4");
        reject("MEETING_SERIES_CONFIRMATION_REQUIRED", () -> series.update(parentId, request), "整系列修改须预览后二次确认");
        MeetingViews.SeriesPreview impact = series.preview(parentId, request);
        equal(2L, impact.changes().stream().filter(value -> value.action().equals("KEEP")).count(), "影响清单保留独立改期和已取消实例");
        request.setConfirmSeriesChanges(true); request.setImpactDigest(impact.impactDigest());
        MeetingViews.SeriesResult updated = series.update(parentId, request);
        equal("H4独立改期", access.get(first.getEventId()).getTitle(), "整系列不覆盖独立修改");
        equal("CANCELLED", access.get(second.getEventId()).getStatus(), "重新展开不复活取消实例");
        equal(4L, count("SELECT COUNT(*) FROM oa_schedule_event WHERE parent_event_id=?", parentId), "周期更新只补第四实例并复用原发生键");
        request.setVersion(updated.series().getVersion()); request.setRecurrenceRule("FREQ=DAILY;COUNT=3");
        MeetingViews.SeriesPreview stale = series.preview(parentId, request);
        SysScheduleEvent third = access.get(created.instances().get(2).getEventId());
        MeetingCommands.Booking independent = command(roomId, "H4预览后他处编辑", third.getStartTime().plusHours(4)); independent.setVersion(third.getVersion());
        bookings.update(third.getEventId(), independent); request.setImpactDigest(stale.impactDigest());
        reject("MEETING_SERIES_CONFIRMATION_REQUIRED", () -> series.update(parentId, request), "实例改变后旧影响清单确认令牌失效");
        MeetingCommands.Booking blocked = command(roomId, "H4部分冲突整体回滚", start.plusDays(90)); blocked.setRecurrenceRule("FREQ=DAILY;COUNT=3");
        bookings.create(command(roomId, "H4第二天已有预约", blocked.getStartTime().plusDays(1)));
        long before = count("SELECT COUNT(*) FROM oa_schedule_event"); long invitationsBefore = count("SELECT COUNT(*) FROM oa_meeting_attendance");
        reject("MEETING_SERIES_CONFLICT", () -> series.create(blocked), "系列其中一天冲突则整体拒绝");
        equal(before, count("SELECT COUNT(*) FROM oa_schedule_event"), "部分冲突不写主记录或任何实例");
        equal(invitationsBefore, count("SELECT COUNT(*) FROM oa_meeting_attendance"), "部分冲突不写任何邀请");
        blocked.setRecurrenceRule("FREQ=MINUTELY;COUNT=2"); blocked.setStartTime(start.plusDays(95)); blocked.setEndTime(blocked.getStartTime().plusHours(1));
        reject("MEETING_SERIES_CONFLICT", () -> series.create(blocked), "同系列实例彼此重叠也整体拒绝");
        MeetingCommands.Booking racing = command(roomId, "H4周期竞争", start.plusDays(100)); racing.setRecurrenceRule("FREQ=DAILY;COUNT=3");
        List<String> racesResult = race(() -> series.create(racing), () -> series.create(racing));
        equal(1L, racesResult.stream().filter("SUCCESS"::equals).count(), "真实周期并发仅一个完整系列成功");
        equal(1L, racesResult.stream().filter("MEETING_SERIES_CONFLICT"::equals).count(), "另一系列明确冲突");
        equal(3L, count("SELECT COUNT(*) FROM oa_schedule_event WHERE room_id=? AND recurrence_role='INSTANCE' AND start_time>=? AND start_time<?", roomId, racing.getStartTime(), racing.getStartTime().plusDays(3)), "竞争后恰好三个实际实例"); races++;
    }

    private static void invalid(String code, Runnable operation, String label) {
        try { operation.run(); throw new AssertionError(label + "未拒绝"); }
        catch (IllegalStateException failure) { check(failure.getMessage().startsWith(code + ":"), label); }
    }

    private static void identity(long tenantId, long userId) {
        TenantContext.clear(); TenantContext.setTenantId(tenantId); UserContext.clear(); UserContext.setTenantId(tenantId); UserContext.setUserId(userId);
        UserContext.setUserName("meeting-db-check"); UserContext.setDeptId(100L); UserContext.setDsType(0); UserContext.setRoles(Set.of("employee"));
    }
    private long count(String query, Object... values) { return Objects.requireNonNull(jdbc.queryForObject(query, Long.class, values)); }
    private String scalar(String query, Object... values) { return jdbc.queryForObject(query, String.class, values); }
    @SuppressWarnings("unchecked")
    private <Value> Value transactional(Value target) {
        ProxyFactory factory = new ProxyFactory(target); factory.setProxyTargetClass(true);
        factory.addAdvice(new TransactionInterceptor(transactions, new AnnotationTransactionAttributeSource())); return (Value) factory.getProxy();
    }
    private static void field(Object target, String name, Object value) throws Exception {
        for (Class<?> type = target.getClass(); type != null; type = type.getSuperclass()) {
            try { Field field = type.getDeclaredField(name); field.setAccessible(true); field.set(target, value); return; }
            catch (NoSuchFieldException missing) { }
        }
        throw new IllegalStateException("Missing field " + name);
    }
    private static void reject(String code, Runnable action, String label) {
        try { action.run(); throw new AssertionError(label + "未拒绝"); }
        catch (ServiceException failure) { check(failure.getMessage().startsWith(code + ":"), label + " actual=" + failure.getMessage()); }
    }
    private void participantConflicts() {
        identity(TENANT, HOST);
        LocalDateTime when = start.plusDays(190);
        Long roomId = room("H4参与者提示", 5, null);
        SysScheduleEvent meeting = bookings.create(command(roomId, "H4内部会议私密标题", when));
        jdbc.update("INSERT INTO crm_activity(activity_id,tenant_id,activity_type,subject,customer_name,owner_id,start_time,end_time,status) VALUES(?,?, 'MEETING',?,?,?,?,?,'PLANNED')",
                9391001L, TENANT, "H4客户活动私密主题", "H4不得泄漏的客户", GUEST, when, when.plusHours(1));
        jdbc.update("INSERT INTO crm_activity_participant(tenant_id,activity_id,participant_type,participant_ref_id,acceptance_status) VALUES(?,?,'USER',?,'ACCEPTED')", TENANT, 9391001L, HOST);
        MeetingViews.ParticipantConflicts own = participants.query(List.of(GUEST), when, when.plusHours(1), null);
        equal(2, own.busy().size(), "真实OA与CRM参与者冲突均返回");
        check(own.crmVerified() && own.busy().stream().allMatch(com.cloudflow.common.core.domain.ParticipantBusy::isDetailsVisible), "本人参与的跨模块会议标题可见");
        identity(TENANT, OUTSIDER);
        MeetingViews.ParticipantConflicts hidden = participants.query(List.of(GUEST), when, when.plusHours(1), null);
        check(hidden.busy().stream().allMatch(value -> value.getBusinessId() == null && "忙碌时段".equals(value.getTitle()) && !value.isDetailsVisible()), "非关联人仅见忙碌区间，不泄漏客户或会议标识");
        reject("MEETING_OWNER_REQUIRED", () -> participants.query(List.of(GUEST), when, when.plusHours(1), meeting.getEventId()), "冲突排除ID须本人会议");
        identity(TENANT, HOST);
        MeetingViews.ParticipantConflicts boundary = participants.query(List.of(GUEST), when.plusHours(1), when.plusHours(2), null);
        equal(0, boundary.busy().size(), "参与者查询半开区间且不将会议室缓冲算人员忙碌");
        MeetingCommands.Booking pending = command(null, "H4人员冲突确认", when); pending.setConfirmParticipantConflicts(false);
        reject("MEETING_PARTICIPANT_CONFIRMATION_REQUIRED", () -> bookings.create(pending), "参与者提示需明确确认");
        pending.setConfirmParticipantConflicts(true);
        check(bookings.create(pending).getEventId() != null, "人员冲突确认可继续，房间冲突仍独立拒绝");
        jdbc.update("UPDATE crm_activity_participant SET acceptance_status='DECLINED' WHERE tenant_id=? AND activity_id=? AND participant_ref_id=?", TENANT, 9391001L, HOST);
        equal(0, crmParticipants.query(List.of(HOST), when, when.plusHours(1)).size(), "CRM拒绝参与者不占用本人时间");
        crmUnavailable.set(true);
        MeetingViews.ParticipantConflicts degraded = participants.query(List.of(GUEST), when, when.plusHours(1), null);
        check(!degraded.crmVerified() && degraded.warning().contains("客户活动冲突未核实") && !degraded.busy().isEmpty(), "CRM故障明确提示并保留OA冲突结果");
        MeetingCommands.Booking offline = command(null, "H4客户服务离线确认", when.plusDays(1)); offline.setConfirmParticipantConflicts(false);
        reject("MEETING_PARTICIPANT_CONFIRMATION_REQUIRED", () -> bookings.create(offline), "CRM不可达未经确认不可静默提交");
        offline.setConfirmParticipantConflicts(true);
        check(bookings.create(offline).getEventId() != null, "CRM不可达确认后允许预约");
        crmUnavailable.set(false);
        identity(TENANT + 1, HOST);
        try { crmParticipants.query(List.of(GUEST), when, when.plusHours(1)); throw new AssertionError("跨租户用户未拒绝"); }
        catch (ServiceException failure) { check(failure.getMessage().contains("参与者不存在"), "CRM内部查询拒绝跨租户参与者"); }
        identity(TENANT, HOST);
    }

    private static void equal(Object expected, Object actual, String label) { check(Objects.equals(expected, actual), label + " expected=" + expected + " actual=" + actual); }
    private static void check(boolean valid, String label) { if (!valid) throw new AssertionError(label); ASSERTIONS.incrementAndGet(); System.out.println("PASS " + label); }
}
