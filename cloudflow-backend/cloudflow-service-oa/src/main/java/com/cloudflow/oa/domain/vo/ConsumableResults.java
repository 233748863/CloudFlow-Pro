package com.cloudflow.oa.domain.vo;

import com.cloudflow.oa.domain.OaConsumableLedger;
import com.cloudflow.oa.domain.OaConsumableRequest;
import com.cloudflow.oa.domain.OaConsumableRequestItem;
import com.cloudflow.oa.domain.BizPurchaseReceipt;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;
import lombok.EqualsAndHashCode;
import java.util.List;
import java.util.Map;

public final class ConsumableResults {
    private ConsumableResults() { }

    @Data
    @EqualsAndHashCode(callSuper = true)
    public static class PurchaseReceiptView extends BizPurchaseReceipt {
        private String ledgerId;
        private boolean reversed;
        private String reversalLedgerId;
    }

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class StockRow {
        private String ledgerId;
        private String consumableId;
        private String transactionType;
        private Integer quantity;
        private Integer balanceAfter;
        private String unit;
        private String unitPrice;
        private String amount;
        private String balanceAmountAfter;
    }

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class StockPosting {
        private String operationKey;
        private boolean replayed;
        private List<String> ledgerIds;
        private List<StockRow> rows;
        private String sourceId;
    }

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class IssueRow {
        private String itemId;
        private Integer requestedQuantity;
        private Integer issuedQuantity;
        private Integer shortageQuantity;
        private String ledgerId;
    }

    @Data
    public static class IssueResult {
        private String requestId;
        private String status;
        private Integer version;
        private boolean replayed;
        private List<IssueRow> rows;
        private List<String> ledgerIds;
    }

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class RequestResult {
        private String requestId;
        private String requestNo;
        private String status;
        private Integer version;
        private String instanceId;
        private boolean approvalPending;
        private boolean replayed;
    }

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class Balance {
        private Integer quantity;
        private String stockAmount;
        private String avgCost;
        private String lastPurchasePrice;
        private Integer version;
    }

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class Recalculation {
        private boolean consistent;
        private Balance before;
        private Balance expected;
        private Balance after;
        private boolean changed;
        private String reason;
    }

    @Data
    @EqualsAndHashCode(callSuper = true)
    public static class LedgerView extends OaConsumableLedger {
        private String sourceDocumentId;
        private Integer sourceVersion;
        private boolean reversed;
        private String reversalLedgerId;
        private Integer returnedQuantity;
        private Map<String, Object> assetLog;
    }

    @Data
    @EqualsAndHashCode(callSuper = true)
    public static class RequestView extends OaConsumableRequest {
        private List<OaConsumableRequestItem> items;
        private List<LedgerView> transactions;
    }

    @Data
    public static class CatalogItem {
        private String consumableId;
        private String name;
        private String model;
        private String unit;
        private String categoryId;
        private Integer quantity;
    }

    @Data
    public static class Category {
        private String categoryId;
        private String label;
        private String value;
    }

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class ReportRow {
        private String consumableId;
        private String name;
        private String unit;
        private String deptId;
        private String deptName;
        private String beneficiaryId;
        private String beneficiaryName;
        @JsonFormat(shape = JsonFormat.Shape.STRING)
        private Long openingQuantity;
        @JsonFormat(shape = JsonFormat.Shape.STRING)
        private Long inboundQuantity;
        @JsonFormat(shape = JsonFormat.Shape.STRING)
        private Long outboundQuantity;
        @JsonFormat(shape = JsonFormat.Shape.STRING)
        private Long closingQuantity;
        @JsonFormat(shape = JsonFormat.Shape.STRING)
        private Long issuedQuantity;
        @JsonFormat(shape = JsonFormat.Shape.STRING)
        private Long returnedQuantity;
        @JsonFormat(shape = JsonFormat.Shape.STRING)
        private Long netQuantity;
        private String openingAmount;
        private String inboundAmount;
        private String inboundCost;
        private String outboundAmount;
        private String closingAmount;
        private String issuedAmount;
        private String returnedAmount;
        private String netAmount;
        private String scrapAmount;
        private String adjustAmount;
    }
}
