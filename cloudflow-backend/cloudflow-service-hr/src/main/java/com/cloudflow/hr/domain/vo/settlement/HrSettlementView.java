package com.cloudflow.hr.domain.vo.settlement;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.LocalDate;
import java.util.List;

public record HrSettlementView(Long settlementId, String settlementNo, Long employeeId, String employeeName,
        Long lifecycleApplicationId, LocalDate joinDate, LocalDate relievingDate, Long ruleId, String status,
        String approvalStatus, Integer version, String remark, String totalPayable, String totalReceivable,
        String assetRecoveryCost, String severanceAmount, String netAmount, JsonNode sampling,
        boolean calculated, List<String> missingRequirements, List<Item> items, String ruleName, boolean editable, ApprovalProgress approval, FundsProgress funds,
        String settlementKind, boolean canSubmit, ReversalProgress reversal, boolean canRemindAssets) {
    public record ReversalProgress(Long originalSettlementId, String originalSettlementNo, Long reversalSettlementId, boolean completed, boolean canCreate) { }
    public record ApprovalProgress(int revision, boolean cancelPending, boolean canWithdraw, String cancelOutcome) { }
    public record FundsProgress(String direction, String confirmedTime, String paidTime, Long paymentRequestId, Long proofFileId,
                                String actualDate, String closedTime, boolean canConfirm, boolean canReceipt, boolean canClose) { }
    public record Item(Long itemId, String itemType, String itemName, String sourceBizType, String sourceBizId,
                       String amount, boolean confirmed, boolean posted, JsonNode evidence) { }
    public record Option(Long value, String label, Long employeeId, LocalDate relievingDate) { }
    public record PolicyOption(Long value, String label) { }
}
