package com.cloudflow.hr.domain.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;

@Data
public class HrGrievanceRequest {
    @NotBlank
    @Size(max = 30)
    private String grievanceType;
    @NotBlank
    @Size(max = 200)
    private String subject;
    @NotBlank
    @Size(max = 10000)
    private String description;
    @Size(max = 1000)
    private String cause;
    @Size(max = 1000)
    private String expectation;
    private String againstType;
    private Long againstId;
    @Size(max = 128)
    private String againstName;
    @Size(max = 50)
    private String relatedBizType;
    private Long relatedBizId;
    private String priority;
    @Size(max = 10)
    private List<Long> fileIds;
}
