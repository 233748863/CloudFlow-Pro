package com.cloudflow.auth.im;

import com.fasterxml.jackson.annotation.JsonIgnore;
import java.time.LocalDateTime;
import lombok.Getter;
import lombok.Setter;
import lombok.ToString;

@Getter
@Setter
@ToString(onlyExplicitlyIncluded = true)
public class ImCallbackRow {
    private Long callbackId;
    private Long tenantId;
    private Long configId;
    private String eventKey;
    private String payloadHash;
    private String eventType;
    @JsonIgnore
    private String imUserId;
    private Long taskMappingId;
    private String actionType;
    private String status;
    private LocalDateTime claimUntil;
    private String resultCode;
    private String sourceIp;
    private LocalDateTime occurredTime;
    private LocalDateTime processedTime;
    private String createBy;
    private LocalDateTime createTime;
    private String updateBy;
    private LocalDateTime updateTime;
}
