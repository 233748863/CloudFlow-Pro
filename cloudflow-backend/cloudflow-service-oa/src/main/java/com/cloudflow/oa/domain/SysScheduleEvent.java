package com.cloudflow.oa.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;
import java.time.LocalDateTime;

/**
 * 日程事件实体
 */
@Data
@TableName("sys_schedule_event")
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
    
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss", timezone = "Asia/Shanghai")
    private LocalDateTime createTime;
    
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss", timezone = "Asia/Shanghai")
    private LocalDateTime updateTime;
    
    @TableLogic
    private String delFlag;
    
    /** 租户ID */
    private Long tenantId;
}
