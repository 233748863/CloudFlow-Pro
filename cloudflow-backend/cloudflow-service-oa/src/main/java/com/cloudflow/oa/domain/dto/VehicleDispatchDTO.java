package com.cloudflow.oa.domain.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
public class VehicleDispatchDTO {

    private Integer driverMode;

    private Long driverId;

    private BigDecimal startMileage;

    private String dispatchRemark;

    private LocalDateTime actualStartTime;
}
