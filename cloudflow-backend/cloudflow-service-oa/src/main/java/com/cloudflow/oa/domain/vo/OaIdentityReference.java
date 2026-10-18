package com.cloudflow.oa.domain.vo;

import lombok.Data;

@Data
public class OaIdentityReference {
    private Long id;
    private Long tenantId;
    private String name;
    private Long deptId;
    private String deptName;
    private Long userId;
    private Long jobLevelId;
    private Long parentId;
    private String leader;
}
