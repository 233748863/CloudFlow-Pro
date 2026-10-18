package com.cloudflow.oa.service.impl;

import cn.dev33.satoken.stp.StpUtil;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.datascope.DataScope;
import com.cloudflow.common.datascope.DataScopeUtils;
import com.cloudflow.oa.domain.OaConsumableLedger;
import com.cloudflow.oa.domain.OaConsumableRequest;
import com.cloudflow.oa.domain.OaConsumableRequestItem;
import com.cloudflow.oa.domain.SysConsumable;
import com.cloudflow.oa.domain.dto.ConsumableCommands;
import com.cloudflow.oa.domain.dto.ConsumableQuery;
import com.cloudflow.oa.domain.vo.ConsumableResults;
import com.cloudflow.oa.domain.vo.OaIdentityReference;
import com.cloudflow.oa.mapper.OaConsumableLedgerMapper;
import com.cloudflow.oa.mapper.OaConsumableRequestMapper;
import com.cloudflow.oa.mapper.OaConsumableRequestItemMapper;
import com.cloudflow.oa.mapper.OaIdentityReferenceMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.BeanUtils;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ConsumableRequestService {
    private final OaConsumableRequestMapper requests;
    private final OaConsumableRequestItemMapper items;
    private final OaConsumableLedgerMapper ledgers;
    private final OaIdentityReferenceMapper identities;
    private final ConsumableRequestAccess access;
    private final ConsumableLedgerService ledger;
    private final ConsumableReadService reads;
    private final ConsumableOperationSupport operations;
    private final ConsumableTransactions transactions;
    private final ConsumableApprovalService approvals;
    private final ConsumableDispatchService dispatch;

    public PageResult<OaConsumableRequest> page(ConsumableQuery query, String mode) {
        ConsumableOperationSupport.query(query, false);
        Long owner = null;
        DataScope scope;
        if ("SELF".equals(mode)) {
            owner = ConsumableOperationSupport.userId();
            scope = DataScopeUtils.onlySelf("applicant_id");
        } else if ("DEPARTMENT".equals(mode)) {
            StpUtil.checkPermission("oa:consumable-request:dept-list");
            scope = DataScopeUtils.listScope("dept_id", "applicant_id");
        } else {
            StpUtil.checkPermission("oa:consumable-request:dispatch");
            scope = DataScopeUtils.skip();
        }
        Page<OaConsumableRequest> page = requests.requestPage(new Page<>(query.getPageNum(), query.getPageSize()),
                OaRecordSupport.tenantId(), query, owner, "DISPATCH".equals(mode), scope);
        page.setRecords(page.getRecords().stream().map(reads::requestSummary).toList());
        return PageResult.build(page);
    }

    public ConsumableResults.RequestView detail(Long id, boolean warehouse) {
        if (warehouse) StpUtil.checkPermission("oa:consumable-request:dispatch");
        OaConsumableRequest request = warehouse ? access.dispatch(id, false) : access.visible(id);
        ConsumableResults.RequestView view = new ConsumableResults.RequestView();
        BeanUtils.copyProperties(request, view);
        view.setItems(items.items(OaRecordSupport.tenantId(), id).stream().map(reads::requestItem).toList());
        view.setTransactions(ledgers.requestRows(OaRecordSupport.tenantId(), id).stream().map(row -> reads.ledgerView(row, false)).toList());
        reads.maskRequest(view);
        return view;
    }

    @Audit(name = "创建耗材领用申请")
    public ConsumableResults.RequestResult create(ConsumableCommands.CreateRequest command) {
        normalize(command);
        ConsumableOperationSupport.key(command.getOperationKey());
        String hash = operations.hash("REQUEST_CREATE", null, command);
        ConsumableResults.RequestResult existing = createReplay(command.getOperationKey(), hash);
        if (existing != null) return existing;
        try {
            return transactions.execute(() -> {
                ConsumableResults.RequestResult replay = createReplay(command.getOperationKey(), hash);
                if (replay != null) return replay;
                OaIdentityReference applicant = OaRecordSupport.active(identities.user(ConsumableOperationSupport.userId(), OaRecordSupport.tenantId()));
                OaIdentityReference department = OaRecordSupport.active(identities.department(OaRecordSupport.require(applicant.getDeptId(), "申请人部门未配置"), OaRecordSupport.tenantId()));
                Map<Long, SysConsumable> locked = ledger.lockAll(command.getItems().stream().map(ConsumableCommands.RequestLine::getConsumableId).toList());
                OaConsumableRequest request = new OaConsumableRequest();
                OaRecordSupport.create(request, "requestId");
                request.setRequestNo("LY" + UUID.randomUUID().toString().replace("-", ""));
                request.setApplicantId(applicant.getId());
                request.setApplicantName(applicant.getName());
                request.setDeptId(department.getId());
                request.setDeptName(department.getName());
                request.setPurpose(command.getPurpose());
                request.setApplyDate(command.getApplyDate());
                request.setExpectDate(command.getExpectDate());
                request.setStatus("DRAFT");
                request.setCreateKey(command.getOperationKey());
                request.setCreateHash(hash);
                request.setIssuedAmount(ConsumableCostCalculator.ZERO);
                request.setReturnedAmount(ConsumableCostCalculator.ZERO);
                List<OaConsumableRequestItem> lines = buildLines(command, locked);
                request.setTotalAmount(total(lines));
                OaRecordSupport.saved(requests.insert(request));
                for (OaConsumableRequestItem line : lines) {
                    line.setRequestId(request.getRequestId());
                    OaRecordSupport.saved(items.insert(line));
                }
                ConsumableResults.RequestResult result = ConsumableRequestAccess.result(request, false);
                operations.record(request.getRequestId(), "CONSUMABLE_CREATE", command.getOperationKey(), hash, result);
                return result;
            });
        } catch (DuplicateKeyException exception) {
            ConsumableResults.RequestResult replay = createReplay(command.getOperationKey(), hash);
            if (replay == null) throw exception;
            return replay;
        }
    }

    @Audit(name = "编辑耗材领用草稿")
    public ConsumableResults.RequestResult edit(Long id, ConsumableCommands.EditRequest command) {
        normalize(command);
        access.own(id, false);
        return transactions.execute(() -> {
            OaConsumableRequest request = access.own(id, true);
            ConsumableOperationSupport.version(command.getVersion(), request.getVersion());
            if (!Set.of("DRAFT", "REJECTED").contains(request.getStatus())) throw new IllegalArgumentException("仅草稿或驳回的申请可以编辑");
            List<OaConsumableRequestItem> oldLines = items.lockItems(OaRecordSupport.tenantId(), id);
            ConsumableRequestAccess.unissued(oldLines);
            Map<Long, SysConsumable> locked = ledger.lockAll(command.getItems().stream().map(ConsumableCommands.RequestLine::getConsumableId).toList());
            List<OaConsumableRequestItem> lines = buildLines(command, locked);
            int removed = items.replaceDraftLines(OaRecordSupport.tenantId(), id);
            if (removed != oldLines.size()) throw new IllegalStateException("领用明细已变更");
            for (OaConsumableRequestItem line : lines) {
                line.setRequestId(id);
                OaRecordSupport.saved(items.insert(line));
            }
            String oldPurpose = request.getPurpose();
            request.setPurpose(command.getPurpose());
            request.setApplyDate(command.getApplyDate());
            request.setExpectDate(command.getExpectDate());
            request.setTotalAmount(total(lines));
            request.setStatus("DRAFT");
            request.setInstanceId(null);
            access.save(request);
            operations.trace(ConsumableOperationSupport.BUSINESS_TYPE, id, "CONSUMABLE_EDIT", "领用草稿已编辑",
                    Map.of("oldPurpose", oldPurpose, "purpose", request.getPurpose(), "version", request.getVersion(),
                            "oldLines", oldLines.stream().map(line -> Map.of("consumableId", line.getConsumableId().toString(), "quantity", line.getApplyQuantity())).toList(),
                            "lines", lines.stream().map(line -> Map.of("consumableId", line.getConsumableId().toString(), "quantity", line.getApplyQuantity())).toList()));
            return ConsumableRequestAccess.result(request, false);
        });
    }

    public ConsumableResults.RequestResult submit(Long id, ConsumableCommands.Submit command) { return approvals.submit(id, command); }
    public ConsumableResults.IssueResult issue(Long id, ConsumableCommands.Issue command) { return dispatch.issue(id, command, null); }

    @Audit(name = "取消未发料耗材申请", highRisk = true)
    public ConsumableResults.RequestResult cancel(Long id, ConsumableCommands.Cancel command) {
        command.setReason(OaRecordSupport.text(command.getReason(), 255, "取消原因"));
        access.own(id, false);
        return transactions.execute(() -> {
            OaConsumableRequest request = access.own(id, true);
            if ("CANCELLED".equals(request.getStatus())) return ConsumableRequestAccess.result(request, true);
            ConsumableOperationSupport.version(command.getVersion(), request.getVersion());
            if (!Set.of("DRAFT", "REJECTED", "APPROVED").contains(request.getStatus())) throw new IllegalArgumentException("审批中或已发料申请不能取消");
            ConsumableRequestAccess.unissued(items.lockItems(OaRecordSupport.tenantId(), id));
            request.setStatus("CANCELLED");
            request.setCancelBy(ConsumableOperationSupport.userId());
            request.setCancelTime(LocalDateTime.now());
            request.setCancelReason(command.getReason());
            access.save(request);
            return ConsumableRequestAccess.result(request, false);
        });
    }

    private ConsumableResults.RequestResult createReplay(String key, String hash) {
        OaConsumableRequest request = requests.byCreateKey(OaRecordSupport.tenantId(), key);
        if (request == null) return null;
        access.assertOwner(request);
        ConsumableOperationSupport.sameHash(request.getCreateHash(), hash);
        ConsumableResults.RequestResult result = operations.replay(request.getRequestId(), "CONSUMABLE_CREATE", key, hash, ConsumableResults.RequestResult.class);
        if (result == null) throw new IllegalStateException("创建请求的持久重放记录缺失");
        result.setReplayed(true);
        return result;
    }

    private void normalize(ConsumableCommands.RequestData command) {
        OaRecordSupport.require(command, "申请不能为空");
        command.setPurpose(OaRecordSupport.text(command.getPurpose(), 500, "领用用途"));
        OaRecordSupport.require(command.getApplyDate(), "申请日期不能为空");
        if (command.getExpectDate() != null && command.getExpectDate().isBefore(command.getApplyDate())) throw new IllegalArgumentException("期望领用日期不能早于申请日期");
        if (command.getItems() == null || command.getItems().isEmpty() || command.getItems().size() > 100) throw new IllegalArgumentException("领用明细须为1至100行");
        Set<Long> seen = new HashSet<>();
        for (ConsumableCommands.RequestLine line : command.getItems()) {
            OaRecordSupport.require(line, "领用明细不能为空");
            if (line.getConsumableId() == null || !seen.add(line.getConsumableId())) throw new IllegalArgumentException("耗材不可为空或重复");
            ConsumableCostCalculator.positive(line.getApplyQuantity());
            line.setRemark(ConsumableOperationSupport.optional(line.getRemark(), 255, "明细备注"));
        }
        command.setItems(command.getItems().stream().sorted(Comparator.comparing(ConsumableCommands.RequestLine::getConsumableId)).toList());
    }

    private List<OaConsumableRequestItem> buildLines(ConsumableCommands.RequestData command, Map<Long, SysConsumable> locked) {
        List<OaConsumableRequestItem> lines = new ArrayList<>();
        for (ConsumableCommands.RequestLine input : command.getItems()) {
            SysConsumable material = locked.get(input.getConsumableId());
            if (!"ACTIVE".equals(material.getStatus())) throw new IllegalArgumentException("停用耗材不能新申请");
            ledger.assertTail(material);
            OaConsumableRequestItem line = new OaConsumableRequestItem();
            OaRecordSupport.create(line, "itemId");
            line.setConsumableId(material.getConsumableId());
            line.setConsumableName(material.getName());
            line.setModel(material.getModel());
            line.setUnit(material.getUnit());
            line.setApplyQuantity(input.getApplyQuantity());
            line.setApprovedQuantity(0);
            line.setIssuedQuantity(0);
            line.setReturnedQuantity(0);
            line.setIssuedAmount(ConsumableCostCalculator.ZERO);
            line.setReturnedAmount(ConsumableCostCalculator.ZERO);
            line.setSortNo(lines.size() + 1);
            line.setRemark(input.getRemark());
            BigDecimal price = material.getQuantity() > 0 ? material.getAvgCost() : null;
            if (price == null) {
                OaConsumableLedger inbound = ledgers.lastInbound(material.getTenantId(), material.getConsumableId());
                price = inbound == null ? null : inbound.getUnitPrice();
            }
            line.setUnitPrice(price);
            line.setAmount(price == null ? null : ConsumableCostCalculator.price(price.multiply(BigDecimal.valueOf(line.getApplyQuantity()))));
            lines.add(line);
        }
        return lines;
    }

    static BigDecimal total(List<OaConsumableRequestItem> lines) {
        if (lines.stream().anyMatch(line -> line.getAmount() == null)) return null;
        return ConsumableCostCalculator.price(lines.stream().map(OaConsumableRequestItem::getAmount).reduce(ConsumableCostCalculator.ZERO, BigDecimal::add));
    }
}
