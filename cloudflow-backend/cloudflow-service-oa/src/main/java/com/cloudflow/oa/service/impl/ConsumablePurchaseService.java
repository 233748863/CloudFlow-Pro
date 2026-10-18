package com.cloudflow.oa.service.impl;

import cn.dev33.satoken.stp.StpUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.datascope.DataScopeUtils;
import com.cloudflow.oa.domain.BizPurchaseItem;
import com.cloudflow.oa.domain.BizPurchaseReceipt;
import com.cloudflow.oa.domain.BizPurchaseRequest;
import com.cloudflow.oa.domain.OaConsumableLedger;
import com.cloudflow.oa.domain.SysConsumable;
import com.cloudflow.oa.domain.dto.ConsumableCommands;
import com.cloudflow.oa.domain.dto.ConsumableQuery;
import com.cloudflow.oa.domain.dto.PurchaseReceiptDTO;
import com.cloudflow.oa.domain.vo.ConsumableResults;
import com.cloudflow.oa.mapper.BizPurchaseReceiptMapper;
import com.cloudflow.oa.mapper.BizPurchaseRequestMapper;
import com.cloudflow.oa.mapper.OaConsumableLedgerMapper;
import com.cloudflow.oa.mapper.OaConsumablePurchaseMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class ConsumablePurchaseService {
    private final BizPurchaseRequestMapper purchases;
    private final BizPurchaseReceiptMapper receipts;
    private final OaConsumablePurchaseMapper lines;
    private final OaConsumableLedgerMapper ledgers;
    private final OaRfqPurchaseSourceService source;
    private final OaProjectAccountingService accounting;
    private final ConsumableLedgerService ledger;
    private final ConsumableOperationSupport operations;
    private final ConsumableTransactions transactions;

    @Audit(name = "采购分批收货入耗材台账", highRisk = true)
    public ConsumableResults.StockPosting receive(Long id, PurchaseReceiptDTO command) {
        StpUtil.checkPermission("oa:purchase:receipt");
        normalize(command);
        BizPurchaseRequest reference = writable(id);
        String hash = operations.hash("PURCHASE_RECEIPT", id, command);
        List<OaConsumableLedger> existing = ledger.existing(command.getOperationKey(), hash);
        if (!existing.isEmpty()) return ledger.result(command.getOperationKey(), existing, true, id);
        try {
            return transactions.execute(() -> {
                BizPurchaseRequest purchase = source.lockForWrite(id, reference.getRfqId());
                List<OaConsumableLedger> duplicate = ledger.existing(command.getOperationKey(), hash);
                if (!duplicate.isEmpty()) return ledger.result(command.getOperationKey(), duplicate, true, id);
                ConsumableOperationSupport.version(command.getPurchaseVersion(), purchase.getVersion());
                if (!Set.of("APPROVED", "PARTIAL_RECEIVED").contains(purchase.getStatus())) throw new IllegalArgumentException("仅已批准或部分收货的采购可继续收货");
                List<BizPurchaseItem> purchaseLines = lines.lockItems(OaRecordSupport.tenantId(), id);
                Map<Long, BizPurchaseItem> mapped = new LinkedHashMap<>();
                purchaseLines.forEach(line -> mapped.put(line.getId(), line));
                List<Long> materialIds = command.getItems().stream().map(input -> OaRecordSupport.require(mapped.get(input.getItemId()), "采购明细不属于该采购").getConsumableId()).toList();
                Map<Long, SysConsumable> locked = ledger.lockAll(materialIds);
                List<OaConsumableLedger> posted = new ArrayList<>();
                for (int index = 0; index < command.getItems().size(); index++) {
                    PurchaseReceiptDTO.PurchaseReceiptItemDTO input = command.getItems().get(index);
                    BizPurchaseItem item = mapped.get(input.getItemId());
                    SysConsumable material = locked.get(item.getConsumableId());
                    OaRecordSupport.same(item.getUnit(), material.getUnit(), "采购与耗材单位不一致");
                    assertReceived(item);
                    int previous = item.getReceivedQuantity();
                    int next = ConsumableCostCalculator.cumulative(previous, input.getQuantity());
                    BigDecimal amount = ConsumableCostCalculator.allocate(item.getAmount(), item.getQuantity(), next,
                            ledgers.receivedAmount(OaRecordSupport.tenantId(), item.getId()));
                    BizPurchaseReceipt receipt = new BizPurchaseReceipt();
                    receipt.setTenantId(OaRecordSupport.tenantId());
                    receipt.setPurchaseId(id);
                    receipt.setItemId(item.getId());
                    receipt.setConsumableId(item.getConsumableId());
                    receipt.setConsumableName(item.getConsumableName());
                    receipt.setReceivedQuantity(input.getQuantity());
                    receipt.setOperatorId(ConsumableOperationSupport.userId());
                    receipt.setOperatorName(OaRecordSupport.userName());
                    receipt.setReceiptTime(LocalDateTime.now());
                    receipt.setRemark(command.getRemark());
                    receipt.setCreateBy(OaRecordSupport.userName());
                    receipt.setCreateTime(LocalDateTime.now());
                    OaRecordSupport.saved(receipts.insert(receipt));
                    posted.add(ledger.post(material, ConsumableLedgerService.Posting.builder().operationKey(command.getOperationKey())
                            .hash(hash).lineNo(index + 1).transactionType("INBOUND").quantity(input.getQuantity()).amount(amount)
                            .unitPrice(ConsumableCostCalculator.average(item.getQuantity(), item.getAmount()))
                            .sourceType("PURCHASE_RECEIPT").sourceId(receipt.getId()).sourceItemId(item.getId())
                            .sourceEventKey("PURCHASE_RECEIPT:" + receipt.getId())
                            .remark("采购入库：" + purchase.getPurchaseNo() + "，收货记录：" + receipt.getId()).build()));
                    item.setReceivedQuantity(next);
                    OaRecordSupport.saved(lines.updateReceived(item, previous));
                }
                updatePurchase(purchase, purchaseLines);
                return ledger.result(command.getOperationKey(), posted, false, id);
            });
        } catch (DuplicateKeyException exception) {
            List<OaConsumableLedger> rows = ledger.existing(command.getOperationKey(), hash);
            if (rows.isEmpty()) throw exception;
            return ledger.result(command.getOperationKey(), rows, true, id);
        }
    }

    @Audit(name = "冲正采购耗材收货", highRisk = true)
    public ConsumableResults.StockPosting reverse(OaConsumableLedger original, ConsumableCommands.Reverse command, String hash) {
        StpUtil.checkPermission("oa:purchase:receipt");
        BizPurchaseReceipt receipt = OaRecordSupport.active(receipts.selectOne(new LambdaQueryWrapper<BizPurchaseReceipt>()
                .eq(BizPurchaseReceipt::getTenantId, OaRecordSupport.tenantId()).eq(BizPurchaseReceipt::getId, original.getSourceBizId())));
        BizPurchaseRequest reference = writable(receipt.getPurchaseId());
        List<OaConsumableLedger> existing = ledger.existing(command.getOperationKey(), hash);
        if (!existing.isEmpty()) return ledger.result(command.getOperationKey(), existing, true, reference.getId());
        try {
            return transactions.execute(() -> {
                BizPurchaseRequest purchase = source.lockForWrite(reference.getId(), reference.getRfqId());
                List<OaConsumableLedger> duplicate = ledger.existing(command.getOperationKey(), hash);
                if (!duplicate.isEmpty()) return ledger.result(command.getOperationKey(), duplicate, true, purchase.getId());
                ConsumableOperationSupport.version(command.getPurchaseVersion(), purchase.getVersion());
                if (!Set.of("APPROVED", "PARTIAL_RECEIVED", "RECEIVED").contains(purchase.getStatus())
                        || purchase.getPaymentRequestId() != null || !"NONE".equals(purchase.getPaymentStatus())) {
                    throw new IllegalArgumentException("REVERSAL_NOT_ALLOWED: 采购已有付款关系或不可逆后续状态");
                }
                List<BizPurchaseItem> purchaseLines = lines.lockItems(OaRecordSupport.tenantId(), purchase.getId());
                BizPurchaseItem item = purchaseLines.stream().filter(line -> Objects.equals(line.getId(), original.getSourceItemId())
                        && Objects.equals(line.getConsumableId(), original.getConsumableId())).findFirst()
                        .orElseThrow(() -> new IllegalArgumentException("原采购明细不一致"));
                if (!Objects.equals(receipt.getItemId(), item.getId()) || !Objects.equals(receipt.getReceivedQuantity(), original.getQuantity())) {
                    throw new IllegalStateException("原收货记录与台账不一致");
                }
                SysConsumable material = ledger.lockAll(List.of(original.getConsumableId())).get(original.getConsumableId());
                assertReceived(item);
                int previous = item.getReceivedQuantity();
                OaConsumableLedger posted = ledger.reverse(material, original, command.getOperationKey(), hash, command.getRemark());
                item.setReceivedQuantity(ConsumableCostCalculator.cumulative(previous, -original.getQuantity()));
                OaRecordSupport.saved(lines.updateReceived(item, previous));
                updatePurchase(purchase, purchaseLines);
                return ledger.result(command.getOperationKey(), List.of(posted), false, purchase.getId());
            });
        } catch (DuplicateKeyException exception) {
            List<OaConsumableLedger> rows = ledger.existing(command.getOperationKey(), hash);
            if (rows.isEmpty()) throw exception;
            return ledger.result(command.getOperationKey(), rows, true, reference.getId());
        }
    }

    public PageResult<ConsumableResults.PurchaseReceiptView> receipts(Long id, ConsumableQuery query) {
        OaRecordSupport.active(lines.visible(OaRecordSupport.tenantId(), id, DataScopeUtils.listScope("dept_id", "user_id")));
        ConsumableOperationSupport.query(query, false);
        return PageResult.build(lines.receipts(new Page<>(query.getPageNum(), query.getPageSize()), OaRecordSupport.tenantId(), id));
    }

    private BizPurchaseRequest writable(Long id) {
        BizPurchaseRequest purchase = OaRecordSupport.active(purchases.selectOne(new LambdaQueryWrapper<BizPurchaseRequest>()
                .eq(BizPurchaseRequest::getTenantId, OaRecordSupport.tenantId()).eq(BizPurchaseRequest::getId, id).eq(BizPurchaseRequest::getDeleted, 0)));
        DataScopeUtils.assertOwnership(purchase.getUserId(), "采购申请");
        return purchase;
    }

    private void assertReceived(BizPurchaseItem item) {
        if (!Objects.equals(ledgers.receivedQuantity(OaRecordSupport.tenantId(), item.getId()), item.getReceivedQuantity().longValue())) {
            throw new IllegalStateException("LEDGER_INCONSISTENT: 采购已收数量与耗材台账不一致");
        }
        BigDecimal expected = ConsumableCostCalculator.allocate(item.getAmount(), item.getQuantity(), item.getReceivedQuantity(), ConsumableCostCalculator.ZERO);
        if (ledgers.receivedAmount(OaRecordSupport.tenantId(), item.getId()).compareTo(expected) != 0) {
            throw new IllegalStateException("LEDGER_INCONSISTENT: 采购累计入库成本不一致");
        }
    }

    private void updatePurchase(BizPurchaseRequest purchase, List<BizPurchaseItem> items) {
        boolean received = items.stream().allMatch(item -> Objects.equals(item.getReceivedQuantity(), item.getQuantity()));
        boolean partial = items.stream().anyMatch(item -> item.getReceivedQuantity() > 0);
        purchase.setStatus(received ? "RECEIVED" : partial ? "PARTIAL_RECEIVED" : "APPROVED");
        OaRecordSupport.touch(purchase);
        OaRecordSupport.saved(purchases.updateById(purchase));
        if (purchase.getProjectId() != null) accounting.recalculate(purchase.getProjectId());
    }

    private void normalize(PurchaseReceiptDTO command) {
        OaRecordSupport.require(command, "收货请求不能为空");
        ConsumableOperationSupport.key(command.getOperationKey());
        if (command.getPurchaseVersion() == null || command.getPurchaseVersion() < 0) throw new IllegalArgumentException("采购版本不能为空");
        command.setRemark(ConsumableOperationSupport.optional(command.getRemark(), 500, "收货备注"));
        if (command.getItems() == null || command.getItems().isEmpty() || command.getItems().size() > 100) throw new IllegalArgumentException("收货明细须为1至100行");
        Set<Long> seen = new HashSet<>();
        for (PurchaseReceiptDTO.PurchaseReceiptItemDTO line : command.getItems()) {
            if (line == null || line.getItemId() == null || !seen.add(line.getItemId())) throw new IllegalArgumentException("收货明细不可为空或重复");
            ConsumableCostCalculator.positive(line.getQuantity());
        }
        command.setItems(command.getItems().stream().sorted(Comparator.comparing(PurchaseReceiptDTO.PurchaseReceiptItemDTO::getItemId)).toList());
    }
}
