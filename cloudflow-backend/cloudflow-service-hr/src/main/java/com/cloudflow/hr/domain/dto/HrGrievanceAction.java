package com.cloudflow.hr.domain.dto;

import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;

@Data
public class HrGrievanceAction {
    @Size(max = 10000)
    private String content;
    private Long handlerId;
    private Boolean visibleToEmployee;
    private Boolean satisfied;
    @Size(max = 10)
    private List<Long> fileIds;
}
