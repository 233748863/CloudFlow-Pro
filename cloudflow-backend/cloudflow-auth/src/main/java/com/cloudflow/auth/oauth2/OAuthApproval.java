package com.cloudflow.auth.oauth2;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import com.fasterxml.jackson.annotation.JsonIgnore;
import java.io.Serializable;
import java.time.LocalDateTime;
import lombok.Data;
import lombok.ToString;

@Data
@ToString(onlyExplicitlyIncluded = true)
@TableName("sys_oauth2_approve")
public class OAuthApproval implements Serializable {
    private static final long serialVersionUID = 1L;
    @TableId(type = IdType.AUTO)
    private Long approveId;
    private Long tenantId;
    private Long clientId;
    private Long userId;
    private String scopes;
    private Integer clientVersion;
    private LocalDateTime approvedTime;
    private LocalDateTime expiresTime;
    private LocalDateTime revokedTime;
    @Version
    private Integer version;
    private String createBy;
    private LocalDateTime createTime;
    private String updateBy;
    private LocalDateTime updateTime;
}

