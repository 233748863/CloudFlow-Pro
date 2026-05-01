package com.cloudflow.oa.domain.dto;

import lombok.Data;

/**
 * 耗材补货建议。
 */
@Data
public class ConsumableReplenishmentSuggestionDTO {

    private Long consumableId;

    private String name;

    private String model;

    private String unit;

    private Integer quantity;

    private Integer lowStockThreshold;

    private Integer targetStock;

    private Integer suggestedQuantity;

    private Long defaultSupplierId;

    private String defaultSupplierName;
}
