package com.cloudflow.oa.domain.vo;

import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDate;

@Data
public class OaTimesheetDayTotal {
    private LocalDate workDate;
    private BigDecimal hours;
}
