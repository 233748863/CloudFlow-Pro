package com.cloudflow.workflow.domain.dto;

import lombok.Data;

/**
 * 回滚请求DTO
 */
@Data
public class RollbackRequestDTO {
    
    /** 发布记录ID */
    private Long deployId;
    
    /** 目标版本号 */
    private Integer targetVersion;
    
    /** 回滚原因 */
    private String rollbackReason;
    
    /** 是否强制回滚 */
    private Boolean forceRollback = false;
}
