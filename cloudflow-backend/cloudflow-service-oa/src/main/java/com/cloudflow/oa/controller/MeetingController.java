package com.cloudflow.oa.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import cn.dev33.satoken.annotation.SaMode;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.oa.domain.MeetingRoom;
import com.cloudflow.oa.domain.OaMeetingAttendance;
import com.cloudflow.oa.domain.SysScheduleEvent;
import com.cloudflow.oa.domain.dto.MeetingCommands;
import com.cloudflow.oa.domain.vo.MeetingViews;
import com.cloudflow.oa.service.impl.OaMeetingBookingService;
import com.cloudflow.oa.service.impl.OaMeetingQueryService;
import com.cloudflow.oa.service.impl.OaMeetingParticipantService;
import com.cloudflow.oa.service.impl.OaMeetingReminderService;
import java.time.LocalDateTime;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/meeting")
@RequiredArgsConstructor
public class MeetingController {
    private final OaMeetingBookingService bookings;
    private final OaMeetingQueryService queries;
    private final OaMeetingParticipantService participants;
    private final OaMeetingReminderService reminders;

    @GetMapping("/email-readiness")
    @SaCheckPermission(value = {"oa:meeting:board", "oa:meeting:mine"}, mode = SaMode.OR)
    public R<com.cloudflow.common.message.api.MessageChannelReadiness> emailReadiness() { return R.ok(reminders.emailReadiness()); }

    @GetMapping("/booking/{id}/delivery")
    @SaCheckPermission(value = {"oa:meeting:board", "oa:meeting:mine"}, mode = SaMode.OR)
    public R<List<OaMeetingReminderService.Delivery>> delivery(@PathVariable("id") Long id) { return R.ok(reminders.details(id)); }

    @GetMapping("/participant-busy")
    @SaCheckPermission(value = {"oa:meeting:book", "oa:meeting:edit-own", "oa:meeting:series"}, mode = SaMode.OR)
    public R<MeetingViews.ParticipantConflicts> participantBusy(@RequestParam("userIds") List<Long> userIds,
            @RequestParam("start") @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime start,
            @RequestParam("end") @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime end,
            @RequestParam(value = "excludeId", required = false) Long excludeId) {
        return R.ok(participants.query(userIds, start, end, excludeId));
    }

    @GetMapping("/board")
    @SaCheckPermission("oa:meeting:board")
    public R<PageResult<MeetingViews.RoomLane>> board(
            @RequestParam("start") @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime start,
            @RequestParam("end") @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime end,
            @RequestParam(value = "capacity", required = false) Integer capacity, @RequestParam(value = "equipment", required = false) List<String> tags,
            @RequestParam(value = "pageNum", defaultValue = "1") int pageNum, @RequestParam(value = "pageSize", defaultValue = "50") int pageSize) {
        return R.ok(queries.board(start, end, capacity, tags, pageNum, pageSize));
    }

    @GetMapping("/room/available")
    @SaCheckPermission("oa:meeting:board")
    public R<PageResult<MeetingRoom>> available(
            @RequestParam("start") @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime start,
            @RequestParam("end") @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime end,
            @RequestParam(value = "capacity", defaultValue = "1") int capacity, @RequestParam(value = "equipment", required = false) List<String> tags,
            @RequestParam(value = "pageNum", defaultValue = "1") int pageNum, @RequestParam(value = "pageSize", defaultValue = "50") int pageSize) {
        return R.ok(queries.available(start, end, capacity, tags, pageNum, pageSize));
    }

    @GetMapping("/mine")
    @SaCheckPermission("oa:meeting:mine")
    public R<PageResult<SysScheduleEvent>> mine(
            @RequestParam("start") @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime start,
            @RequestParam("end") @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime end,
            @RequestParam(value = "pageNum", defaultValue = "1") int pageNum, @RequestParam(value = "pageSize", defaultValue = "20") int pageSize) {
        return R.ok(queries.mine(start, end, pageNum, pageSize));
    }

    @GetMapping("/booking/{id}")
    @SaCheckPermission(value = {"oa:meeting:board", "oa:meeting:mine"}, mode = SaMode.OR)
    public R<MeetingViews.Detail> detail(@PathVariable("id") Long id) { return R.ok(queries.detail(id)); }

    @PostMapping("/booking")
    @SaCheckPermission("oa:meeting:book")
    @RepeatSubmit
    @SysLog("创建本人会议预约")
    public R<SysScheduleEvent> create(@RequestBody MeetingCommands.Booking command) { return R.ok(bookings.create(command)); }

    @PutMapping("/booking/{id}")
    @SaCheckPermission("oa:meeting:edit-own")
    @RepeatSubmit
    @SysLog("修改本人会议预约")
    public R<SysScheduleEvent> update(@PathVariable("id") Long id, @RequestBody MeetingCommands.Booking command) { return R.ok(bookings.update(id, command)); }

    @PostMapping("/booking/{id}/submit")
    @SaCheckPermission("oa:meeting:book")
    @RepeatSubmit
    @SysLog("提交本人会议预约")
    public R<SysScheduleEvent> submit(@PathVariable("id") Long id, @RequestBody MeetingCommands.Submit command) {
        return R.ok(bookings.submit(id, command.version(), command.confirmParticipantConflicts()));
    }

    @PostMapping("/booking/{id}/cancel")
    @SaCheckPermission("oa:meeting:cancel-own")
    @RepeatSubmit
    @SysLog("取消本人会议预约")
    public R<SysScheduleEvent> cancel(@PathVariable("id") Long id, @RequestBody MeetingCommands.Change command) { return R.ok(bookings.cancel(id, command)); }

    @PostMapping("/booking/{id}/respond")
    @SaCheckPermission("oa:meeting:respond")
    @RepeatSubmit
    @SysLog("回应本人会议邀请")
    public R<OaMeetingAttendance> respond(@PathVariable("id") Long id, @RequestBody MeetingCommands.Response command) { return R.ok(bookings.respond(id, command)); }

    @PostMapping("/booking/{id}/state")
    @SaCheckPermission(value = {"oa:meeting:edit-own", "oa:meeting:manage"}, mode = SaMode.OR)
    @RepeatSubmit
    @SysLog("更新会议实际状态")
    public R<SysScheduleEvent> state(@PathVariable("id") Long id, @RequestBody MeetingCommands.Change command) { return R.ok(bookings.state(id, command)); }

    @GetMapping("/usage")
    @SaCheckPermission("oa:meeting:usage")
    public R<PageResult<MeetingViews.Usage>> usage(
            @RequestParam("start") @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime start,
            @RequestParam("end") @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime end,
            @RequestParam(value = "pageNum", defaultValue = "1") int pageNum, @RequestParam(value = "pageSize", defaultValue = "50") int pageSize) {
        return R.ok(queries.usage(start, end, pageNum, pageSize));
    }
}
