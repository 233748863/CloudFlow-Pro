package com.cloudflow.hr.domain.dto;

import lombok.Data;

/**
 * 编制查询DTO
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
public class HeadcountQueryDTO {

    /**
     * 目标类型：DEPT-部门 POST-岗位
     */
    private String targetType;

    /**
     * 目标ID
     */
    private Long targetId;

    /**
     * 是否包含已过期的编制
     */
    private Boolean includeExpired;
}
