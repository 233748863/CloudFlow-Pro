package com.cloudflow.oa.domain.dto;

import lombok.Data;

/**
 * 耗材库存调整入参。
 */
@Data
public class ConsumableStockDTO {

    private Integer quantity;

    private String stockOutType;

    private String remark;
}
