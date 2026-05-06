package com.cloudflow.oa.domain.dto;

import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 审计事件查询条件。
 */
@Data
public class AuditEventQueryDTO implements Serializable {
    private static final long serialVersionUID = 1L;

    private String businessType;
    private Long businessId;
    private String eventType;
    private String operatorName;
    private LocalDateTime beginTime;
    private LocalDateTime endTime;
    private Integer pageNum = 1;
    private Integer pageSize = 10;
}
