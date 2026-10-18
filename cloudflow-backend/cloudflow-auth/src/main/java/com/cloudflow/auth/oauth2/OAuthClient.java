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
@TableName("sys_oauth2_client")
public class OAuthClient implements Serializable {
    private static final long serialVersionUID = 1L;
    @TableId(type = IdType.AUTO)
    private Long clientId;
    private Long tenantId;
    private String clientKey;
    @JsonIgnore
    private String clientSecretEncrypted;
    private String clientType;
    private String clientName;
    private Long logoFileId;
    private String description;
    private Long serviceUserId;
    private Integer accessTokenValiditySeconds;
    private Integer refreshTokenValiditySeconds;
    private String redirectUris;
    private String grantTypes;
    private String scopes;
    private String autoApproveScopes;
    private String authorities;
    private String resourceIds;
    private String status;
    private Integer deleted;
    @Version
    private Integer version;
    private String createBy;
    private LocalDateTime createTime;
    private String updateBy;
    private LocalDateTime updateTime;
}

