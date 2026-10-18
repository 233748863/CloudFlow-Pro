package com.cloudflow.auth.im;

import java.time.LocalDateTime;
import lombok.Getter;
import lombok.Setter;
import lombok.ToString;

@Getter
@Setter
@ToString(onlyExplicitlyIncluded = true)
public class ImBindingRow {
    private Long mappingId;
    private Long tenantId;
    private Long configId;
    private Long userId;
    private String imType;
    private String imUserId;
    private String bindType;
    private LocalDateTime bindTime;
    private LocalDateTime lastSyncTime;
    private String status;
    private Integer version;
    private String createBy;
    private String updateBy;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
