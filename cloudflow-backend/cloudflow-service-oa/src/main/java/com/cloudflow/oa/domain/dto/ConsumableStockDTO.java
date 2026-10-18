package com.cloudflow.oa.domain.dto;

import lombok.Data;
import lombok.EqualsAndHashCode;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;

/**
 * 耗材库存调整入参。
 */
@Data
@EqualsAndHashCode(callSuper = true)
public class ConsumableStockDTO extends ConsumableCommands.Stock {

    private String stockOutType;

    private Long requestId;

    private Long itemId;

    @JsonDeserialize(using = ConsumableInput.IntegerValue.class)
    private Integer requestVersion;
}
