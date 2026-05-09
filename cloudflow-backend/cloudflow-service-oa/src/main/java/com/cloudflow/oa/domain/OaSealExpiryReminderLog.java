package com.cloudflow.oa.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 印章到期提醒日志。
 */
@Data
@TableName("oa_seal_expiry_reminder_log")
public class OaSealExpiryReminderLog implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private Long sealId;
    private String sealName;

    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate expireDate;

    private Integer daysBefore;
    private Long recipientId;
    private String recipientName;
    private String reminderType;
    private Long operatorId;
    private String operatorName;
    private String reminderContent;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime reminderTime;

    private String createBy;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;
}
