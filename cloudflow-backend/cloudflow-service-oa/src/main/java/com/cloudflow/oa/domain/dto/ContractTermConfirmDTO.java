package com.cloudflow.oa.domain.dto;

import lombok.Data;
import java.time.LocalDate;

@Data
public class ContractTermConfirmDTO {
    private LocalDate fulfilledDate;
    private String evidenceFileUrl;
    private String evidenceRemark;
    private String waivedReason;
}
