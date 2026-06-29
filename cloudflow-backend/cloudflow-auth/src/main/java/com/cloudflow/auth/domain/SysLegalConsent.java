package com.cloudflow.auth.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * User consent evidence for a legal release.
 */
@Data
@TableName("sys_legal_consent")
public class SysLegalConsent {

    @TableId(value = "consent_id", type = IdType.AUTO)
    private Long consentId;

    private Long tenantId;

    private Long userId;

    private String userName;

    private String releaseCode;

    private String documentSnapshot;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime acceptedAt;

    private String acceptedIp;

    private String userAgent;

    /**
     * LOGIN/REGISTER/ADMIN.
     */
    private String source;

    private String createBy;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;
}
