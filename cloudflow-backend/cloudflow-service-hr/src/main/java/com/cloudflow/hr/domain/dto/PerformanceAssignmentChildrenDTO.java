package com.cloudflow.hr.domain.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import lombok.Data;

import java.util.List;

@Data
public class PerformanceAssignmentChildrenDTO {

    @Valid
    @NotEmpty(message = "子级分配不能为空")
    private List<PerformanceAssignmentChildDTO> children;
}
