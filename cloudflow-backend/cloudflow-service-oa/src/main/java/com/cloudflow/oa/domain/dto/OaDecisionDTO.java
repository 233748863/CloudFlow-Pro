package com.cloudflow.oa.domain.dto;

import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class OaDecisionDTO {
    private Boolean accepted;
    private Boolean repairable;
    @Size(max = 500)
    private String reason;
    @Size(max = 10000)
    private String actions;
}
