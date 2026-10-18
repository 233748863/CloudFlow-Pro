package com.cloudflow.oa.service.impl;

import com.cloudflow.oa.domain.BizPurchaseItem;
import com.cloudflow.oa.domain.BizPurchaseReceipt;
import com.cloudflow.oa.domain.OaConsumableLedger;
import com.cloudflow.oa.domain.OaConsumableRequest;
import com.cloudflow.oa.domain.OaConsumableRequestItem;
import com.cloudflow.oa.domain.SysAssetLog;
import com.cloudflow.oa.domain.SysConsumable;
import com.cloudflow.oa.mapper.BizPurchaseItemMapper;
import com.cloudflow.oa.mapper.BizPurchaseReceiptMapper;
import com.cloudflow.oa.mapper.OaConsumableLedgerMapper;
import com.cloudflow.oa.mapper.OaConsumableMaintenanceMapper;
import com.cloudflow.oa.mapper.OaConsumableRequestItemMapper;
import com.cloudflow.oa.mapper.SysAssetLogMapper;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import java.math.BigDecimal;
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

@Component
@RequiredArgsConstructor
public class ConsumableLedgerVerifier {
    private final OaConsumableLedgerMapper ledgers;
    private final SysAssetLogMapper logs;
    private final BizPurchaseItemMapper purchaseItems;
    private final BizPurchaseReceiptMapper receipts;
    private final OaConsumableRequestItemMapper requestItems;
    private final OaConsumableMaintenanceMapper maintenance;
    private final ConsumableRequestAccess access;
    private final ConsumableLedgerService ledgerService;

    public record Proof(int quantity, BigDecimal amount, BigDecimal average, BigDecimal lastPurchasePrice) { }
    private record Allocation(int quantity, BigDecimal amount) { }

    public Proof verify(SysConsumable material) {
        ConsumableCostCalculator.Balance balance = new ConsumableCostCalculator.Balance(0, ConsumableCostCalculator.ZERO, ConsumableCostCalculator.ZERO);
        Map<Long, Allocation> purchaseTotals = new HashMap<>();
        Map<Long, Allocation> returnTotals = new HashMap<>();
        OaConsumableLedger previous = null;
        long afterId = 0;
        while (true) {
            List<OaConsumableLedger> rows = ledgers.chain(material.getTenantId(), material.getConsumableId(), afterId);
            if (rows.isEmpty()) break;
            for (OaConsumableLedger row : rows) {
                if (!Objects.equals(material.getTenantId(), row.getTenantId()) || !Objects.equals(material.getConsumableId(), row.getConsumableId())
                        || !Objects.equals(material.getUnit(), row.getUnit()) || row.getLedgerId() <= afterId || row.getOperationLineNo() < 1
                        || row.getOperationHash() == null || !row.getOperationHash().matches("[a-f0-9]{64}")) invalid("台账标识、单位或幂等摘要无效");
                ConsumableOperationSupport.key(row.getOperationKey());
                ConsumableCostCalculator.price(row.getUnitPrice());
                verifyLog(row);
                boolean reversal = row.getReversalOfLedgerId() != null;
                if (reversal) verifyReversal(row, previous);
                else verifyNormal(row, balance, returnTotals);
                verifySource(row, purchaseTotals);
                if ("RETURN".equals(row.getTransactionType())) {
                    Allocation returned = returnTotals.getOrDefault(row.getSourceLedgerId(), new Allocation(0, ConsumableCostCalculator.ZERO));
                    returnTotals.put(row.getSourceLedgerId(), new Allocation(ConsumableCostCalculator.cumulative(returned.quantity(), row.getQuantity()),
                            ConsumableCostCalculator.price(returned.amount().add(row.getAmount()))));
                }
                balance = ConsumableCostCalculator.apply(balance.quantity(), balance.amount(), row.getQuantity(), row.getAmount());
                if (balance.quantity() != row.getBalanceAfter() || balance.amount().compareTo(row.getBalanceAmountAfter()) != 0
                        || balance.average().compareTo(row.getAvgCostAfter()) != 0) invalid("台账数量、金额或均价前缀不一致，流水" + row.getLedgerId());
                previous = row;
                afterId = row.getLedgerId();
            }
        }
        if (maintenance.sourceDrift(material.getTenantId(), material.getConsumableId()) != 0) invalid("采购、领用累计或原日志存在未对齐记录");
        return new Proof(balance.quantity(), balance.amount(), balance.average(), ledgers.lastPurchasePrice(material.getTenantId(), material.getConsumableId()));
    }

    private void verifyLog(OaConsumableLedger row) {
        SysAssetLog log = OaRecordSupport.active(logs.selectById(row.getAssetLogId()));
        if (!"2".equals(log.getRefType()) || !Objects.equals(log.getRefId(), row.getConsumableId())
                || !Objects.equals(log.getQuantityChange(), row.getQuantity()) || !Objects.equals(log.getOperatorId(), row.getOperatorId())
                || !Objects.equals(log.getTargetId(), row.getBeneficiaryId())) invalid("原通用日志与台账不一致");
    }

    private void verifyReversal(OaConsumableLedger row, OaConsumableLedger original) {
        if (original == null || !Objects.equals(row.getReversalOfLedgerId(), original.getLedgerId()) || original.getReversalOfLedgerId() != null
                || (long) row.getQuantity() != -(long) original.getQuantity() || row.getAmount().compareTo(original.getAmount().negate()) != 0
                || row.getUnitPrice().compareTo(original.getUnitPrice()) != 0 || !Objects.equals(row.getTransactionType(), original.getTransactionType())
                || !Objects.equals(row.getSourceBizType(), original.getSourceBizType()) || !Objects.equals(row.getSourceBizId(), original.getSourceBizId())
                || !Objects.equals(row.getSourceItemId(), original.getSourceItemId()) || !Objects.equals(row.getSourceLedgerId(), original.getSourceLedgerId())
                || !Objects.equals(row.getBeneficiaryId(), original.getBeneficiaryId()) || !Objects.equals(row.getDeptId(), original.getDeptId())
                || !ledgers.returns(row.getTenantId(), original.getLedgerId()).isEmpty()) invalid("整笔冲正关系不合法");
        if (!Objects.equals(row.getSourceEventKey(), "REVERSE:" + original.getLedgerId())) invalid("冲正来源事件键不一致");
    }

    private void verifyNormal(OaConsumableLedger row, ConsumableCostCalculator.Balance before, Map<Long, Allocation> returned) {
        if (!Set.of("INBOUND", "OUTBOUND", "ADJUST", "SCRAP", "RETURN").contains(row.getTransactionType())) invalid("未知交易类型");
        if (!"RETURN".equals(row.getTransactionType()) && row.getSourceLedgerId() != null) invalid("非退回流水不能携带原发料引用");
        BigDecimal expected = null;
        if ("RETURN".equals(row.getTransactionType())) {
            if (row.getQuantity() <= 0 || row.getSourceLedgerId() == null) invalid("正常退回方向或原发料引用无效");
            OaConsumableLedger source = ledgerService.ledger(row.getSourceLedgerId());
            if (source.getLedgerId() >= row.getLedgerId() || !"OUTBOUND".equals(source.getTransactionType()) || source.getQuantity() >= 0
                    || source.getReversalOfLedgerId() != null || !Objects.equals(source.getConsumableId(), row.getConsumableId())
                    || !Objects.equals(source.getSourceBizId(), row.getSourceBizId()) || !Objects.equals(source.getSourceItemId(), row.getSourceItemId())
                    || ledgers.reversal(row.getTenantId(), source.getLedgerId()) != null) invalid("正常退回来源不合法");
            ConsumableLedgerVerifier.Allocation accumulated = returned.getOrDefault(source.getLedgerId(), new Allocation(0, ConsumableCostCalculator.ZERO));
            expected = ConsumableCostCalculator.allocate(source.getAmount().negate(), -source.getQuantity(),
                    ConsumableCostCalculator.cumulative(accumulated.quantity(), row.getQuantity()), accumulated.amount());
            if (row.getUnitPrice().compareTo(source.getUnitPrice()) != 0) invalid("退回单价未沿用原发料");
        } else if (row.getQuantity() < 0) {
            if (!Set.of("OUTBOUND", "ADJUST", "SCRAP").contains(row.getTransactionType())) invalid("出库方向无效");
            expected = ConsumableCostCalculator.outbound(before.quantity(), before.amount(), Math.negateExact(row.getQuantity())).negate();
            if (row.getUnitPrice().compareTo(before.average()) != 0) invalid("出库计价快照不一致");
        } else {
            if (!Set.of("INBOUND", "ADJUST").contains(row.getTransactionType())) invalid("入库方向无效");
            if ("MANUAL".equals(row.getSourceBizType())) expected = ConsumableCostCalculator.price(row.getUnitPrice().multiply(BigDecimal.valueOf(row.getQuantity())));
        }
        if (expected != null && expected.compareTo(row.getAmount()) != 0) invalid("台账成本分摊不一致");
    }

    private void verifySource(OaConsumableLedger row, Map<Long, Allocation> purchases) {
        if ("PURCHASE_RECEIPT".equals(row.getSourceBizType())) {
            if (!"INBOUND".equals(row.getTransactionType())) invalid("采购来源类型无效");
            BizPurchaseReceipt receipt = OaRecordSupport.active(receipts.selectById(row.getSourceBizId()));
            BizPurchaseItem item = OaRecordSupport.active(purchaseItems.selectById(row.getSourceItemId()));
            if (!Objects.equals(receipt.getItemId(), item.getId()) || !Objects.equals(receipt.getPurchaseId(), item.getPurchaseId())
                    || !Objects.equals(receipt.getConsumableId(), row.getConsumableId())
                    || !Objects.equals(item.getConsumableId(), row.getConsumableId()) || !Objects.equals(item.getUnit(), row.getUnit())
                    || receipt.getReceivedQuantity().longValue() != Math.abs((long) row.getQuantity())) invalid("采购收货来源不一致");
            ConsumableLedgerVerifier.Allocation accumulated = purchases.getOrDefault(item.getId(), new Allocation(0, ConsumableCostCalculator.ZERO));
            int quantity = ConsumableCostCalculator.cumulative(accumulated.quantity(), row.getQuantity());
            if (row.getReversalOfLedgerId() == null) {
                BigDecimal expected = ConsumableCostCalculator.allocate(item.getAmount(), item.getQuantity(), quantity, accumulated.amount());
                if (expected.compareTo(row.getAmount()) != 0 || row.getUnitPrice().compareTo(ConsumableCostCalculator.average(item.getQuantity(), item.getAmount())) != 0
                        || !Objects.equals(row.getSourceEventKey(), "PURCHASE_RECEIPT:" + receipt.getId())) invalid("采购累计成本或来源事件不一致");
            }
            purchases.put(item.getId(), new Allocation(quantity, ConsumableCostCalculator.price(accumulated.amount().add(row.getAmount()))));
        } else if ("CONSUMABLE_REQUEST".equals(row.getSourceBizType())) {
            if (!Set.of("OUTBOUND", "RETURN").contains(row.getTransactionType())) invalid("领用来源类型无效");
            OaConsumableRequestItem item = OaRecordSupport.active(requestItems.selectById(row.getSourceItemId()));
            OaConsumableRequest request = access.get(row.getSourceBizId());
            if (!Objects.equals(item.getRequestId(), request.getRequestId()) || !Objects.equals(item.getConsumableId(), row.getConsumableId())
                    || !Objects.equals(item.getUnit(), row.getUnit()) || !Objects.equals(request.getApplicantId(), row.getBeneficiaryId())
                    || !Objects.equals(request.getDeptId(), row.getDeptId())) invalid("领用申请、人员或部门来源不一致");
            if (row.getReversalOfLedgerId() == null) {
                String event = "RETURN".equals(row.getTransactionType()) ? "RETURN:" + row.getSourceLedgerId() + ":" + row.getOperationKey()
                        : "CONSUMABLE_REQUEST:" + request.getRequestId() + ":" + item.getItemId() + ":" + row.getOperationKey();
                if (!event.equals(row.getSourceEventKey())) invalid("领用或退回来源事件键不一致");
            }
        } else if (!"MANUAL".equals(row.getSourceBizType()) || row.getSourceBizId() != null || row.getSourceItemId() != null
                || Set.of("OUTBOUND", "RETURN").contains(row.getTransactionType()) || row.getBeneficiaryId() != null) invalid("手工来源伪装了业务单据");
        else if (row.getReversalOfLedgerId() == null && !Objects.equals(row.getSourceEventKey(), "MANUAL:" + row.getOperationKey() + ":" + row.getOperationLineNo())
                && !("INBOUND".equals(row.getTransactionType()) && row.getOperationLineNo() == 1
                && Objects.equals(row.getSourceEventKey(), "SEED:OA08:" + row.getConsumableId() + ":OPENING"))) invalid("手工入库来源事件键不一致");
    }

    private static void invalid(String reason) { throw new IllegalStateException("LEDGER_CHAIN_INVALID: " + reason); }
}
