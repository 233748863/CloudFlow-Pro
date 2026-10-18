package com.cloudflow.auth.oauth2;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonIgnore;
import java.io.Serializable;
import java.time.LocalDateTime;
import lombok.Data;
import lombok.ToString;

@Data
@ToString(onlyExplicitlyIncluded = true)
@TableName("sys_oauth2_code")
public class OAuthCode implements Serializable {
    private static final long serialVersionUID = 1L;
    @TableId(type = IdType.AUTO)
    private Long codeId;
    private Long tenantId;
    private Long clientId;
    private Long userId;
    @JsonIgnore
    private String requestHash;
    @JsonIgnore
    private String sessionBindingHash;
    @JsonIgnore
    private String codeHash;
    private String redirectUri;
    private String requestedScopes;
    private String approvedScopes;
    @JsonIgnore
    private String stateValue;
    @JsonIgnore
    private String codeChallenge;
    @JsonIgnore
    private String codeChallengeMethod;
    private Integer clientVersion;
    private String status;
    private LocalDateTime expiresTime;
    private LocalDateTime consumedTime;
    private String createBy;
    private LocalDateTime createTime;
    private String updateBy;
    private LocalDateTime updateTime;
}

