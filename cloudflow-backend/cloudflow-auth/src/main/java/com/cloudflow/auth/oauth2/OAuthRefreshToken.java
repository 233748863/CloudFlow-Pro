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
@TableName("sys_oauth2_refresh_token")
public class OAuthRefreshToken implements Serializable {
    private static final long serialVersionUID = 1L;
    @TableId(type = IdType.AUTO)
    private Long refreshTokenId;
    private Long tenantId;
    private Long clientId;
    private Long userId;
    @JsonIgnore
    private String tokenHash;
    private String familyId;
    private String scopes;
    private Integer clientVersion;
    private Long previousTokenId;
    private Long replacedById;
    private String status;
    private LocalDateTime issuedTime;
    private LocalDateTime expiresTime;
    private LocalDateTime consumedTime;
    private LocalDateTime revokedTime;
    private String createBy;
    private LocalDateTime createTime;
    private String updateBy;
    private LocalDateTime updateTime;
}

