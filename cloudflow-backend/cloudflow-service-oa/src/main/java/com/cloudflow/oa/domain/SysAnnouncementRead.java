package com.cloudflow.oa.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.util.Date;

/**
 * 公告阅读记录实体类
 */
@Data
@TableName("sys_announcement_read")
public class SysAnnouncementRead {
    
    @TableId(type = IdType.AUTO)
    private Long id;
    
    private Long announcementId;
    
    private Long userId;
    
    private Date readTime;
}
