package com.cloudflow.oa.domain.dto;

import lombok.Data;

/**
 * 车辆归还入参。
 */
@Data
public class VehicleReturnDTO {

    private Double endMileage;

    private String remark;

    private String returnLocation;
}
