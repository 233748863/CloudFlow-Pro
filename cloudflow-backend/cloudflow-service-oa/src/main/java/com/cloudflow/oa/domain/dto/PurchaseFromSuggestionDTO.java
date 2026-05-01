package com.cloudflow.oa.domain.dto;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 基于补货建议创建采购草稿。
 */
@Data
public class PurchaseFromSuggestionDTO {

    private Long supplierId;

    private LocalDateTime expectedDate;

    private String reason;

    private List<Item> items;

    @Data
    public static class Item {
        private Long consumableId;

        private Integer quantity;
    }
}
