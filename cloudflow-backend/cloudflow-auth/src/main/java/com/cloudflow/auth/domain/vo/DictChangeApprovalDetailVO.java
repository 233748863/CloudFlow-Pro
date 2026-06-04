package com.cloudflow.auth.domain.vo;

import com.cloudflow.auth.domain.dto.DictChangeApprovalPayload;
import lombok.Data;

@Data
public class DictChangeApprovalDetailVO extends DictChangeApprovalSummaryVO {

    private String payloadJson;

    private DictChangeApprovalPayload payload;
}
