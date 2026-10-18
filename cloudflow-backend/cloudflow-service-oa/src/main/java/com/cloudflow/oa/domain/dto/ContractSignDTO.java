package com.cloudflow.oa.domain.dto;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class ContractSignDTO {
    private String signMethod;
    private String counterpartySignee;
    private LocalDateTime counterpartySignTime;
    private String signPlace;
    private String signRemark;
    private String signedFileUrl;
}
