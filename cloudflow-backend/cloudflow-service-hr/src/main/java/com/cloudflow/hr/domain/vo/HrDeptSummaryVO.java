package com.cloudflow.hr.domain.vo;

import lombok.Data;

@Data
public class HrDeptSummaryVO {

    private Long deptId;

    private String deptName;

    private Long parentId;

    private String status;
}
