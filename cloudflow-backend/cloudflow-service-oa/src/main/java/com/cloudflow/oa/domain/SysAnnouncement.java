package com.cloudflow.oa.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;
import java.time.LocalDateTime;

/**
 * 系统公告实体类
 */
@Data
@TableName("sys_announcement")
public class SysAnnouncement {
    
    @TableId(type = IdType.AUTO)
    private Long announcementId;
    
    private String title;
    
    private String content;
    
    /**
     * 1:通知, 2:公告, 3:紧急
     */
    private String type;
    
    /**
     * ALL, DEPT, ROLE
     */
    private String scopeType;
    
    /**
     * 范围值 (部门ID或角色ID)
     */
    private String scopeValue;
    
    /**
     * 0:草稿, 1:已发布, 2:已撤销
     */
    private String status;
    
    /**
     * L:低, M:中, H:高
     */
    private String priority;
    
    private Long senderId;
    
    private String createBy;
    
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;
    
    private String updateBy;
    
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;
    
    @TableLogic
    private String delFlag;
    
    /** 租户ID */
    private Long tenantId;
    
    /** 是否置顶: 0-否, 1-是 */
    private Integer isTop;
    
    /** 发布时间 */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime publishTime;
    
    /** 过期时间(NULL表示永不过期) */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime expireTime;
    
    /**
     * 是否已读 (非数据库字段)
     * 使用 Boolean 包装类型确保 MyBatis 正确映射 is_read 列
     * 添加 @JsonProperty 确保 Jackson 序列化字段名为 "isRead"
     */
    @TableField(exist = false)
    @JsonProperty("isRead")
    private Boolean isRead;
}
