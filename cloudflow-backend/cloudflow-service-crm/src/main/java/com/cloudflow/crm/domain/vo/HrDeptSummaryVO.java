package com.cloudflow.crm.domain.vo;

import lombok.Data;

/**
 * HR 部门视图（从 service-hr Feign 拉取的精简数据）。
 */
@Data
public class HrDeptSummaryVO {

    private Long deptId;

    private String deptName;

    private Long parentId;

    private String status;
}
