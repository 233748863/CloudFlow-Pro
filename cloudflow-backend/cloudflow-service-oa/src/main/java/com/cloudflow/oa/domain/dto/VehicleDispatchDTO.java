package com.cloudflow.oa.domain.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
public class VehicleDispatchDTO {

    private Integer driverMode;

    private Long driverId;

    private BigDecimal startMileage;

    private String dispatchRemark;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime actualStartTime;
}
