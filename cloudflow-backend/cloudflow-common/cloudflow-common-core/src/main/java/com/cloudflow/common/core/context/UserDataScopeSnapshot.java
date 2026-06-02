package com.cloudflow.common.core.context;

import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.List;

@Data
public class UserDataScopeSnapshot implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long tenantId;
    private Long userId;
    private Integer dsType;
    private List<Long> dsDeptIds;
    private LocalDateTime refreshedAt;
}
