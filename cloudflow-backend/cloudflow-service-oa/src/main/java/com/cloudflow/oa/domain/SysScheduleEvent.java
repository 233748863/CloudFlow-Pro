package com.cloudflow.oa.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.Version;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;
import java.time.LocalDateTime;
import java.time.LocalDate;

/**
 * 日程事件实体
 */
@Data
@TableName("oa_schedule_event")
public class SysScheduleEvent {
    
    @TableId(type = IdType.AUTO)
    private Long eventId;
    
    private String title;
    
    private String description;
    
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss", timezone = "Asia/Shanghai")
    private LocalDateTime startTime;
    
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss", timezone = "Asia/Shanghai")
    private LocalDateTime endTime;
    
    private Boolean isAllDay;
    
    /**
     * MEETING, PERSONAL, WORK
     */
    private String type;
    
    private Long roomId;
    
    private Long creatorId;
    
    /**
     * JSON Array: [1, 2, 3]
     */
    private String attendees;

    private String joinUrl;
    private String meetingPlatform;
    private String reminders;
    private String recurrenceRule;
    private LocalDate recurrenceEndDate;
    private String recurrenceRole;
    private Long parentEventId;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime originalStartTime;

    private Integer recurrenceExceptionFlag;
    private Integer sourceSeriesVersion;
    private String timezoneId;
    private String status;
    private String approvalStatus;
    private String instanceId;
    private Integer expectedAttendees;
    private Integer bufferMinutesSnapshot;
    private Integer scheduleVersion;

    @com.baomidou.mybatisplus.annotation.TableField(exist = false)
    private boolean confirmParticipantConflicts;

    @Version
    private Integer version;
    
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss", timezone = "Asia/Shanghai")
    private LocalDateTime createTime;
    
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss", timezone = "Asia/Shanghai")
    private LocalDateTime updateTime;
    
    @TableLogic
    private Integer deleted;
    
    /** 租户ID */
    private Long tenantId;
}
