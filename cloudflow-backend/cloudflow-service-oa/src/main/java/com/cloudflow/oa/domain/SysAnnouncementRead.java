package com.cloudflow.oa.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.time.LocalDateTime;

/**
 * 公告阅读记录实体类
 */
@Data
@TableName("oa_announcement_read")
public class SysAnnouncementRead {
    
    @TableId(type = IdType.AUTO)
    private Long id;
    
    private Long announcementId;
    
    private Long userId;
    
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")

    
    private LocalDateTime readTime;
    
    /** 租户ID */
    private Long tenantId;
}
