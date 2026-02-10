package com.cloudflow.oa.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.util.Date;

@Data
@TableName("sys_notice")
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
    
    private Date createTime;
    
    private String updateBy;
    
    private Date updateTime;
    
    private String remark;
    
    /** 租户ID */
    private Long tenantId;
}
