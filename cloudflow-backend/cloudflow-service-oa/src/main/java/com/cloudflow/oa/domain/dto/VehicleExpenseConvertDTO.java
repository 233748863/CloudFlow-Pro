package com.cloudflow.oa.domain.dto;

import lombok.Data;

import java.util.List;

/**
 * 车辆费用转报销单入参。
 */
@Data
public class VehicleExpenseConvertDTO {

    private List<Long> vehicleExpenseIds;

    private Long userId;
}
