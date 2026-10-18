package com.cloudflow.oa.domain.vo;

import com.cloudflow.oa.domain.MeetingRoom;
import com.cloudflow.oa.domain.OaMeetingAttendance;
import com.cloudflow.oa.domain.OaMeetingReminder;
import com.cloudflow.oa.domain.SysScheduleEvent;
import com.cloudflow.common.core.domain.ParticipantBusy;
import com.fasterxml.jackson.annotation.JsonFormat;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

public final class MeetingViews {
    private MeetingViews() { }

    public record Occupancy(Long eventId, String title, Long roomId,
            @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime startTime,
            @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime endTime,
            @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime bufferedEndTime,
            String status, String approvalStatus, boolean detailsVisible) { }
    public record RoomLane(MeetingRoom room, List<Occupancy> meetings, String unavailableReason) { }
    public record Detail(SysScheduleEvent event, List<OaMeetingAttendance> invitations,
                         List<OaMeetingReminder> reminders, boolean owner, boolean manageable, Long minutesId) { }
    public record Usage(MeetingRoom room, BigDecimal usedMinutes, BigDecimal bookedMinutes, BigDecimal openMinutes,
                        BigDecimal usagePercent, BigDecimal bookingPercent, String basis, String unavailableReason) { }
    public record RuleImpact(Long eventId, String title,
            @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime startTime, String reason) { }
    public record RulePreview(List<RuleImpact> affected, String impactDigest, String explanation) { }
    public record CalendarOption(Long calendarId, String calendarName) { }
    public record SeriesChange(Long eventId,
            @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime originalStartTime,
            @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime startTime,
            @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime endTime, String action, String reason) { }
    public record ParticipantConflicts(List<ParticipantBusy> busy, boolean crmVerified, String warning) {
        public boolean confirmationRequired() { return !crmVerified || !busy.isEmpty(); }
    }
    public record SeriesPreview(List<SeriesChange> changes, String impactDigest, boolean canSubmit, ParticipantConflicts participantConflicts) { }
    public record SeriesResult(SysScheduleEvent series, List<SysScheduleEvent> instances) { }
}
