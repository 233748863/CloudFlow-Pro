package com.cloudflow.hr.domain.dto;

import lombok.Data;

import java.time.LocalDate;

@Data
public class HrLifecycleStatusChangePayload {

    private LocalDate confirmDate;
    private LocalDate actualDate;
    private String remark;
}
