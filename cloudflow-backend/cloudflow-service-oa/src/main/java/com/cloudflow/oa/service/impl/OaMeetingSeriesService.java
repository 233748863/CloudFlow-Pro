package com.cloudflow.oa.service.impl;

import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.message.security.MessagePayloadCodec;
import com.cloudflow.oa.domain.MeetingRoom;
import com.cloudflow.oa.domain.SysScheduleEvent;
import com.cloudflow.oa.domain.dto.MeetingCommands;
import com.cloudflow.oa.domain.vo.MeetingViews;
import com.cloudflow.oa.mapper.OaMeetingMapper;
import com.cloudflow.oa.mapper.SysScheduleEventMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Service
@RequiredArgsConstructor
public class OaMeetingSeriesService {
    private final OaMeetingAccess access;
    private final OaMeetingMapper meetings;
    private final SysScheduleEventMapper events;
    private final OaMeetingBookingService bookings;
    private final OaMeetingWorkflowService workflow;
    private final OaMeetingRecurrence recurrence;
    private final OaMeetingParticipantService participants;
    private final OaMeetingReminderService reminders;
    private final PlatformTransactionManager transactions;
    private final ObjectMapper json;

    private record Proposed(SysScheduleEvent previous, SysScheduleEvent desired, String action, String reason) { }
    private record Plan(SysScheduleEvent previous, SysScheduleEvent parent, MeetingRoom room, List<Proposed> proposed,
                        MeetingViews.SeriesPreview preview) { }

    public MeetingViews.SeriesPreview preview(Long id, MeetingCommands.Booking command) { return planned(id, command, Plan::preview); }

    @Audit(name = "创建本人周期会议")
    public MeetingViews.SeriesResult create(MeetingCommands.Booking command) {
        return planned(null, command, plan -> {
            participants.confirm(plan.preview().participantConflicts(), command.isConfirmParticipantConflicts());
            return persist(plan);
        });
    }

    @Audit(name = "修改本人未来周期会议", highRisk = true)
    public MeetingViews.SeriesResult update(Long id, MeetingCommands.Booking command) {
        return planned(id, command, plan -> {
            OaMeetingRules.require(command.isConfirmSeriesChanges() && Objects.equals(plan.preview().impactDigest(), command.getImpactDigest()),
                    "MEETING_SERIES_CONFIRMATION_REQUIRED", "请先查看最新影响清单并确认，会议变化后须重新预览");
            participants.confirm(plan.preview().participantConflicts(), command.isConfirmParticipantConflicts());
            return persist(plan);
        });
    }

    private <Result> Result planned(Long id, MeetingCommands.Booking command, Function<Plan, Result> action) {
        OaRecordSupport.require(command, "周期会议参数不能为空");
        OaMeetingRules.require(!command.isDraft(), "MEETING_SERIES_DRAFT_UNSUPPORTED", "周期会议须在全部实例核验通过后一次提交");
        SysScheduleEvent prepared = bookings.prepared(command, "MEETING", false);
        List<OaMeetingRecurrence.Occurrence> occurrences = recurrence.expand(command.getStartTime(), command.getEndTime(), command.getTimezoneId(),
                command.getRecurrenceRule(), command.getRecurrenceEndDate());
        SysScheduleEvent observed = id == null ? null : access.get(id);
        if (observed != null) { access.own(observed); OaMeetingRules.require("SERIES".equals(observed.getRecurrenceRole()), "MEETING_SERIES_REQUIRED", "指定记录不是周期主记录"); }
        else OaMeetingRules.require(command.getStartTime().isAfter(LocalDateTime.now()), "MEETING_IN_PAST", "新周期会议首次开始须在未来");
        List<SysScheduleEvent> observations = id == null ? List.of() : meetings.series(OaRecordSupport.tenantId(), id);
        Set<Long> excluded = observations.stream().filter(event -> editable(event, LocalDateTime.now())).map(SysScheduleEvent::getEventId).collect(Collectors.toSet());
        Set<LocalDateTime> preserved = observations.stream().filter(event -> !excluded.contains(event.getEventId())).map(SysScheduleEvent::getOriginalStartTime).collect(Collectors.toSet());
        MeetingViews.ParticipantConflicts conflicts = participants.check(prepared, occurrences.stream().filter(occurrence -> occurrence.startTime().isAfter(LocalDateTime.now())
                && !preserved.contains(occurrence.startTime())).toList(), excluded);
        List<Long> roomIds = new ArrayList<>(); roomIds.add(command.getRoomId());
        if (observed != null) roomIds.add(observed.getRoomId());
        observations.forEach(event -> roomIds.add(event.getRoomId()));
        return new TransactionTemplate(transactions).execute(status -> {
            Map<Long, MeetingRoom> rooms = access.lockRooms(roomIds);
            SysScheduleEvent current = observed == null ? null : access.lock(observed);
            if (current != null) { access.own(current); OaMeetingAccess.version(command.getVersion(), current.getVersion()); }
            List<SysScheduleEvent> existing = id == null ? List.of() : meetings.series(OaRecordSupport.tenantId(), id);
            for (SysScheduleEvent event : existing) if (event.getRoomId() != null && !rooms.containsKey(event.getRoomId())) throw OaMeetingAccess.conflict();
            existing = existing.stream().sorted(Comparator.comparing(SysScheduleEvent::getOriginalStartTime).thenComparing(SysScheduleEvent::getEventId)).toList();
            return action.apply(plan(current, prepared, occurrences, existing, rooms, command, conflicts));
        });
    }

    private Plan plan(SysScheduleEvent previous, SysScheduleEvent prepared, List<OaMeetingRecurrence.Occurrence> occurrences,
                      List<SysScheduleEvent> existing, Map<Long, MeetingRoom> rooms, MeetingCommands.Booking command,
                      MeetingViews.ParticipantConflicts conflicts) {
        LocalDateTime now = LocalDateTime.now();
        Map<LocalDateTime, SysScheduleEvent> byOriginal = new LinkedHashMap<>();
        existing.forEach(event -> byOriginal.put(event.getOriginalStartTime(), event));
        Set<Long> replaced = existing.stream().filter(event -> editable(event, now)).map(SysScheduleEvent::getEventId).collect(Collectors.toSet());
        MeetingRoom room = rooms.get(command.getRoomId());
        List<Proposed> proposed = new ArrayList<>();
        for (OaMeetingRecurrence.Occurrence occurrence : occurrences) {
            SysScheduleEvent prior = byOriginal.remove(occurrence.startTime());
            if (prior != null && !editable(prior, now) || prior == null && !occurrence.startTime().isAfter(now)) {
                proposed.add(new Proposed(prior, null, "KEEP", "保留已开始、已结束、独立修改或已取消的实例"));
                continue;
            }
            SysScheduleEvent desired = copy(prepared);
            desired.setStartTime(occurrence.startTime()); desired.setEndTime(occurrence.endTime());
            desired.setOriginalStartTime(occurrence.startTime()); desired.setStatus("PLANNED"); desired.setApprovalStatus("NOT_REQUIRED");
            desired.setRecurrenceRole("INSTANCE"); desired.setRecurrenceExceptionFlag(0);
            String problem = null;
            try { bookings.validateAgainst(desired, room, replaced, false); }
            catch (ServiceException failure) { problem = failure.getMessage(); }
            if (problem == null) {
                for (Proposed earlier : proposed) {
                    if (earlier.desired() != null && OaMeetingRules.overlaps(desired.getStartTime(), desired.getEndTime(), desired.getBufferMinutesSnapshot(), earlier.desired())) {
                        problem = "MEETING_SERIES_CONFLICT: 同系列实例的时间或会后间隔重叠"; break;
                    }
                }
            }
            proposed.add(new Proposed(prior, desired, problem == null ? prior == null ? "CREATE" : "UPDATE" : "BLOCK", problem));
        }
        for (SysScheduleEvent prior : byOriginal.values()) {
            proposed.add(new Proposed(prior, null, editable(prior, now) ? "CANCEL" : "KEEP", editable(prior, now) ? "新规则不再包含本实例，取消并保留历史" : "保留历史及独立修改实例"));
        }
        List<MeetingViews.SeriesChange> changes = proposed.stream().map(proposal -> {
            SysScheduleEvent event = proposal.desired() == null ? proposal.previous() : proposal.desired();
            return new MeetingViews.SeriesChange(proposal.previous() == null ? null : proposal.previous().getEventId(), event == null ? null : event.getOriginalStartTime(),
                    event == null ? null : event.getStartTime(), event == null ? null : event.getEndTime(), proposal.action(), proposal.reason());
        }).toList();
        JsonNode normalized = json.valueToTree(command);
        ((com.fasterxml.jackson.databind.node.ObjectNode) normalized).remove(List.of("impactDigest", "confirmSeriesChanges", "confirmParticipantConflicts"));
        String digest = MessagePayloadCodec.digest(json.valueToTree(Map.of("command", normalized, "existing", existing, "rooms", rooms,
                "parentVersion", previous == null ? 0 : previous.getVersion(), "parentId", previous == null ? 0L : previous.getEventId(),
                "tenantId", OaRecordSupport.tenantId(), "userId", OaMeetingAccess.userId(), "changes", changes)), json);
        SysScheduleEvent parent = copy(prepared);
        parent.setBufferMinutesSnapshot(0);
        parent.setRecurrenceRule(command.getRecurrenceRule()); parent.setRecurrenceEndDate(command.getRecurrenceEndDate());
        return new Plan(previous, parent, room, List.copyOf(proposed), new MeetingViews.SeriesPreview(changes, digest,
                proposed.stream().noneMatch(proposal -> "BLOCK".equals(proposal.action())), conflicts));
    }

    private MeetingViews.SeriesResult persist(Plan plan) {
        if (!plan.preview().canSubmit()) {
            MeetingViews.SeriesChange blocked = plan.preview().changes().stream().filter(change -> "BLOCK".equals(change.action())).findFirst().orElseThrow();
            throw new ServiceException("MEETING_SERIES_CONFLICT: " + blocked.startTime() + " " + blocked.reason(), 409);
        }
        SysScheduleEvent parent = plan.parent();
        if (plan.previous() == null) {
            bookings.initialize(parent); parent.setRecurrenceRole("SERIES"); parent.setApprovalStatus("NOT_REQUIRED");
            OaRecordSupport.saved(events.insert(parent));
        } else {
            preserve(parent, plan.previous()); parent.setRecurrenceRole("SERIES"); parent.setApprovalStatus("NOT_REQUIRED");
            parent.setScheduleVersion(Math.addExact(plan.previous().getScheduleVersion(), 1)); access.save(parent);
        }
        List<SysScheduleEvent> result = new ArrayList<>();
        for (Proposed proposal : plan.proposed()) {
            if ("KEEP".equals(proposal.action())) continue;
            if ("CANCEL".equals(proposal.action())) {
                SysScheduleEvent event = proposal.previous();
                workflow.withdraw(event, "整系列修改取消本实例");
                event.setStatus("CANCELLED"); event.setApprovalStatus("CANCELLED"); event.setRecurrenceExceptionFlag(1);
                event.setScheduleVersion(Math.addExact(event.getScheduleVersion(), 1));
                access.save(event); reminders.close(event); bookings.record(event, "MEETING_SERIES_INSTANCE_CANCELLED", "整系列修改取消本实例并保留历史");
                result.add(event); continue;
            }
            SysScheduleEvent event = proposal.desired();
            if (proposal.previous() == null) {
                bookings.initialize(event); event.setRecurrenceRole("INSTANCE"); event.setParentEventId(parent.getEventId());
                event.setSourceSeriesVersion(parent.getScheduleVersion()); event.setApprovalStatus("NOT_REQUIRED");
                OaRecordSupport.saved(events.insert(event));
            } else {
                preserve(event, proposal.previous()); event.setRecurrenceRole("INSTANCE"); event.setParentEventId(parent.getEventId());
                event.setSourceSeriesVersion(parent.getScheduleVersion()); event.setScheduleVersion(Math.addExact(proposal.previous().getScheduleVersion(), 1));
                event.setApprovalStatus("NOT_REQUIRED"); event.setInstanceId(null);
                workflow.withdraw(proposal.previous(), "整系列修改，作废旧实例审批"); access.save(event);
            }
            bookings.activate(event, plan.room()); bookings.record(event, "MEETING_SERIES_INSTANCE_SAVED", "周期主版本" + parent.getScheduleVersion());
            result.add(event);
        }
        bookings.record(parent, plan.previous() == null ? "MEETING_SERIES_CREATED" : "MEETING_SERIES_UPDATED", "整系列核验通过后原子保存");
        return new MeetingViews.SeriesResult(parent, List.copyOf(result));
    }

    private boolean editable(SysScheduleEvent event, LocalDateTime now) {
        return "PLANNED".equals(event.getStatus()) && event.getStartTime().isAfter(now) && Integer.valueOf(0).equals(event.getRecurrenceExceptionFlag());
    }

    private void preserve(SysScheduleEvent desired, SysScheduleEvent previous) {
        desired.setEventId(previous.getEventId()); desired.setTenantId(previous.getTenantId()); desired.setCreatorId(previous.getCreatorId());
        desired.setVersion(previous.getVersion()); desired.setCreateTime(previous.getCreateTime()); desired.setDeleted(0);
        desired.setStatus(previous.getStatus()); desired.setOriginalStartTime(previous.getOriginalStartTime()); desired.setRecurrenceExceptionFlag(0);
    }

    private SysScheduleEvent copy(SysScheduleEvent event) { SysScheduleEvent result = new SysScheduleEvent(); BeanUtils.copyProperties(event, result); return result; }
}
