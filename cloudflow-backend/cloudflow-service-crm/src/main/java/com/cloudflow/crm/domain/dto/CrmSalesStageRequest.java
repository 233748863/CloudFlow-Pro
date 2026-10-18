package com.cloudflow.crm.domain.dto;

import java.math.BigDecimal;
import java.util.List;

public record CrmSalesStageRequest(Long stageId, Integer version, String stageCode, String stageName,
        Integer sortNo, BigDecimal defaultWinRate, Integer allowSkipFlag, List<String> requiredFields,
        Integer requiredActivityFlag, Integer overdueDays, Integer isWonFlag, Integer isLostFlag, String status) { }
