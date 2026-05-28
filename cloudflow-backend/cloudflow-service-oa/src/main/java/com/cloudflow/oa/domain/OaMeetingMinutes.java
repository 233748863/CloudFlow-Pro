package com.cloudflow.oa.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * OA-P1-2 会议纪要。
 */
@Data
@TableName("oa_meeting_minutes")
public class OaMeetingMinutes implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private Long meetingId;
    private String meetingTitle;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime meetingTime;

    private String roomId;
    private String location;
    private Long organizerId;
    private String organizerName;
    /** 关联的日程事件ID（会议室预约） */
    private Long scheduleEventId;
    /** 富文本 HTML 正文 */
    private String minutesContent;
    /** 决议项 JSON 字符串: [{title,owner,deadline,workTaskId}] */
    private String decisions;
    private String attachmentUrl;
    /** DRAFT / CONFIRMED */
    private String status;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime confirmedTime;

    private Integer deleted;
    private String createBy;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;

    private String updateBy;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;
}
