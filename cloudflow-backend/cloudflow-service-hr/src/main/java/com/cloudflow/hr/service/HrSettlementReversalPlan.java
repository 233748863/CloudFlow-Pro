package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.entity.HrFinalSettlement;
import com.cloudflow.hr.domain.entity.HrFinalSettlementItem;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;

import static com.cloudflow.hr.service.HrHException.conflict;

/** Builds the exact opposite of posted amounts. It neither recognizes money nor changes any source. */
public final class HrSettlementReversalPlan {
    private static final Set<String> SOURCE_TYPES = Set.of("HR_SALARY_SLIP", "HR_ADVANCE", "HR_LEAVE_QUOTA",
            "HR_TRAINING_RECOVERY", "HR_SEVERANCE", "OA_ASSET");

    private HrSettlementReversalPlan() { }

    public record Plan(HrFinalSettlement settlement, List<HrFinalSettlementItem> items) {
        public Plan { items = List.copyOf(items); }
    }

    public static Plan create(HrFinalSettlement original, List<HrFinalSettlementItem> sourceItems,
            String reason, ObjectMapper json) {
        requireOriginal(original);
        if (reason == null || reason.strip().isEmpty() || reason.strip().length() > 500) throw HrHException.invalid("请填写不超过500字符的冲正原因");
        if (sourceItems == null || sourceItems.isEmpty()) throw changed();
        List<HrFinalSettlementItem> active = sourceItems.stream().filter(item -> item != null && item.getSourceSnapshot() != null
                && item.getSourceSnapshot().path("active").asBoolean(false)).toList();
        if (active.isEmpty()) throw changed();
        Set<String> sources = new HashSet<>(); Set<Long> identifiers = new HashSet<>();
        BigDecimal payable = BigDecimal.ZERO, receivable = BigDecimal.ZERO, severance = BigDecimal.ZERO, assets = BigDecimal.ZERO;
        List<HrFinalSettlementItem> reverseItems = new ArrayList<>();
        for (HrFinalSettlementItem item : sourceItems) {
            if (item == null || !Objects.equals(original.getTenantId(), item.getTenantId())
                    || !Objects.equals(original.getSettlementId(), item.getSettlementId()) || item.getItemId() == null
                    || item.getItemId() <= 0 || !identifiers.add(item.getItemId()) || !(item.getSourceSnapshot() instanceof ObjectNode snapshot)) throw changed();
            if (!snapshot.path("active").asBoolean(false)) {
                if (!Integer.valueOf(0).equals(item.getSourcePostedFlag())) throw changed();
                continue;
            }
            if (!SOURCE_TYPES.contains(String.valueOf(item.getSourceBizType())) || item.getSourceBizId() == null
                    || !item.getSourceBizId().matches("[1-9][0-9]{0,18}") || item.getItemName() == null || item.getItemName().isBlank()
                    || !validItemType(item) || !Integer.valueOf(1).equals(item.getConfirmedFlag()) || !Integer.valueOf(1).equals(item.getSourcePostedFlag())
                    || !sources.add(item.getSourceBizType() + ":" + item.getSourceBizId())) throw changed();
            BigDecimal amount = amount(item.getAmount());
            if (amount.signum() < 0) throw changed();
            switch (String.valueOf(item.getItemType())) {
                case "PAYABLE" -> payable = payable.add(amount);
                case "RECEIVABLE" -> receivable = receivable.add(amount);
                case "SEVERANCE" -> severance = severance.add(amount);
                case "ASSET" -> assets = assets.add(amount);
                default -> throw changed();
            }
            HrFinalSettlementItem reverse = new HrFinalSettlementItem();
            reverse.setTenantId(original.getTenantId()); reverse.setItemType(item.getItemType()); reverse.setItemName(item.getItemName());
            reverse.setSourceBizType(item.getSourceBizType()); reverse.setSourceBizId(item.getSourceBizId());
            reverse.setSourceSnapshot(snapshot.deepCopy().put("reversalOfItemId", item.getItemId().toString()));
            reverse.setAmount(amount.negate()); reverse.setConfirmedFlag(1); reverse.setSourcePostedFlag(0);
            reverse.setRemark("关联原结算明细，原金额相反数；尚未反向收付或入账"); reverseItems.add(reverse);
        }
        if (!same(payable, original.getTotalPayable()) || !same(receivable, original.getTotalReceivable())
                || !same(severance, original.getSeveranceAmount()) || !same(assets, original.getAssetRecoveryCost())
                || !same(payable.add(severance).subtract(receivable).subtract(assets), original.getNetAmount())) throw changed();
        HrFinalSettlement reverse = new HrFinalSettlement();
        reverse.setTenantId(original.getTenantId()); reverse.setEmployeeId(original.getEmployeeId());
        reverse.setLifecycleApplicationId(original.getLifecycleApplicationId()); reverse.setSettlementKind("REVERSAL");
        reverse.setReversalOfId(original.getSettlementId()); reverse.setSupersededFlag(0);
        reverse.setJoinDate(original.getJoinDate()); reverse.setRelievingDate(original.getRelievingDate());
        reverse.setWorkYears(original.getWorkYears()); reverse.setRuleId(original.getRuleId());
        reverse.setTotalPayable(amount(original.getTotalPayable()).negate()); reverse.setTotalReceivable(amount(original.getTotalReceivable()).negate());
        reverse.setSeveranceAmount(amount(original.getSeveranceAmount()).negate()); reverse.setAssetRecoveryCost(amount(original.getAssetRecoveryCost()).negate());
        reverse.setNetAmount(amount(original.getNetAmount()).negate()); reverse.setStatus("DRAFT"); reverse.setApprovalStatus("DRAFT");
        reverse.setVersion(0); reverse.setRemark(reason.strip());
        ObjectNode calculation = json.createObjectNode().put("calculated", true); calculation.putArray("missingRequirements");
        for (String field : List.of("sampling", "compensation", "rounding")) {
            JsonNode value = original.getCalculationSnapshot().get(field);
            if (value != null) calculation.set(field, value.deepCopy());
        }
        ObjectNode reversal = calculation.putObject("reversal");
        reversal.put("originalSettlementId", original.getSettlementId().toString()).put("originalVersion", original.getVersion());
        reversal.put("originalSettlementNo", original.getSettlementNo()).put("reason", reverse.getRemark());
        reversal.set("original", json.valueToTree(original)); reversal.set("items", json.valueToTree(active));
        reverse.setCalculationSnapshot(calculation);
        return new Plan(reverse, reverseItems);
    }

    /** Local persisted facts; the caller additionally verifies independent approval and real payment/proof. */
    public static void requireOriginal(HrFinalSettlement original) {
        if (original == null || original.getTenantId() == null || original.getTenantId() <= 0
                || original.getSettlementId() == null || original.getSettlementId() <= 0 || original.getEmployeeId() == null
                || original.getEmployeeId() <= 0 || original.getLifecycleApplicationId() == null || original.getLifecycleApplicationId() <= 0
                || !"NORMAL".equals(original.getSettlementKind()) || original.getReversalOfId() != null
                || !Integer.valueOf(0).equals(original.getSupersededFlag()) || original.getVersion() == null || original.getVersion() < 0
                || !List.of("PAID", "CLOSED").contains(String.valueOf(original.getStatus())) || !"APPROVED".equals(original.getApprovalStatus())
                || original.getConfirmedBy() == null || original.getConfirmedBy() <= 0 || original.getConfirmedTime() == null || original.getPaidTime() == null
                || original.getPaidTime().isBefore(original.getConfirmedTime()) || original.getPaidTime().isAfter(HrHSupport.now())
                || original.getJoinDate() == null || original.getRelievingDate() == null || original.getJoinDate().isAfter(original.getRelievingDate())
                || original.getRuleId() == null || original.getRuleId() <= 0 || original.getWorkYears() == null
                || original.getSettlementNo() == null || original.getSettlementNo().isBlank()
                || !(original.getCalculationSnapshot() instanceof ObjectNode snapshot)) throw changed();
        JsonNode reservation = snapshot.path("reservation"), funds = snapshot.path("funds"), confirmation = snapshot.path("confirmation");
        BigDecimal net = amount(original.getNetAmount());
        String direction = net.signum() > 0 ? "PAYMENT" : net.signum() < 0 ? "RECEIPT" : "NETTING";
        if (!"POSTED".equals(reservation.path("state").asText()) || !reservation.path("sources").isObject()
                || !funds.path("eventId").isTextual() || funds.path("eventId").asText().isBlank()
                || !funds.path("eventId").equals(reservation.path("fundsEvent"))
                || !original.getPaidTime().toString().equals(reservation.path("postedTime").asText())
                || !direction.equals(funds.path("kind").asText()) || !direction.equals(confirmation.path("direction").asText())
                || !original.getConfirmedBy().toString().equals(confirmation.path("by").asText())
                || !original.getConfirmedTime().toString().equals(confirmation.path("time").asText())
                || !same(net, decimal(confirmation.path("netAmount"))) || !same(net.abs(), decimal(funds.path("amount")))) throw changed();
        if (net.signum() > 0 && (original.getPaymentRequestId() == null || original.getPaymentRequestId() <= 0
                || !original.getPaymentRequestId().toString().equals(funds.path("paymentId").asText()) || original.getSettlementProofFileId() != null)
                || net.signum() < 0 && (original.getSettlementProofFileId() == null || original.getSettlementProofFileId() <= 0
                || !original.getSettlementProofFileId().toString().equals(funds.path("proofFileId").asText()) || original.getPaymentRequestId() != null)
                || net.signum() == 0 && (original.getPaymentRequestId() != null || original.getSettlementProofFileId() != null)) throw changed();
    }

    private static BigDecimal decimal(JsonNode value) {
        try { return amount(new BigDecimal(value.asText())); } catch (NumberFormatException failure) { throw changed(); }
    }
    private static boolean validItemType(HrFinalSettlementItem item) {
        return switch (String.valueOf(item.getSourceBizType())) {
            case "HR_SALARY_SLIP" -> List.of("PAYABLE", "RECEIVABLE").contains(String.valueOf(item.getItemType()));
            case "HR_ADVANCE", "HR_TRAINING_RECOVERY" -> "RECEIVABLE".equals(item.getItemType());
            case "HR_LEAVE_QUOTA" -> "PAYABLE".equals(item.getItemType());
            case "HR_SEVERANCE" -> "SEVERANCE".equals(item.getItemType());
            case "OA_ASSET" -> "ASSET".equals(item.getItemType());
            default -> false;
        };
    }
    private static BigDecimal amount(BigDecimal value) {
        if (value == null || value.stripTrailingZeros().scale() > 2) throw changed();
        try { return HrSettlementCalculation.signedMoney(value); } catch (IllegalArgumentException failure) { throw changed(); }
    }
    private static boolean same(BigDecimal left, BigDecimal right) { return right != null && left.compareTo(amount(right)) == 0; }
    private static HrHException changed() { return conflict("SETTLEMENT_REVERSAL_SOURCE_CHANGED", "原结算、收付事实或已入账明细不一致，不能建立冲正"); }
}
