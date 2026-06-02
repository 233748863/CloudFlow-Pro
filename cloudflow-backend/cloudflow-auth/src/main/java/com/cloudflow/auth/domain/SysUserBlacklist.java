package com.cloudflow.auth.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * GOV-P0-1 用户黑名单。
 *
 * <p>登录环节由 LoginServiceImpl 校验 Redis KEY {@code acl:user:black:{userId}}, TTL 跟随 expire_at。
 */
@Data
@TableName("sys_user_blacklist")
public class SysUserBlacklist implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private Long userId;
    private String userName;
    /** ACTIVE / INACTIVE */
    private String status;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime expireAt;

    private String reason;
    private Long opUserId;
    private String opUserName;
    private Integer deleted;
    @Version
    private Integer version;
    private String createBy;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;

    private String updateBy;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;
}
