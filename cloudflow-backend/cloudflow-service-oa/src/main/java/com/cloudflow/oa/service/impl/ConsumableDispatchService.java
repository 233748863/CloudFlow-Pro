package com.cloudflow.oa.service.impl;

import cn.dev33.satoken.stp.StpUtil;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.oa.domain.OaConsumableLedger;
import com.cloudflow.oa.domain.OaConsumableRequest;
import com.cloudflow.oa.domain.OaConsumableRequestItem;
import com.cloudflow.oa.domain.SysConsumable;
import com.cloudflow.oa.domain.dto.ConsumableCommands;
import com.cloudflow.oa.domain.vo.ConsumableResults;
import com.cloudflow.oa.mapper.OaConsumableLedgerMapper;
import com.cloudflow.oa.mapper.OaConsumableRequestItemMapper;
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
public class ConsumableDispatchService {
    private final ConsumableRequestAccess access;
    private final OaConsumableRequestItemMapper items;
    private final OaConsumableLedgerMapper ledgers;
    private final ConsumableLedgerService ledger;
    private final ConsumableTransactions transactions;
    private final ConsumableOperationSupport operations;

    @Audit(name = "耗材领用分批发料", highRisk = true)
    public ConsumableResults.IssueResult issue(Long id, ConsumableCommands.Issue command, Long expectedConsumableId) {
        StpUtil.checkPermissionAnd("oa:consumable-request:dispatch", "oa:consumable-request:issue");
        normalize(command);
        access.get(id);
        String hash = operations.hash(expectedConsumableId == null ? "REQUEST_ISSUE" : "LEGACY_ISSUE:" + expectedConsumableId, id, command);
        ConsumableResults.IssueResult replay = issueReplay(id, command.getOperationKey(), hash);
        if (replay != null) return replay;
        try {
            return transactions.execute(() -> {
                OaConsumableRequest request = access.lock(id);
                ConsumableResults.IssueResult duplicate = issueReplay(id, command.getOperationKey(), hash);
                if (duplicate != null) return duplicate;
                ConsumableOperationSupport.version(command.getVersion(), request.getVersion());
                if (!"APPROVED".equals(request.getStatus())) throw new IllegalArgumentException("仅已批准且尚未发足的申请可发料");
                List<OaConsumableRequestItem> lines = items.lockItems(OaRecordSupport.tenantId(), id);
                Map<Long, OaConsumableRequestItem> lineMap = new LinkedHashMap<>();
                lines.forEach(line -> lineMap.put(line.getItemId(), line));
                List<Long> materialIds = new ArrayList<>();
                for (ConsumableCommands.IssueLine input : command.getItems()) {
                    OaConsumableRequestItem line = OaRecordSupport.require(lineMap.get(input.getItemId()), "领用明细不属于该申请");
                    if (expectedConsumableId != null && !expectedConsumableId.equals(line.getConsumableId())) throw new IllegalArgumentException("原出库入口的耗材与领用明细不一致");
                    materialIds.add(line.getConsumableId());
                }
                Map<Long, SysConsumable> locked = ledger.lockAll(materialIds);
                List<ConsumableResults.IssueRow> results = new ArrayList<>();
                for (ConsumableCommands.IssueLine input : command.getItems()) {
                    OaConsumableRequestItem line = lineMap.get(input.getItemId());
                    SysConsumable material = locked.get(line.getConsumableId());
                    if (!"ACTIVE".equals(material.getStatus()) || !Objects.equals(material.getUnit(), line.getUnit())) throw new IllegalArgumentException("耗材已停用或单位不一致");
                    ledger.assertTail(material);
                    int remaining = line.getApprovedQuantity() - line.getIssuedQuantity();
                    if (remaining < 0) throw new IllegalStateException("领用累计数量不一致");
                    int actual = Math.min(input.getQuantity(), Math.min(remaining, material.getQuantity()));
                    if (!Boolean.TRUE.equals(command.getAllowPartial()) && actual != input.getQuantity()) {
                        throw new IllegalArgumentException("STOCK_NOT_ENOUGH: 库存或剩余批准量不足，本次未发料");
                    }
                    ConsumableResults.IssueRow result = new ConsumableResults.IssueRow();
                    result.setItemId(input.getItemId().toString());
                    result.setRequestedQuantity(input.getQuantity());
                    result.setIssuedQuantity(actual);
                    result.setShortageQuantity(input.getQuantity() - actual);
                    results.add(result);
                }
                if (results.stream().noneMatch(row -> row.getIssuedQuantity() > 0)) throw new IllegalArgumentException("STOCK_NOT_ENOUGH: 本次无可发数量");
                List<String> ledgerIds = new ArrayList<>();
                for (int index = 0; index < results.size(); index++) {
                    ConsumableResults.IssueRow result = results.get(index);
                    if (result.getIssuedQuantity() == 0) continue;
                    OaConsumableRequestItem line = lineMap.get(Long.valueOf(result.getItemId()));
                    SysConsumable material = locked.get(line.getConsumableId());
                    BigDecimal cost = ConsumableCostCalculator.outbound(material.getQuantity(), material.getStockAmount(), result.getIssuedQuantity());
                    OaConsumableLedger posted = ledger.post(material, ConsumableLedgerService.Posting.builder()
                            .operationKey(command.getOperationKey()).hash(hash).lineNo(index + 1).transactionType("OUTBOUND")
                            .quantity(-result.getIssuedQuantity()).amount(cost.negate()).unitPrice(material.getAvgCost())
                            .sourceType("CONSUMABLE_REQUEST").sourceId(id).sourceItemId(line.getItemId())
                            .sourceEventKey("CONSUMABLE_REQUEST:" + id + ":" + line.getItemId() + ":" + command.getOperationKey())
                            .beneficiaryId(request.getApplicantId()).beneficiaryName(request.getApplicantName())
                            .deptId(request.getDeptId()).deptName(request.getDeptName()).remark(command.getRemark()).build());
                    line.setIssuedQuantity(ConsumableCostCalculator.cumulative(line.getIssuedQuantity(), result.getIssuedQuantity()));
                    line.setIssuedAmount(ConsumableCostCalculator.price(line.getIssuedAmount().add(cost)));
                    access.saveItem(line);
                    result.setLedgerId(posted.getLedgerId().toString());
                    ledgerIds.add(result.getLedgerId());
                }
                totals(request, lines);
                request.setStatus(lines.stream().allMatch(line -> line.getIssuedQuantity().equals(line.getApprovedQuantity())) ? "ISSUED" : "APPROVED");
                request.setIssueBy(ConsumableOperationSupport.userId());
                request.setIssueTime(LocalDateTime.now());
                access.save(request);
                ConsumableResults.IssueResult result = new ConsumableResults.IssueResult();
                result.setRequestId(id.toString());
                result.setStatus(request.getStatus());
                result.setVersion(request.getVersion());
                result.setRows(results);
                result.setLedgerIds(ledgerIds);
                result.setReplayed(false);
                operations.record(id, "CONSUMABLE_ISSUE", command.getOperationKey(), hash, result);
                return result;
            });
        } catch (DuplicateKeyException exception) {
            ConsumableResults.IssueResult result = issueReplay(id, command.getOperationKey(), hash);
            if (result == null) throw exception;
            return result;
        }
    }

    @Audit(name = "接收耗材实物退回", highRisk = true)
    public ConsumableResults.StockPosting returnStock(Long consumableId, ConsumableCommands.ReturnStock command) {
        StpUtil.checkPermission("oa:consumable:return");
        ConsumableOperationSupport.operation(command);
        ConsumableCostCalculator.positive(command.getQuantity());
        OaConsumableLedger source = ledger.ledger(command.getSourceLedgerId());
        if (!Objects.equals(source.getConsumableId(), consumableId) || !"CONSUMABLE_REQUEST".equals(source.getSourceBizType())
                || !"OUTBOUND".equals(source.getTransactionType()) || source.getQuantity() >= 0 || source.getReversalOfLedgerId() != null) {
            throw new IllegalArgumentException("退回必须引用本耗材的原始领用出库台账");
        }
        access.get(source.getSourceBizId());
        String hash = operations.hash("RETURN", consumableId, command);
        List<OaConsumableLedger> existing = ledger.existing(command.getOperationKey(), hash);
        if (!existing.isEmpty()) return ledger.result(command.getOperationKey(), existing, true, source.getSourceBizId());
        try {
            return transactions.execute(() -> {
                OaConsumableRequest request = access.lock(source.getSourceBizId());
                List<OaConsumableLedger> duplicate = ledger.existing(command.getOperationKey(), hash);
                if (!duplicate.isEmpty()) return ledger.result(command.getOperationKey(), duplicate, true, request.getRequestId());
                ConsumableOperationSupport.version(command.getRequestVersion(), request.getVersion());
                if (!Set.of("APPROVED", "ISSUED").contains(request.getStatus())) throw new IllegalArgumentException("申请不在可退料阶段");
                List<OaConsumableRequestItem> lines = items.lockItems(OaRecordSupport.tenantId(), request.getRequestId());
                OaConsumableRequestItem line = sourceLine(lines, source);
                SysConsumable material = ledger.lockAll(List.of(consumableId)).get(consumableId);
                if (ledgers.reversal(OaRecordSupport.tenantId(), source.getLedgerId()) != null) throw new IllegalArgumentException("原发料已被冲正，不能退回");
                List<OaConsumableLedger> returns = ledgers.returns(OaRecordSupport.tenantId(), source.getLedgerId());
                int returned = Math.toIntExact(returns.stream().mapToLong(OaConsumableLedger::getQuantity).sum());
                BigDecimal returnedAmount = returns.stream().map(OaConsumableLedger::getAmount).reduce(ConsumableCostCalculator.ZERO, BigDecimal::add);
                int cumulative = ConsumableCostCalculator.cumulative(returned, command.getQuantity());
                BigDecimal amount = ConsumableCostCalculator.allocate(source.getAmount().negate(), -source.getQuantity(), cumulative, returnedAmount);
                OaConsumableLedger posted = ledger.post(material, ConsumableLedgerService.Posting.builder().operationKey(command.getOperationKey()).hash(hash)
                        .lineNo(1).transactionType("RETURN").quantity(command.getQuantity()).unitPrice(source.getUnitPrice()).amount(amount)
                        .sourceType("CONSUMABLE_REQUEST").sourceId(request.getRequestId()).sourceItemId(line.getItemId())
                        .sourceEventKey("RETURN:" + source.getLedgerId() + ":" + command.getOperationKey()).sourceLedgerId(source.getLedgerId())
                        .beneficiaryId(source.getBeneficiaryId()).beneficiaryName(source.getBeneficiaryName()).deptId(source.getDeptId())
                        .deptName(source.getDeptName()).remark(command.getRemark()).build());
                line.setReturnedQuantity(ConsumableCostCalculator.cumulative(line.getReturnedQuantity(), command.getQuantity()));
                line.setReturnedAmount(ConsumableCostCalculator.price(line.getReturnedAmount().add(amount)));
                totals(request, lines);
                access.saveItem(line);
                access.save(request);
                return ledger.result(command.getOperationKey(), List.of(posted), false, request.getRequestId());
            });
        } catch (DuplicateKeyException exception) {
            List<OaConsumableLedger> rows = ledger.existing(command.getOperationKey(), hash);
            if (rows.isEmpty()) throw exception;
            return ledger.result(command.getOperationKey(), rows, true, source.getSourceBizId());
        }
    }

    @Audit(name = "冲正耗材发料或退回", highRisk = true)
    public ConsumableResults.StockPosting reverse(OaConsumableLedger source, ConsumableCommands.Reverse command, String hash) {
        StpUtil.checkPermission("oa:consumable-request:issue");
        access.get(source.getSourceBizId());
        List<OaConsumableLedger> existing = ledger.existing(command.getOperationKey(), hash);
        if (!existing.isEmpty()) return ledger.result(command.getOperationKey(), existing, true, source.getSourceBizId());
        try {
            return transactions.execute(() -> {
                OaConsumableRequest request = access.lock(source.getSourceBizId());
                List<OaConsumableLedger> duplicate = ledger.existing(command.getOperationKey(), hash);
                if (!duplicate.isEmpty()) return ledger.result(command.getOperationKey(), duplicate, true, request.getRequestId());
                ConsumableOperationSupport.version(command.getRequestVersion(), request.getVersion());
                if (!Set.of("APPROVED", "ISSUED").contains(request.getStatus())) throw new IllegalArgumentException("申请不在允许冲正的阶段");
                List<OaConsumableRequestItem> lines = items.lockItems(OaRecordSupport.tenantId(), request.getRequestId());
                OaConsumableRequestItem line = sourceLine(lines, source);
                SysConsumable material = ledger.lockAll(List.of(source.getConsumableId())).get(source.getConsumableId());
                OaConsumableLedger posted = ledger.reverse(material, source, command.getOperationKey(), hash, command.getRemark());
                if ("OUTBOUND".equals(source.getTransactionType())) {
                    line.setIssuedQuantity(ConsumableCostCalculator.cumulative(line.getIssuedQuantity(), source.getQuantity()));
                    line.setIssuedAmount(ConsumableCostCalculator.price(line.getIssuedAmount().add(source.getAmount())));
                } else if ("RETURN".equals(source.getTransactionType())) {
                    line.setReturnedQuantity(ConsumableCostCalculator.cumulative(line.getReturnedQuantity(), -source.getQuantity()));
                    line.setReturnedAmount(ConsumableCostCalculator.price(line.getReturnedAmount().subtract(source.getAmount())));
                } else throw new IllegalArgumentException("该申请流水类型不支持冲正");
                totals(request, lines);
                request.setStatus(lines.stream().allMatch(value -> value.getIssuedQuantity().equals(value.getApprovedQuantity())) ? "ISSUED" : "APPROVED");
                access.saveItem(line);
                access.save(request);
                return ledger.result(command.getOperationKey(), List.of(posted), false, request.getRequestId());
            });
        } catch (DuplicateKeyException exception) {
            List<OaConsumableLedger> rows = ledger.existing(command.getOperationKey(), hash);
            if (rows.isEmpty()) throw exception;
            return ledger.result(command.getOperationKey(), rows, true, source.getSourceBizId());
        }
    }

    private void normalize(ConsumableCommands.Issue command) {
        ConsumableOperationSupport.operation(command);
        if (command.getAllowPartial() == null) throw new IllegalArgumentException("必须明确是否允许部分发料");
        if (command.getItems() == null || command.getItems().isEmpty() || command.getItems().size() > 100) throw new IllegalArgumentException("发料明细须为1至100行");
        Set<Long> seen = new HashSet<>();
        for (ConsumableCommands.IssueLine line : command.getItems()) {
            if (line == null || line.getItemId() == null || !seen.add(line.getItemId())) throw new IllegalArgumentException("发料明细不可为空或重复");
            ConsumableCostCalculator.positive(line.getQuantity());
        }
        command.setItems(command.getItems().stream().sorted(Comparator.comparing(ConsumableCommands.IssueLine::getItemId)).toList());
    }

    private ConsumableResults.IssueResult issueReplay(Long id, String key, String hash) {
        List<OaConsumableLedger> rows = ledger.existing(key, hash);
        if (rows.isEmpty()) return null;
        ConsumableResults.IssueResult result = operations.replay(id, "CONSUMABLE_ISSUE", key, hash, ConsumableResults.IssueResult.class);
        if (result == null) throw new IllegalStateException("发料重放快照缺失，不能再次分配库存");
        result.setReplayed(true);
        return result;
    }

    private OaConsumableRequestItem sourceLine(List<OaConsumableRequestItem> lines, OaConsumableLedger source) {
        return lines.stream().filter(line -> Objects.equals(line.getItemId(), source.getSourceItemId())
                && Objects.equals(line.getConsumableId(), source.getConsumableId())).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("台账引用的领用明细不存在"));
    }

    private void totals(OaConsumableRequest request, List<OaConsumableRequestItem> lines) {
        for (OaConsumableRequestItem line : lines) {
            if (line.getIssuedQuantity() < 0 || line.getIssuedQuantity() > line.getApprovedQuantity()
                    || line.getReturnedQuantity() < 0 || line.getReturnedQuantity() > line.getIssuedQuantity()
                    || line.getReturnedAmount().compareTo(line.getIssuedAmount()) > 0) throw new IllegalStateException("领用已发或已退累计不一致");
        }
        request.setIssuedAmount(ConsumableCostCalculator.price(lines.stream().map(OaConsumableRequestItem::getIssuedAmount).reduce(ConsumableCostCalculator.ZERO, BigDecimal::add)));
        request.setReturnedAmount(ConsumableCostCalculator.price(lines.stream().map(OaConsumableRequestItem::getReturnedAmount).reduce(ConsumableCostCalculator.ZERO, BigDecimal::add)));
    }
}
