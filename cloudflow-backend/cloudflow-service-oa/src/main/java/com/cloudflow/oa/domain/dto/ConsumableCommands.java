package com.cloudflow.oa.domain.dto;

import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import lombok.Data;
import lombok.EqualsAndHashCode;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public final class ConsumableCommands {
    private ConsumableCommands() { }

    @Data
    @EqualsAndHashCode(callSuper = true)
    public static class MasterData extends ConsumableInput {
        private Long consumableId;
        @JsonDeserialize(using = IntegerValue.class)
        private Integer version;
        private String name;
        private String model;
        private String unit;
        private Long categoryId;
        private String brand;
        @JsonDeserialize(using = IntegerValue.class)
        private Integer lowStockThreshold;
        @JsonDeserialize(using = IntegerValue.class)
        private Integer targetStock;
        @JsonDeserialize(using = IntegerValue.class)
        private Integer maxStock;
        private Long defaultSupplierId;
        @JsonDeserialize(using = IntegerValue.class)
        private Integer warnEnabled;
        private String storageLocation;
        private String status;
    }

    @Data
    @EqualsAndHashCode(callSuper = true)
    public static class Operation extends ConsumableInput {
        private String operationKey;
        private String remark;
    }

    @Data
    @EqualsAndHashCode(callSuper = true)
    public static class Stock extends Operation {
        @JsonDeserialize(using = IntegerValue.class)
        private Integer quantity;
        @JsonDeserialize(using = MoneyValue.class)
        private BigDecimal unitPrice;
    }

    @Data
    @EqualsAndHashCode(callSuper = true)
    public static class Adjustment extends Stock {
        private String direction;
    }

    @Data
    @EqualsAndHashCode(callSuper = true)
    public static class ReturnStock extends Operation {
        private Long sourceLedgerId;
        @JsonDeserialize(using = IntegerValue.class)
        private Integer quantity;
        @JsonDeserialize(using = IntegerValue.class)
        private Integer requestVersion;
    }

    @Data
    @EqualsAndHashCode(callSuper = true)
    public static class Reverse extends Operation {
        @JsonDeserialize(using = IntegerValue.class)
        private Integer purchaseVersion;
        @JsonDeserialize(using = IntegerValue.class)
        private Integer requestVersion;
    }

    @Data
    @EqualsAndHashCode(callSuper = true)
    public static class Recalculate extends Operation {
        private String mode;
        @JsonDeserialize(using = IntegerValue.class)
        private Integer version;
    }

    @Data
    @EqualsAndHashCode(callSuper = true)
    public static class RequestLine extends ConsumableInput {
        private Long consumableId;
        @JsonDeserialize(using = IntegerValue.class)
        private Integer applyQuantity;
        private String remark;
    }

    @Data
    @EqualsAndHashCode(callSuper = true)
    public static class RequestData extends ConsumableInput {
        private String purpose;
        private LocalDate applyDate;
        private LocalDate expectDate;
        private List<RequestLine> items;
    }

    @Data
    @EqualsAndHashCode(callSuper = true)
    public static class CreateRequest extends RequestData {
        private String operationKey;
    }

    @Data
    @EqualsAndHashCode(callSuper = true)
    public static class EditRequest extends RequestData {
        @JsonDeserialize(using = IntegerValue.class)
        private Integer version;
    }

    @Data
    @EqualsAndHashCode(callSuper = true)
    public static class Submit extends ConsumableInput {
        private String operationKey;
        @JsonDeserialize(using = IntegerValue.class)
        private Integer version;
    }

    @Data
    @EqualsAndHashCode(callSuper = true)
    public static class Cancel extends ConsumableInput {
        @JsonDeserialize(using = IntegerValue.class)
        private Integer version;
        private String reason;
    }

    @Data
    @EqualsAndHashCode(callSuper = true)
    public static class IssueLine extends ConsumableInput {
        private Long itemId;
        @JsonDeserialize(using = IntegerValue.class)
        private Integer quantity;
    }

    @Data
    @EqualsAndHashCode(callSuper = true)
    public static class Issue extends Operation {
        @JsonDeserialize(using = IntegerValue.class)
        private Integer version;
        private Boolean allowPartial = false;
        private List<IssueLine> items;
    }
}
