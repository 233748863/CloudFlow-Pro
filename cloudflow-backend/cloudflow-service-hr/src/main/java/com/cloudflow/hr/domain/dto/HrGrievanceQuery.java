package com.cloudflow.hr.domain.dto;

import com.cloudflow.common.core.domain.PageQuery;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
public class HrGrievanceQuery extends PageQuery {
    private String status;
    private String grievanceType;
    private Long deptId;
    private Long handlerId;
}
