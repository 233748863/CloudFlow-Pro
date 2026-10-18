package com.cloudflow.crm.domain.dto;

import java.math.BigDecimal;
import java.util.List;

public record CrmOpportunityItemsRequest(Integer version, List<Item> items) {
    public record Item(Long productId, String productNo, String productName, String spec, String unit,
            BigDecimal quantity, BigDecimal unitPrice, BigDecimal discountRate, BigDecimal taxRate, String remark) { }
}
