package com.cloudflow.oa.service.impl;

import cn.dev33.satoken.stp.StpUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.datascope.DataScope;
import com.cloudflow.common.datascope.DataScopeHandle;
import com.cloudflow.common.datascope.DataScopeUtils;
import com.cloudflow.oa.domain.OaConsumableLedger;
import com.cloudflow.oa.domain.OaConsumableRequest;
import com.cloudflow.oa.domain.OaConsumableRequestItem;
import com.cloudflow.oa.domain.SysAssetLog;
import com.cloudflow.oa.domain.SysConsumable;
import com.cloudflow.oa.domain.dto.ConsumableQuery;
import com.cloudflow.oa.domain.vo.ConsumableResults;
import com.cloudflow.oa.mapper.OaConsumableLedgerMapper;
import com.cloudflow.oa.mapper.SysAssetLogMapper;
import com.cloudflow.oa.mapper.SysConsumableMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class ConsumableReadService {
    private final ConsumableLedgerService ledgerService;
    private final OaConsumableLedgerMapper ledgers;
    private final SysConsumableMapper materials;
    private final SysAssetLogMapper logs;
    private final DataScopeHandle dataScopeHandle;

    public SysConsumable stock(Long id) { return maskStock(ledgerService.material(id)); }

    public SysConsumable maskStock(SysConsumable source) {
        SysConsumable view = new SysConsumable();
        BeanUtils.copyProperties(source, view);
        if (!costAllowed()) {
            view.setAvgCost(null);
            view.setStockAmount(null);
            view.setLastPurchasePrice(null);
        }
        return view;
    }

    public List<SysAssetLog> logs(Long id) {
        ledgerService.material(id);
        return logs.selectList(new LambdaQueryWrapper<SysAssetLog>().eq(SysAssetLog::getTenantId, OaRecordSupport.tenantId())
                .eq(SysAssetLog::getRefType, "2").eq(SysAssetLog::getRefId, id).orderByDesc(SysAssetLog::getLogId));
    }

    public PageResult<ConsumableResults.CatalogItem> catalog(ConsumableQuery query) {
        ConsumableOperationSupport.query(query, false);
        return PageResult.build(materials.catalog(new Page<>(query.getPageNum(), query.getPageSize()), OaRecordSupport.tenantId(), query));
    }

    public List<ConsumableResults.Category> categories() { return materials.categories(OaRecordSupport.tenantId()); }

    public PageResult<ConsumableResults.LedgerView> ledgerPage(ConsumableQuery query) {
        ConsumableOperationSupport.query(query, false);
        Page<OaConsumableLedger> page = ledgers.ledgerPage(new Page<>(query.getPageNum(), query.getPageSize()), OaRecordSupport.tenantId(), query);
        return new PageResult<>(page.getRecords().stream().map(row -> ledgerView(row, false)).toList(),
                page.getTotal(), page.getCurrent(), page.getSize());
    }

    public ConsumableResults.LedgerView ledger(Long id) { return ledgerView(ledgerService.ledger(id), true); }

    public ConsumableResults.LedgerView ledgerView(OaConsumableLedger source, boolean detail) {
        ConsumableResults.LedgerView view = new ConsumableResults.LedgerView();
        BeanUtils.copyProperties(source, view);
        OaConsumableLedger reversal = ledgers.reversal(OaRecordSupport.tenantId(), source.getLedgerId());
        view.setReversed(reversal != null);
        view.setReversalLedgerId(reversal == null ? null : reversal.getLedgerId().toString());
        long returned = ledgers.returns(OaRecordSupport.tenantId(), source.getLedgerId()).stream().mapToLong(OaConsumableLedger::getQuantity).sum();
        view.setReturnedQuantity(Math.toIntExact(returned));
        if (!costAllowed()) {
            view.setUnitPrice(null);
            view.setAmount(null);
            view.setBalanceAmountAfter(null);
            view.setAvgCostAfter(null);
        }
        if (detail) {
            if (!"MANUAL".equals(source.getSourceBizType())) {
                Map<String, Object> context = ledgers.sourceContext(OaRecordSupport.tenantId(), source.getSourceBizType(), source.getSourceBizId());
                if (context != null) {
                    view.setSourceDocumentId(context.get("documentId").toString());
                    view.setSourceVersion(((Number) context.get("sourceVersion")).intValue());
                }
            }
            SysAssetLog log = OaRecordSupport.active(logs.selectById(source.getAssetLogId()));
            if (!"2".equals(log.getRefType()) || !source.getConsumableId().equals(log.getRefId())) {
                throw new IllegalStateException("LEDGER_INCONSISTENT: 原日志关联不一致");
            }
            Map<String, Object> history = new LinkedHashMap<>();
            history.put("logId", log.getLogId().toString());
            history.put("type", log.getType());
            history.put("quantityChange", log.getQuantityChange());
            history.put("remark", log.getRemark());
            history.put("createTime", log.getCreateTime());
            view.setAssetLog(history);
        }
        return view;
    }

    public OaConsumableRequest requestSummary(OaConsumableRequest source) {
        OaConsumableRequest result = new OaConsumableRequest();
        BeanUtils.copyProperties(source, result);
        maskRequest(result);
        return result;
    }

    public void maskRequest(OaConsumableRequest request) {
        if (request.getInstanceId() != null && request.getInstanceId().startsWith("F:")) request.setInstanceId(null);
        if (!costAllowed()) {
            request.setTotalAmount(null);
            request.setIssuedAmount(null);
            request.setReturnedAmount(null);
        }
    }

    public OaConsumableRequestItem requestItem(OaConsumableRequestItem source) {
        OaConsumableRequestItem result = new OaConsumableRequestItem();
        BeanUtils.copyProperties(source, result);
        if (!costAllowed()) {
            result.setUnitPrice(null);
            result.setAmount(null);
            result.setIssuedAmount(null);
            result.setReturnedAmount(null);
        }
        return result;
    }

    public PageResult<ConsumableResults.ReportRow> stockReport(ConsumableQuery query) {
        ConsumableOperationSupport.query(query, true);
        Page<ConsumableResults.ReportRow> page = ledgers.stockReport(new Page<>(query.getPageNum(), query.getPageSize()), OaRecordSupport.tenantId(), query);
        if (!reportCostAllowed()) page.getRecords().forEach(this::maskReport);
        return PageResult.build(page);
    }

    public PageResult<ConsumableResults.ReportRow> usageReport(ConsumableQuery query) {
        ConsumableOperationSupport.query(query, true);
        if (!Set.of("DEPARTMENT", "PERSON", "CONSUMABLE").contains(query.getGroupBy())) throw new IllegalArgumentException("领用报表分组无效");
        DataScope scope = DataScopeUtils.listScope("dept_id", "beneficiary_id");
        boolean allData = Boolean.TRUE.equals(dataScopeHandle.calcScope(scope));
        Page<ConsumableResults.ReportRow> page = ledgers.usageReport(new Page<>(query.getPageNum(), query.getPageSize()),
                OaRecordSupport.tenantId(), query, allData, scope.getDeptList(), scope.getUserId());
        if (!reportCostAllowed()) page.getRecords().forEach(this::maskReport);
        return PageResult.build(page);
    }

    public PageResult<ConsumableResults.ReportRow> costReport(ConsumableQuery query) {
        StpUtil.checkPermission("oa:consumable-report:cost");
        PageResult<ConsumableResults.ReportRow> report = stockReport(query);
        for (ConsumableResults.ReportRow row : report.getRows()) {
            ConsumableQuery usage = new ConsumableQuery();
            usage.setConsumableId(Long.valueOf(row.getConsumableId()));
            usage.setFrom(query.getFrom());
            usage.setTo(query.getTo());
            usage.setDeptId(query.getDeptId());
            usage.setApplicantId(query.getApplicantId());
            List<ConsumableResults.ReportRow> values = usageReport(usage).getRows();
            row.setIssuedAmount(values.isEmpty() ? "0.00" : values.get(0).getIssuedAmount());
            row.setReturnedAmount(values.isEmpty() ? "0.00" : values.get(0).getReturnedAmount());
            row.setNetAmount(values.isEmpty() ? "0.00" : values.get(0).getNetAmount());
        }
        return report;
    }

    public static boolean costAllowed() { return StpUtil.hasPermission("oa:consumable-ledger:cost"); }
    public static boolean reportCostAllowed() { return StpUtil.hasPermission("oa:consumable-report:cost"); }

    private void maskReport(ConsumableResults.ReportRow row) {
        row.setOpeningAmount(null);
        row.setInboundAmount(null);
        row.setInboundCost(null);
        row.setOutboundAmount(null);
        row.setClosingAmount(null);
        row.setIssuedAmount(null);
        row.setReturnedAmount(null);
        row.setNetAmount(null);
        row.setScrapAmount(null);
        row.setAdjustAmount(null);
    }
}
