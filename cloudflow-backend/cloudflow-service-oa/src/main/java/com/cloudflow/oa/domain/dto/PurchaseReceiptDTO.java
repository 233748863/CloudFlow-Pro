package com.cloudflow.oa.domain.dto;

import lombok.Data;

import java.util.List;

/**
 * 采购分批入库请求。
 */
@Data
public class PurchaseReceiptDTO {

    private String remark;

    private List<PurchaseReceiptItemDTO> items;

    @Data
    public static class PurchaseReceiptItemDTO {
        private Long itemId;
        private Integer quantity;
    }
}
