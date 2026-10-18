package com.cloudflow.oa.service.impl;

import cn.dev33.satoken.stp.StpUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.oa.domain.OaConsumableLedger;
import com.cloudflow.oa.domain.SysAssetLog;
import com.cloudflow.oa.domain.SysConsumable;
import com.cloudflow.oa.domain.vo.ConsumableResults;
import com.cloudflow.oa.domain.vo.OaIdentityReference;
import com.cloudflow.oa.mapper.OaConsumableLedgerMapper;
import com.cloudflow.oa.mapper.OaIdentityReferenceMapper;
import com.cloudflow.oa.mapper.SysAssetLogMapper;
import com.cloudflow.oa.mapper.SysConsumableMapper;
import lombok.Builder;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class ConsumableLedgerService {
    private final SysConsumableMapper materials;
    private final OaConsumableLedgerMapper ledgers;
    private final SysAssetLogMapper logs;
    private final OaIdentityReferenceMapper identities;

    @Builder(toBuilder = true)
    public record Posting(String operationKey, String hash, int lineNo, String transactionType, int quantity,
            BigDecimal unitPrice, BigDecimal amount, String sourceType, Long sourceId, Long sourceItemId,
            String sourceEventKey, Long sourceLedgerId, Long reversalOfLedgerId,
            Long beneficiaryId, String beneficiaryName, Long deptId, String deptName, String remark) { }

    public SysConsumable material(Long id) {
        OaRecordSupport.require(id, "耗材ID不能为空");
        return OaRecordSupport.active(materials.selectOne(new LambdaQueryWrapper<SysConsumable>()
                .eq(SysConsumable::getTenantId, OaRecordSupport.tenantId()).eq(SysConsumable::getConsumableId, id)
                .eq(SysConsumable::getDeleted, 0)));
    }

    public OaConsumableLedger ledger(Long id) {
        OaRecordSupport.require(id, "台账ID不能为空");
        return OaRecordSupport.active(ledgers.selectOne(new LambdaQueryWrapper<OaConsumableLedger>()
                .eq(OaConsumableLedger::getTenantId, OaRecordSupport.tenantId()).eq(OaConsumableLedger::getLedgerId, id)));
    }

    public Map<Long, SysConsumable> lockAll(Collection<Long> ids) {
        if (!TransactionSynchronizationManager.isActualTransactionActive()) throw new IllegalStateException("耗材锁必须位于业务事务内");
        if (ids == null || ids.isEmpty() || ids.size() > 100 || ids.stream().anyMatch(Objects::isNull)) {
            throw new IllegalArgumentException("耗材明细须为1至100行");
        }
        Map<Long, SysConsumable> locked = new LinkedHashMap<>();
        ids.stream().distinct().sorted().forEach(id -> locked.put(id,
                OaRecordSupport.active(materials.selectForUpdate(OaRecordSupport.tenantId(), id))));
        return locked;
    }

    public void assertTail(SysConsumable material) {
        OaConsumableLedger tail = ledgers.tail(OaRecordSupport.tenantId(), material.getConsumableId());
        int quantity = tail == null ? 0 : tail.getBalanceAfter();
        BigDecimal amount = tail == null ? ConsumableCostCalculator.ZERO : tail.getBalanceAmountAfter();
        BigDecimal average = ConsumableCostCalculator.average(quantity, amount);
        if (!Objects.equals(material.getQuantity(), quantity) || material.getStockAmount() == null
                || material.getAvgCost() == null || material.getStockAmount().compareTo(amount) != 0
                || material.getAvgCost().compareTo(average) != 0
                || tail != null && tail.getAvgCostAfter().compareTo(average) != 0
                || quantity == 0 && amount.signum() != 0) {
            throw new IllegalStateException("LEDGER_INCONSISTENT: 库存缓存与台账不一致，请先核对");
        }
    }

    public List<OaConsumableLedger> existing(String key, String hash) {
        List<OaConsumableLedger> rows = ledgers.operation(OaRecordSupport.tenantId(), ConsumableOperationSupport.key(key));
        rows.forEach(row -> ConsumableOperationSupport.sameHash(row.getOperationHash(), hash));
        return rows;
    }

    public OaConsumableLedger post(SysConsumable material, Posting command) {
        if (!TransactionSynchronizationManager.isActualTransactionActive()) throw new IllegalStateException("库存记账必须加入来源事务");
        OaRecordSupport.active(material);
        ConsumableOperationSupport.key(command.operationKey());
        OaRecordSupport.text(command.remark(), 255, "记账原因");
        if (command.hash() == null || !command.hash().matches("[a-f0-9]{64}") || command.lineNo() < 1
                || !Set.of("INBOUND", "OUTBOUND", "ADJUST", "SCRAP", "RETURN").contains(command.transactionType())
                || !Set.of("PURCHASE_RECEIPT", "CONSUMABLE_REQUEST", "MANUAL").contains(command.sourceType())) {
            throw new IllegalArgumentException("台账来源或记账参数无效");
        }
        boolean requestMovement = Set.of("OUTBOUND", "RETURN").contains(command.transactionType());
        if (requestMovement != "CONSUMABLE_REQUEST".equals(command.sourceType())
                || "PURCHASE_RECEIPT".equals(command.sourceType()) && !"INBOUND".equals(command.transactionType())
                || !"MANUAL".equals(command.sourceType()) && (command.sourceId() == null || command.sourceItemId() == null)
                || requestMovement && command.beneficiaryId() == null) throw new IllegalArgumentException("业务来源不可伪装");
        if (command.reversalOfLedgerId() == null && (!"ADJUST".equals(command.transactionType())
                && (Set.of("INBOUND", "RETURN").contains(command.transactionType()) != (command.quantity() > 0)))) {
            throw new IllegalArgumentException("台账类型与数量方向不一致");
        }
        assertTail(material);
        ConsumableCostCalculator.price(command.unitPrice());
        ConsumableCostCalculator.Balance next = ConsumableCostCalculator.apply(material.getQuantity(), material.getStockAmount(), command.quantity(), command.amount());
        OaIdentityReference operator = OaRecordSupport.active(identities.user(ConsumableOperationSupport.userId(), OaRecordSupport.tenantId()));
        LocalDateTime now = LocalDateTime.now();
        SysAssetLog log = new SysAssetLog();
        log.setTenantId(material.getTenantId());
        log.setRefType("2");
        log.setRefId(material.getConsumableId());
        log.setType(label(command));
        log.setQuantityChange(command.quantity());
        log.setOperatorId(operator.getId());
        log.setTargetId(command.beneficiaryId());
        log.setRemark(command.remark());
        log.setCreateTime(now);
        OaRecordSupport.saved(logs.insert(log));
        OaConsumableLedger ledger = new OaConsumableLedger();
        ledger.setTenantId(material.getTenantId());
        ledger.setConsumableId(material.getConsumableId());
        ledger.setConsumableName(material.getName());
        ledger.setModel(material.getModel());
        ledger.setUnit(material.getUnit());
        ledger.setStorageLocation(material.getStorageLocation());
        ledger.setTransactionType(command.transactionType());
        ledger.setQuantity(command.quantity());
        ledger.setBalanceAfter(next.quantity());
        ledger.setUnitPrice(command.unitPrice());
        ledger.setAmount(command.amount());
        ledger.setBalanceAmountAfter(next.amount());
        ledger.setAvgCostAfter(next.average());
        ledger.setSourceBizType(command.sourceType());
        ledger.setSourceBizId(command.sourceId());
        ledger.setSourceItemId(command.sourceItemId());
        ledger.setSourceEventKey(OaRecordSupport.text(command.sourceEventKey(), 160, "来源事件键"));
        ledger.setOperationKey(command.operationKey());
        ledger.setOperationHash(command.hash());
        ledger.setOperationLineNo(command.lineNo());
        ledger.setSourceLedgerId(command.sourceLedgerId());
        ledger.setReversalOfLedgerId(command.reversalOfLedgerId());
        ledger.setAssetLogId(OaRecordSupport.require(log.getLogId(), "原日志ID未生成"));
        ledger.setBeneficiaryId(command.beneficiaryId());
        ledger.setBeneficiaryName(command.beneficiaryName());
        ledger.setDeptId(command.deptId());
        ledger.setDeptName(command.deptName());
        ledger.setOperatorId(operator.getId());
        ledger.setOperatorName(operator.getName());
        ledger.setOperateTime(now);
        ledger.setRemark(command.remark());
        ledger.setCreateBy(OaRecordSupport.userName());
        ledger.setCreateTime(now);
        OaRecordSupport.saved(ledgers.insert(ledger));
        material.setQuantity(next.quantity());
        material.setStockAmount(next.amount());
        material.setAvgCost(next.average());
        material.setLastCalcTime(now);
        if ("PURCHASE_RECEIPT".equals(command.sourceType())) {
            material.setLastPurchasePrice(ledgers.lastPurchasePrice(material.getTenantId(), material.getConsumableId()));
        }
        persistBalance(material);
        return ledger;
    }

    public void persistBalance(SysConsumable material) {
        if (!TransactionSynchronizationManager.isActualTransactionActive()) throw new IllegalStateException("库存缓存更新必须位于记账事务内");
        OaRecordSupport.touch(material);
        OaRecordSupport.saved(materials.updateBalance(material));
        material.setVersion(material.getVersion() + 1);
        if (material.getQuantity() > material.getLowStockThreshold()) {
            materials.closeRecoveredRisks(material.getTenantId(), material.getConsumableId());
        }
    }

    public void assertReversible(SysConsumable material, OaConsumableLedger original) {
        OaConsumableLedger latest = ledgers.tail(OaRecordSupport.tenantId(), material.getConsumableId());
        if (original.getReversalOfLedgerId() != null || latest == null || !Objects.equals(latest.getLedgerId(), original.getLedgerId())
                || ledgers.reversal(OaRecordSupport.tenantId(), original.getLedgerId()) != null
                || !ledgers.returns(OaRecordSupport.tenantId(), original.getLedgerId()).isEmpty()) {
            throw new IllegalArgumentException("REVERSAL_NOT_ALLOWED: 只允许冲正最新、未冲正且没有后续退回的原始台账");
        }
    }

    public OaConsumableLedger reverse(SysConsumable material, OaConsumableLedger original, String key, String hash, String remark) {
        assertReversible(material, original);
        return post(material, Posting.builder().operationKey(key).hash(hash).lineNo(1)
                .transactionType(original.getTransactionType()).quantity(-original.getQuantity())
                .unitPrice(original.getUnitPrice()).amount(original.getAmount().negate())
                .sourceType(original.getSourceBizType()).sourceId(original.getSourceBizId()).sourceItemId(original.getSourceItemId())
                .sourceEventKey("REVERSE:" + original.getLedgerId()).sourceLedgerId(original.getSourceLedgerId())
                .reversalOfLedgerId(original.getLedgerId()).beneficiaryId(original.getBeneficiaryId())
                .beneficiaryName(original.getBeneficiaryName()).deptId(original.getDeptId()).deptName(original.getDeptName())
                .remark(remark).build());
    }

    public ConsumableResults.StockPosting result(String key, List<OaConsumableLedger> rows, boolean replayed, Long sourceId) {
        boolean cost = StpUtil.hasPermission("oa:consumable-ledger:cost");
        ConsumableResults.StockPosting result = new ConsumableResults.StockPosting();
        result.setOperationKey(key);
        result.setReplayed(replayed);
        result.setSourceId(sourceId == null ? null : sourceId.toString());
        result.setLedgerIds(rows.stream().map(row -> row.getLedgerId().toString()).toList());
        result.setRows(rows.stream().map(row -> {
            ConsumableResults.StockRow view = new ConsumableResults.StockRow();
            view.setLedgerId(row.getLedgerId().toString());
            view.setConsumableId(row.getConsumableId().toString());
            view.setTransactionType(row.getTransactionType());
            view.setQuantity(row.getQuantity());
            view.setBalanceAfter(row.getBalanceAfter());
            view.setUnit(row.getUnit());
            if (cost) {
                view.setUnitPrice(row.getUnitPrice().toPlainString());
                view.setAmount(row.getAmount().toPlainString());
                view.setBalanceAmountAfter(row.getBalanceAmountAfter().toPlainString());
            }
            return view;
        }).toList());
        return result;
    }

    private String label(Posting command) {
        String label = switch (command.transactionType()) {
            case "INBOUND" -> "入库";
            case "OUTBOUND" -> "领用出库";
            case "SCRAP" -> "报废出库";
            case "RETURN" -> "领用退回";
            default -> command.quantity() > 0 ? "盘盈调整" : "盘亏调整";
        };
        return command.reversalOfLedgerId() == null ? label : label + "冲正";
    }
}
