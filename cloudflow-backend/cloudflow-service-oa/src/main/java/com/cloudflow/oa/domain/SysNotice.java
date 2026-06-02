package com.cloudflow.oa.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@TableName("wf_notice")
public class SysNotice {
    @TableId(type = IdType.AUTO)
    private Long noticeId;
    
    private String noticeTitle;
    
    /**
     * 1: Notification, 2: Urge
     */
    private String noticeType;
    
    private String noticeContent;
    
    private Long senderId;
    
    private Long recipientId;
    
    /**
     * 0: Unread, 1: Read
     */
    private String status;
    
    private String createBy;
    
    
    @Version
    
    private Integer version;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")

    
    private LocalDateTime createTime;
    
    private String updateBy;
    
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")

    
    private LocalDateTime updateTime;
    
    private String remark;
    
    /** 租户ID */
    private Long tenantId;
}
