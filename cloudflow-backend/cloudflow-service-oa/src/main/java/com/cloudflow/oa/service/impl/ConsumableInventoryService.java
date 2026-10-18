package com.cloudflow.oa.service.impl;

import cn.dev33.satoken.stp.StpUtil;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.oa.domain.OaConsumableLedger;
import com.cloudflow.oa.domain.SysConsumable;
import com.cloudflow.oa.domain.dto.ConsumableCommands;
import com.cloudflow.oa.domain.dto.ConsumableStockDTO;
import com.cloudflow.oa.domain.vo.ConsumableResults;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import java.math.BigDecimal;
import java.util.List;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class ConsumableInventoryService {
    private final ConsumableLedgerService ledger;
    private final ConsumableTransactions transactions;
    private final ConsumableOperationSupport operations;
    private final ConsumableDispatchService dispatch;
    private final ConsumablePurchaseService purchases;

    @Audit(name = "耗材手工入库", highRisk = true)
    public ConsumableResults.StockPosting inbound(Long id, ConsumableCommands.Stock command) {
        return manual(id, command, "INBOUND", true, "MANUAL_INBOUND");
    }

    @Audit(name = "耗材原出库入口", highRisk = true)
    public Object reduce(Long id, ConsumableStockDTO command) {
        if (command.getUnitPrice() != null) throw new IllegalArgumentException("出库成本由服务端计算");
        if ("LOSS".equals(command.getStockOutType())) {
            if (command.getRequestId() != null || command.getItemId() != null || command.getRequestVersion() != null) {
                throw new IllegalArgumentException("盘亏不接收领用来源字段");
            }
            return manual(id, command, "ADJUST", false, "LEGACY_LOSS");
        }
        if (!"ISSUE".equals(command.getStockOutType()) || command.getRequestId() == null || command.getItemId() == null
                || command.getRequestVersion() == null) throw new IllegalArgumentException("领用出库必须关联已批准申请、明细及当前版本");
        ConsumableCommands.Issue issue = new ConsumableCommands.Issue();
        issue.setOperationKey(command.getOperationKey());
        issue.setRemark(command.getRemark());
        issue.setVersion(command.getRequestVersion());
        issue.setAllowPartial(false);
        ConsumableCommands.IssueLine line = new ConsumableCommands.IssueLine();
        line.setItemId(command.getItemId());
        line.setQuantity(command.getQuantity());
        issue.setItems(List.of(line));
        return dispatch.issue(command.getRequestId(), issue, id);
    }

    @Audit(name = "耗材盘盈盘亏调整", highRisk = true)
    public ConsumableResults.StockPosting adjust(Long id, ConsumableCommands.Adjustment command) {
        if (!Set.of("IN", "OUT").contains(command.getDirection())) throw new IllegalArgumentException("调整方向须为IN或OUT");
        return manual(id, command, "ADJUST", "IN".equals(command.getDirection()), "ADJUST:" + command.getDirection());
    }

    @Audit(name = "耗材报废", highRisk = true)
    public ConsumableResults.StockPosting scrap(Long id, ConsumableCommands.Stock command) {
        return manual(id, command, "SCRAP", false, "SCRAP");
    }

    @Audit(name = "耗材领用退回", highRisk = true)
    public ConsumableResults.StockPosting returnStock(Long id, ConsumableCommands.ReturnStock command) {
        return dispatch.returnStock(id, command);
    }

    @Audit(name = "耗材台账整笔冲正", highRisk = true)
    public ConsumableResults.StockPosting reverse(Long id, ConsumableCommands.Reverse command) {
        StpUtil.checkPermission("oa:consumable-ledger:reverse");
        ConsumableOperationSupport.operation(command);
        OaConsumableLedger original = ledger.ledger(id);
        String hash = operations.hash("REVERSE", id, command);
        if ("PURCHASE_RECEIPT".equals(original.getSourceBizType())) return purchases.reverse(original, command, hash);
        if ("CONSUMABLE_REQUEST".equals(original.getSourceBizType())) return dispatch.reverse(original, command, hash);
        if (!"MANUAL".equals(original.getSourceBizType())) throw new IllegalArgumentException("台账来源无效");
        List<OaConsumableLedger> existing = ledger.existing(command.getOperationKey(), hash);
        if (!existing.isEmpty()) return ledger.result(command.getOperationKey(), existing, true, null);
        try {
            return transactions.execute(() -> {
                SysConsumable material = ledger.lockAll(List.of(original.getConsumableId())).get(original.getConsumableId());
                List<OaConsumableLedger> duplicate = ledger.existing(command.getOperationKey(), hash);
                if (!duplicate.isEmpty()) return ledger.result(command.getOperationKey(), duplicate, true, null);
                OaConsumableLedger posted = ledger.reverse(material, original, command.getOperationKey(), hash, command.getRemark());
                return ledger.result(command.getOperationKey(), List.of(posted), false, null);
            });
        } catch (DuplicateKeyException exception) {
            List<OaConsumableLedger> rows = ledger.existing(command.getOperationKey(), hash);
            if (rows.isEmpty()) throw exception;
            return ledger.result(command.getOperationKey(), rows, true, null);
        }
    }

    private ConsumableResults.StockPosting manual(Long id, ConsumableCommands.Stock command, String type, boolean incoming, String entry) {
        ConsumableOperationSupport.operation(command);
        int quantity = ConsumableCostCalculator.positive(command.getQuantity());
        if (incoming) ConsumableCostCalculator.price(command.getUnitPrice());
        else if (command.getUnitPrice() != null) throw new IllegalArgumentException("出库成本由服务端计算，不接收指定单价");
        ledger.material(id);
        String hash = operations.hash(entry, id, command);
        List<OaConsumableLedger> existing = ledger.existing(command.getOperationKey(), hash);
        if (!existing.isEmpty()) return ledger.result(command.getOperationKey(), existing, true, null);
        try {
            return transactions.execute(() -> {
                SysConsumable material = ledger.lockAll(List.of(id)).get(id);
                List<OaConsumableLedger> duplicate = ledger.existing(command.getOperationKey(), hash);
                if (!duplicate.isEmpty()) return ledger.result(command.getOperationKey(), duplicate, true, null);
                if (incoming && !"ACTIVE".equals(material.getStatus())) throw new IllegalArgumentException("停用耗材不能手工新增入库");
                BigDecimal cost = incoming ? ConsumableCostCalculator.price(command.getUnitPrice().multiply(BigDecimal.valueOf(quantity)))
                        : ConsumableCostCalculator.outbound(material.getQuantity(), material.getStockAmount(), quantity).negate();
                OaConsumableLedger posted = ledger.post(material, ConsumableLedgerService.Posting.builder().operationKey(command.getOperationKey())
                        .hash(hash).lineNo(1).transactionType(type).quantity(incoming ? quantity : -quantity)
                        .unitPrice(incoming ? command.getUnitPrice() : material.getAvgCost()).amount(cost).sourceType("MANUAL")
                        .sourceEventKey("MANUAL:" + command.getOperationKey() + ":1").remark(command.getRemark()).build());
                return ledger.result(command.getOperationKey(), List.of(posted), false, null);
            });
        } catch (DuplicateKeyException exception) {
            List<OaConsumableLedger> rows = ledger.existing(command.getOperationKey(), hash);
            if (rows.isEmpty()) throw exception;
            return ledger.result(command.getOperationKey(), rows, true, null);
        }
    }
}
