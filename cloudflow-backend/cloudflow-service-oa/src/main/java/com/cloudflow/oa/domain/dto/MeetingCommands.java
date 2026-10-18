package com.cloudflow.oa.domain.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import lombok.Data;

public final class MeetingCommands {
    private MeetingCommands() { }

    public record Reminder(Integer remindMinutesBefore, String channelType) { }

    @Data
    public static class Booking {
        private Integer version;
        private String title;
        private String description;
        private Long roomId;
        @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
        private LocalDateTime startTime;
        @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
        private LocalDateTime endTime;
        private Integer expectedAttendees;
        private List<Long> attendeeIds;
        private String joinUrl;
        private String meetingPlatform;
        private List<Reminder> reminders;
        private boolean draft;
        private boolean confirmParticipantConflicts;
        private String timezoneId = "Asia/Shanghai";
        private String recurrenceRule;
        private LocalDate recurrenceEndDate;
        private boolean confirmSeriesChanges;
        private String impactDigest;
    }

    @Data
    public static class Rule {
        private Integer version;
        private List<String> equipmentTags;
        private LocalTime openTime;
        private LocalTime closeTime;
        private List<Integer> bookableWeekdays;
        private Long holidayCalendarId;
        private Integer holidayBookableFlag;
        private Integer minBookingMinutes;
        private Integer maxBookingMinutes;
        private Integer advanceBookingDays;
        private Integer needApprovalFlag;
        private Long approverId;
        private Integer bufferMinutes;
        private Long photoFileId;
        private boolean confirmExistingConflicts;
        private String impactDigest;
    }

    public record Change(Integer version, String reason, String targetStatus) { }
    public record Submit(Integer version, boolean confirmParticipantConflicts) { }
    public record Response(Integer invitationVersion, String acceptanceStatus) { }
}
