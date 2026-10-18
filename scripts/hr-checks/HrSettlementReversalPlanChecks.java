package com.cloudflow.hr.checks;

import com.cloudflow.hr.domain.entity.HrFinalSettlement;
import com.cloudflow.hr.domain.entity.HrFinalSettlementItem;
import com.cloudflow.hr.service.HrHException;
import com.cloudflow.hr.service.HrHSupport;
import com.cloudflow.hr.service.HrSettlementReversalPlan;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.function.Consumer;

/** Monetary inversion and tamper rejection; no database, authorization, approval or actual money is simulated as passed. */
public final class HrSettlementReversalPlanChecks {
    private static final ObjectMapper JSON = new ObjectMapper().findAndRegisterModules();
    private static int checks;

    public static void main(String[] arguments) {
        for (String net : List.of("300.01", "0.00", "-300.01")) {
            Fixture fixture = fixture(net);
            ObjectNode original = JSON.valueToTree(fixture.original());
            String originalItems = JSON.valueToTree(fixture.items()).toString();
            HrSettlementReversalPlan.Plan plan = HrSettlementReversalPlan.create(fixture.original(), fixture.items(), "  退回原结算并重新核定  ", JSON);
            equal("REVERSAL", plan.settlement().getSettlementKind(), "explicit reverse kind");
            equal(fixture.original().getSettlementId(), plan.settlement().getReversalOfId(), "linked original");
            equal(fixture.original().getNetAmount().negate(), plan.settlement().getNetAmount(), "net is exact negative without recalculation");
            equal(fixture.original().getTotalPayable().negate(), plan.settlement().getTotalPayable(), "payable exact negative");
            equal(fixture.original().getTotalReceivable().negate(), plan.settlement().getTotalReceivable(), "receivable exact negative");
            equal("DRAFT", plan.settlement().getStatus(), "draft does not recognize money");
            equal("DRAFT", plan.settlement().getApprovalStatus(), "independent approval required");
            equal(null, plan.settlement().getPaidTime(), "no invented actual payment");
            equal(null, plan.settlement().getPaymentRequestId(), "no copied payment binding");
            equal(null, plan.settlement().getSettlementProofFileId(), "no copied receipt proof");
            equal(null, plan.settlement().getConfirmedTime(), "no copied confirmation");
            equal(null, plan.settlement().getInstanceId(), "no copied approval instance");
            equal("退回原结算并重新核定", plan.settlement().getRemark(), "business reason retained");
            equal(2, plan.items().size(), "inactive unposted history omitted");
            for (int index = 0; index < 2; index++) {
                HrFinalSettlementItem source = fixture.items().get(index), reverse = plan.items().get(index);
                equal(source.getAmount().negate(), reverse.getAmount(), "item uses original posted cents");
                equal(source.getItemId().toString(), reverse.getSourceSnapshot().path("reversalOfItemId").asText(), "item linked to original row");
                equal(0, reverse.getSourcePostedFlag(), "reverse source not posted");
                equal(null, reverse.getItemId(), "no copied primary identifier");
                equal(null, reverse.getSettlementId(), "new parent must be assigned after persistence");
            }
            equal(original, JSON.valueToTree(fixture.original()), "original header unchanged");
            equal(originalItems, JSON.valueToTree(fixture.items()).toString(), "original details unchanged");
            ((ObjectNode) plan.items().get(0).getSourceSnapshot()).put("changed", true);
            ((ObjectNode) plan.settlement().getCalculationSnapshot().path("reversal").path("original")).put("changed", true);
            equal(original, JSON.valueToTree(fixture.original()), "header copy does not alias original");
            equal(originalItems, JSON.valueToTree(fixture.items()).toString(), "detail copy does not alias original");
        }
        reject(f -> f.original().setStatus("CONFIRMED"), "unpaid original rejected");
        reject(f -> f.original().setApprovalStatus("SUBMITTED"), "unapproved original rejected");
        reject(f -> f.original().setSettlementKind("REVERSAL"), "reversal of reversal rejected");
        reject(f -> f.original().setSupersededFlag(1), "already reversed original rejected");
        reject(f -> f.original().setPaidTime(null), "missing money fact rejected");
        reject(f -> f.original().setPaidTime(HrHSupport.now().plusDays(1)), "future money rejected");
        reject(f -> f.original().setPaidTime(f.original().getConfirmedTime().minusSeconds(1)), "payment before confirmation rejected");
        reject(f -> f.original().setNetAmount(new BigDecimal("300.011")), "fractional cent not silently rounded");
        reject(f -> f.original().setTotalPayable(new BigDecimal("9999999999999.99")), "amount capacity checked");
        reject(f -> f.original().setTotalPayable(new BigDecimal("301.01")), "header and details reconcile");
        reject(f -> f.original().setPaymentRequestId(45L), "foreign payment binding rejected");
        reject(f -> f.original().setSettlementProofFileId(99L), "mixed directions rejected");
        reject(f -> ((ObjectNode) f.original().getCalculationSnapshot().path("funds")).put("eventId", "changed"), "source and money events agree");
        reject(f -> ((ObjectNode) f.original().getCalculationSnapshot().path("funds")).put("amount", "300.00"), "original money amount exact");
        reject(f -> f.items().get(0).setTenantId(100001L), "cross-tenant detail rejected");
        reject(f -> f.items().get(0).setSettlementId(2L), "foreign parent rejected");
        reject(f -> f.items().get(0).setSourcePostedFlag(0), "unposted detail rejected");
        reject(f -> f.items().get(0).setConfirmedFlag(0), "unconfirmed detail rejected");
        reject(f -> f.items().get(0).setAmount(new BigDecimal("-300.01")), "negative normal source rejected");
        reject(f -> f.items().get(0).setAmount(new BigDecimal("300.011")), "item precision preserved");
        reject(f -> f.items().get(0).setSourceBizType("UNSUPPORTED"), "unknown source rejected");
        reject(f -> f.items().get(0).setSourceBizType("HR_ADVANCE"), "source category cannot become payable");
        reject(f -> f.items().get(1).setItemId(11L), "duplicate item rejected");
        reject(f -> { f.items().get(1).setSourceBizType("HR_SALARY_SLIP"); f.items().get(1).setSourceBizId("100"); }, "duplicate source rejected");
        reject(f -> f.items().get(2).setSourcePostedFlag(1), "inactive posted source cannot disappear");
        Fixture valid = fixture("300.01");
        expectRejected(() -> HrSettlementReversalPlan.create(valid.original(), valid.items(), " ", JSON), "reason required");
        expectRejected(() -> HrSettlementReversalPlan.create(valid.original(), valid.items(), "原".repeat(501), JSON), "reason capacity checked");
        equal(500, HrSettlementReversalPlan.create(valid.original(), valid.items(), "原".repeat(500), JSON).settlement().getRemark().length(), "full permitted reason retained");
        System.out.println("H2_SETTLEMENT_REVERSAL_PLAN: checks=" + checks + "; failed=0; three_directions=true; original_amounts_preserved=true; actual_plan=true; database=false; http=false; reverse_funds=false; source_posting=false");
    }

    private static Fixture fixture(String netText) {
        BigDecimal net = new BigDecimal(netText), payable = net.signum() > 0 ? net : new BigDecimal("0.00"), receivable = net.signum() < 0 ? net.negate() : new BigDecimal("0.00");
        LocalDateTime confirmed = HrHSupport.now().minusMinutes(2).withNano(0), paid = confirmed.plusMinutes(1);
        HrFinalSettlement record = new HrFinalSettlement(); record.setTenantId(100000L); record.setSettlementId(1L); record.setSettlementNo("REVERSAL_SOURCE");
        record.setEmployeeId(2L); record.setLifecycleApplicationId(3L); record.setSettlementKind("NORMAL"); record.setSupersededFlag(0);
        record.setStatus("PAID"); record.setApprovalStatus("APPROVED"); record.setConfirmedBy(4L); record.setConfirmedTime(confirmed); record.setPaidTime(paid); record.setVersion(7);
        record.setJoinDate(LocalDate.of(2026,1,1)); record.setRelievingDate(LocalDate.of(2026,9,30)); record.setRuleId(5L); record.setWorkYears(new BigDecimal("0.75"));
        record.setTotalPayable(payable); record.setTotalReceivable(receivable); record.setAssetRecoveryCost(new BigDecimal("0.00")); record.setSeveranceAmount(new BigDecimal("0.00")); record.setNetAmount(net);
        String direction = net.signum() > 0 ? "PAYMENT" : net.signum() < 0 ? "RECEIPT" : "NETTING";
        ObjectNode snapshot = JSON.createObjectNode(); snapshot.putObject("rounding").put("mode", "HALF_UP");
        snapshot.putObject("confirmation").put("by", "4").put("time", confirmed.toString()).put("netAmount", net.toPlainString()).put("direction", direction);
        ObjectNode funds = snapshot.putObject("funds").put("kind", direction).put("eventId", "original-event").put("amount", net.abs().toPlainString());
        if (net.signum() > 0) { record.setPaymentRequestId(44L); funds.put("paymentId", "44"); }
        if (net.signum() < 0) { record.setSettlementProofFileId(55L); funds.put("proofFileId", "55"); }
        snapshot.putObject("reservation").put("state", "POSTED").put("fundsEvent", "original-event").put("postedTime", paid.toString()).putObject("sources"); record.setCalculationSnapshot(snapshot);
        List<HrFinalSettlementItem> items = new ArrayList<>(); items.add(item(11L,"PAYABLE","HR_SALARY_SLIP","100",payable)); items.add(item(12L,"RECEIVABLE","HR_ADVANCE","200",receivable));
        HrFinalSettlementItem inactive = item(13L,"PAYABLE","HR_SALARY_SLIP","300",new BigDecimal("99.00")); ((ObjectNode)inactive.getSourceSnapshot()).put("active",false); inactive.setSourcePostedFlag(0); items.add(inactive);
        return new Fixture(record, items);
    }
    private static HrFinalSettlementItem item(Long id, String kind, String source, String sourceId, BigDecimal amount) {
        HrFinalSettlementItem item = new HrFinalSettlementItem(); item.setItemId(id); item.setTenantId(100000L); item.setSettlementId(1L);
        item.setItemType(kind); item.setItemName("原核定金额"); item.setSourceBizType(source); item.setSourceBizId(sourceId); item.setSourceSnapshot(JSON.createObjectNode().put("active",true));
        item.setAmount(amount); item.setConfirmedFlag(1); item.setSourcePostedFlag(1); return item;
    }
    private record Fixture(HrFinalSettlement original, List<HrFinalSettlementItem> items) { }
    private static void reject(Consumer<Fixture> mutation, String label) { Fixture value=fixture("300.01"); mutation.accept(value); expectRejected(() -> HrSettlementReversalPlan.create(value.original(),value.items(),"核定更正",JSON),label); }
    private static void expectRejected(Runnable action,String label) { boolean rejected=false; try { action.run(); } catch (HrHException expected) { rejected=true; } equal(true,rejected,label); }
    private static void equal(Object expected,Object actual,String label) { if(!Objects.equals(expected,actual)) throw new AssertionError(label+": expected="+expected+", actual="+actual); checks++; }
}
