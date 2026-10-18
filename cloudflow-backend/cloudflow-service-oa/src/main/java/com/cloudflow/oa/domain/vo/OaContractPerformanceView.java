package com.cloudflow.oa.domain.vo;

import com.fasterxml.jackson.annotation.JsonFormat;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

public record OaContractPerformanceView(String state, String message, Integer businessVersion,
        boolean approvalPassed, boolean signed, @JsonFormat(pattern = "yyyy-MM-dd") LocalDate startDate,
        @JsonFormat(pattern = "yyyy-MM-dd") LocalDate endDate, BigDecimal confirmedAmount, String currency,
        @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime confirmedTime) { }
