package com.cloudflow.oa.service.impl;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.oa.domain.OaMeetingAttendance;
import com.cloudflow.oa.domain.OaMeetingMinutes;
import com.cloudflow.oa.domain.SysScheduleEvent;
import com.cloudflow.oa.domain.dto.MeetingCommands;
import com.cloudflow.oa.mapper.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;

final class OaMeetingMinutesFixture {
    private final OaMeetingBookingService bookings;
    private final OaMeetingMinutesServiceImpl minutes;
    private final JdbcTemplate jdbc;
    private final long tenant;
    private final long host;
    private final long guest;
    private final long outsider;
    private int assertions;

    OaMeetingMinutesFixture(OaMeetingBookingService bookings, OaMeetingAccess access, SqlSessionTemplate sessions,
            JdbcTemplate jdbc, PlatformTransactionManager transactions, ObjectMapper json, long tenant, long host, long guest, long outsider) throws Exception {
        this.bookings = bookings; this.jdbc = jdbc; this.tenant = tenant; this.host = host; this.guest = guest; this.outsider = outsider;
        WorkTaskServiceImpl tasks = new WorkTaskServiceImpl(null);
        java.lang.reflect.Field mapper = com.baomidou.mybatisplus.extension.service.impl.ServiceImpl.class.getDeclaredField("baseMapper");
        mapper.setAccessible(true); mapper.set(tasks, sessions.getMapper(WorkTaskMapper.class));
        OaMeetingMinutesServiceImpl service = new OaMeetingMinutesServiceImpl(sessions.getMapper(OaMeetingMinutesMapper.class), sessions.getMapper(OaMeetingAttendanceMapper.class),
                tasks, json, access, sessions.getMapper(OaIdentityReferenceMapper.class), scope -> { scope.setUserId(UserContext.getUserId()); return false; });
        ProxyFactory factory = new ProxyFactory(service); factory.setProxyTargetClass(true);
        factory.addAdvice(new TransactionInterceptor(transactions, new AnnotationTransactionAttributeSource()));
        minutes = (OaMeetingMinutesServiceImpl) factory.getProxy();
    }

    int exercise() throws Exception {
        SysScheduleEvent planned = create("H4原纪要与邀请同一事实");
        rejects(() -> minutes.save(draft(planned)), "计划会议尚未开始不能登记纪要与签到");
        identity(tenant, guest);
        try { bookings.respond(planned.getEventId(), new MeetingCommands.Response(planned.getScheduleVersion(), "ACCEPTED")); }
        finally { identity(tenant, host); }
        SysScheduleEvent event = bookings.state(planned.getEventId(), new MeetingCommands.Change(planned.getVersion(), null, "IN_PROGRESS"));
        long attendanceId = number("SELECT id FROM oa_meeting_attendance WHERE tenant_id=? AND schedule_event_id=? AND user_id=?", tenant, event.getEventId(), guest);
        OaMeetingMinutes note = draft(event); note.setTenantId(tenant + 1); note.setStatus("CONFIRMED");
        minutes.save(note);
        equal("DRAFT", minutes.getDetail(note.getId()).getStatus(), "纪要创建不能伪造已确认状态");
        equal(tenant, note.getTenantId(), "纪要租户取自可信身份");
        equal(event.getEventId(), note.getMeetingId(), "两个会议关联字段统一为同一实际会议");
        equal(2L, number("SELECT COUNT(*) FROM oa_meeting_attendance WHERE tenant_id=? AND minutes_id=?", tenant, note.getId()), "会前两份邀请直接关联纪要");
        equal(2L, number("SELECT COUNT(*) FROM oa_meeting_attendance WHERE tenant_id=? AND schedule_event_id=?", tenant, event.getEventId()), "关联纪要不重复生成签到行");
        SysScheduleEvent actualEvent = event;
        rejects(() -> minutes.save(draft(actualEvent)), "同一实际会议不能重复建纪要");
        OaMeetingAttendance record = new OaMeetingAttendance(); record.setMinutesId(note.getId()); record.setUserId(guest);
        record.setTenantId(tenant + 1); record.setAcceptanceStatus("DECLINED"); record.setAttendStatus("ATTEND"); record.setCheckInTime(LocalDateTime.now().withNano(0));
        minutes.upsertAttendance(record);
        OaMeetingAttendance stored = minutes.listAttendance(note.getId()).stream().filter(value -> value.getUserId() == guest).findFirst().orElseThrow();
        equal(attendanceId, stored.getId(), "签到修改复用原邀请行ID");
        equal("ACCEPTED", stored.getAcceptanceStatus(), "签到接口不能伪造或覆盖会前接受状态");
        equal("ATTEND", stored.getAttendStatus(), "实际出席独立写入");
        check(stored.getCheckInTime() != null, "真实签到时间保留");
        record.setUserId(outsider);
        rejects(() -> minutes.upsertAttendance(record), "关联会议不可绕过邀请名单登记其他人");
        identity(tenant, outsider);
        try {
            equal(0L, minutes.page("H4原纪要与邀请同一事实", null, null, 1, 20).getTotal(), "无关系用户纪要分页总数不泄漏会议");
            rejects(() -> minutes.getDetail(note.getId()), "无关系用户不可读取关联纪要");
            rejects(() -> minutes.confirm(note.getId()), "无关系用户不可确认关联纪要");
        } finally { identity(tenant, host); }
        identity(tenant + 1, host);
        try { rejects(() -> minutes.getDetail(note.getId()), "跨租户纪要读取拒绝"); }
        finally { identity(tenant, host); }
        minutes.removeAttendance(attendanceId);
        stored = minutes.listAttendance(note.getId()).stream().filter(value -> value.getUserId() == guest).findFirst().orElseThrow();
        equal(0, stored.getDeleted(), "清除签到不撤销有效邀请");
        equal("ACCEPTED", stored.getAcceptanceStatus(), "清除签到仍保留邀请接受事实");
        check("NOT_CHECKED".equals(stored.getAttendStatus()) && stored.getCheckInTime() == null, "清除签到确实归零且不残留旧时间");
        OaMeetingMinutes update = minutes.getDetail(note.getId());
        update.setMinutesContent("H4纪要正文修改"); update.setAttachmentUrl("https://files.example.test/meeting.pdf");
        update.setDecisions("[{\"title\":\"H4已确认决议任务\"}]");
        minutes.update(update);
        equal("https://files.example.test/meeting.pdf", minutes.getDetail(note.getId()).getAttachmentUrl(), "原附件链接保存与读取保留");
        OaMeetingMinutes stale = draft(event); stale.setId(note.getId()); stale.setVersion(0);
        rejects(() -> minutes.update(stale), "过期纪要版本拒绝覆盖");
        rejects(() -> minutes.dispatchDecisionsToWorkTasks(note.getId(), null), "决议派发前必须确认纪要");
        minutes.confirm(note.getId());
        check(minutes.getDetail(note.getId()).getConfirmedTime() != null, "确认纪要保留真实确认时间");
        OaMeetingMinutes confirmed = minutes.getDetail(note.getId()); confirmed.setMinutesContent("试图覆盖已确认纪要");
        rejects(() -> minutes.update(confirmed), "已确认纪要不可经普通编辑覆盖内容");
        equal("H4纪要正文修改", minutes.getDetail(note.getId()).getMinutesContent(), "拒绝编辑后确认正文保持原事实");
        List<Long> tasks = minutes.dispatchDecisionsToWorkTasks(note.getId(), null);
        equal(tasks, minutes.dispatchDecisionsToWorkTasks(note.getId(), null), "原决议派发重试返回同一真实任务");
        equal(1L, number("SELECT COUNT(*) FROM oa_work_task WHERE tenant_id=? AND title='H4已确认决议任务'", tenant), "决议仅生成一条实际协作任务");
        record.setUserId(guest); minutes.upsertAttendance(record);
        minutes.remove(note.getId());
        equal(1L, number("SELECT COUNT(*) FROM oa_meeting_attendance WHERE id=? AND minutes_id IS NULL AND attend_status='ATTEND' AND acceptance_status='ACCEPTED'", attendanceId), "删除纪要保留实际出席并解除旧纪要关联");
        OaMeetingMinutes replacement = draft(event); minutes.save(replacement);
        equal(1L, number("SELECT COUNT(*) FROM oa_meeting_attendance WHERE id=? AND minutes_id=? AND attend_status='ATTEND'", attendanceId, replacement.getId()), "重新建纪要仍复用原签到事实");
        standalone();
        concurrent();
        System.out.println("MEETING_H4_MINUTES_DATABASE: assertions=" + assertions + "; real_minutes=true; real_invitations=true; real_work_tasks=true; real_db_races=1");
        return assertions;
    }

    private void standalone() {
        OaMeetingMinutes note = new OaMeetingMinutes(); note.setMeetingTitle("H4原独立纪要"); note.setMinutesContent("原功能保留"); minutes.save(note);
        OaMeetingAttendance record = new OaMeetingAttendance(); record.setMinutesId(note.getId()); record.setUserId(guest); record.setAttendStatus("LATE");
        minutes.upsertAttendance(record); Long id = minutes.listAttendance(note.getId()).get(0).getId();
        minutes.removeAttendance(id); equal(0, minutes.listAttendance(note.getId()).size(), "独立纪要原出席删除功能保留");
        minutes.upsertAttendance(record); equal(id, minutes.listAttendance(note.getId()).get(0).getId(), "独立纪要恢复出席复用历史行，不触发唯一键冲突");
    }

    private void concurrent() throws Exception {
        SysScheduleEvent planned = create("H4纪要并发创建");
        SysScheduleEvent event = bookings.state(planned.getEventId(), new MeetingCommands.Change(planned.getVersion(), null, "IN_PROGRESS"));
        CyclicBarrier barrier = new CyclicBarrier(2); ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            java.util.concurrent.Callable<Boolean> work = () -> {
                identity(tenant, host);
                try { barrier.await(10, TimeUnit.SECONDS); minutes.save(draft(event)); return true; }
                catch (ServiceException failure) { if (!failure.getMessage().contains("已有纪要")) throw failure; return false; }
                finally { TenantContext.clear(); UserContext.clear(); }
            };
            Future<Boolean> first = pool.submit(work); Future<Boolean> second = pool.submit(work);
            equal(1, (first.get(20, TimeUnit.SECONDS) ? 1 : 0) + (second.get(20, TimeUnit.SECONDS) ? 1 : 0), "真实并发创建纪要仅一份成功");
            equal(1L, number("SELECT COUNT(*) FROM oa_meeting_minutes WHERE tenant_id=? AND schedule_event_id=? AND deleted=0", tenant, event.getEventId()), "并发后只有一份有效纪要");
        } finally { pool.shutdownNow(); }
    }

    private SysScheduleEvent create(String title) {
        MeetingCommands.Booking command = new MeetingCommands.Booking(); command.setTitle(title); command.setStartTime(LocalDateTime.now().withNano(0));
        command.setEndTime(command.getStartTime().plusHours(1)); command.setAttendeeIds(List.of(guest)); command.setConfirmParticipantConflicts(true);
        return bookings.create(command);
    }
    private OaMeetingMinutes draft(SysScheduleEvent event) {
        OaMeetingMinutes value = new OaMeetingMinutes(); value.setScheduleEventId(event.getEventId()); value.setMeetingTitle(event.getTitle());
        value.setMinutesContent("H4实际会议纪要"); return value;
    }
    private void identity(long tenantId, long userId) { TenantContext.setTenantId(tenantId); UserContext.setTenantId(tenantId); UserContext.setUserId(userId); UserContext.setUserName("meeting-check-" + userId); UserContext.setDsType(4); }
    private long number(String sql, Object... values) { return Objects.requireNonNull(jdbc.queryForObject(sql, Long.class, values)); }
    private void equal(Object expected, Object actual, String label) { check(Objects.equals(expected, actual), label + " expected=" + expected + " actual=" + actual); }
    private void rejects(Runnable work, String label) { try { work.run(); } catch (ServiceException | IllegalArgumentException failure) { check(true, label + " actual=" + failure.getMessage()); return; } throw new AssertionError(label); }
    private void check(boolean success, String label) { if (!success) throw new AssertionError(label); assertions++; System.out.println("PASS " + label); }
}
