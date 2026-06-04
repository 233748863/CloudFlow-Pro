package com.cloudflow.auth.domain.dto;

import lombok.Data;

@Data
public class DeptMigrateRequest {

    private Long sourceDeptId;

    private Long targetDeptId;
}
