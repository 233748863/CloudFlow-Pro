package com.cloudflow.crm.domain.vo;

import com.fasterxml.jackson.annotation.JsonFormat;
import java.math.BigDecimal;

public record CrmSalesTargetPreviewVO(Integer version, String previousBasis, String previousCurrency,
        String calculationBasis, String currency,
        @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal previousAchievedAmount,
        @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal ownerReceivedAmount,
        @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal teamReceivedAmount,
        @JsonFormat(shape = JsonFormat.Shape.STRING) BigDecimal baselineAmount,
        boolean confirmationRequired, String fingerprint) { }
