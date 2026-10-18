package com.cloudflow.oa.domain.dto;

import lombok.Data;
import lombok.EqualsAndHashCode;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;

import java.util.List;

/**
 * 采购分批入库请求。
 */
@Data
@EqualsAndHashCode(callSuper = true)
public class PurchaseReceiptDTO extends ConsumableInput {

    private String operationKey;

    @JsonDeserialize(using = IntegerValue.class)
    private Integer purchaseVersion;

    private String remark;

    private List<PurchaseReceiptItemDTO> items;

    @Data
    @EqualsAndHashCode(callSuper = true)
    public static class PurchaseReceiptItemDTO extends ConsumableInput {
        private Long itemId;
        @JsonDeserialize(using = IntegerValue.class)
        private Integer quantity;
    }
}
