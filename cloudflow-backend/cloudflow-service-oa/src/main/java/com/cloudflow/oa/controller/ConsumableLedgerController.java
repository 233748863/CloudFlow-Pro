package com.cloudflow.oa.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.oa.domain.dto.ConsumableCommands;
import com.cloudflow.oa.domain.dto.ConsumableQuery;
import com.cloudflow.oa.domain.vo.ConsumableResults;
import com.cloudflow.oa.service.impl.ConsumableInventoryService;
import com.cloudflow.oa.service.impl.ConsumableMaintenanceService;
import com.cloudflow.oa.service.impl.ConsumableReadService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/consumable")
@RequiredArgsConstructor
public class ConsumableLedgerController {
    private final ConsumableInventoryService inventory;
    private final ConsumableReadService reads;
    private final ConsumableMaintenanceService maintenance;

    @GetMapping("/ledger/list")
    @SaCheckPermission("oa:consumable-ledger:list")
    public R<PageResult<ConsumableResults.LedgerView>> list(ConsumableQuery query) {
        return R.ok(reads.ledgerPage(query));
    }

    @GetMapping("/ledger/{ledgerId}")
    @SaCheckPermission("oa:consumable-ledger:list")
    public R<ConsumableResults.LedgerView> detail(@PathVariable Long ledgerId) {
        return R.ok(reads.ledger(ledgerId));
    }

    @PostMapping("/ledger/{ledgerId}/reverse")
    @SaCheckPermission("oa:consumable-ledger:reverse")
    @RepeatSubmit.Disabled
    @SysLog("耗材台账整笔冲正")
    public R<ConsumableResults.StockPosting> reverse(@PathVariable Long ledgerId, @RequestBody ConsumableCommands.Reverse command) {
        return R.ok(inventory.reverse(ledgerId, command));
    }

    @PostMapping("/{id}/adjust")
    @SaCheckPermission("oa:consumable:adjust")
    @RepeatSubmit.Disabled
    @SysLog("耗材盘盈盘亏")
    public R<ConsumableResults.StockPosting> adjust(@PathVariable Long id, @RequestBody ConsumableCommands.Adjustment command) {
        return R.ok(inventory.adjust(id, command));
    }

    @PostMapping("/{id}/scrap")
    @SaCheckPermission("oa:consumable:scrap")
    @RepeatSubmit.Disabled
    @SysLog("耗材报废")
    public R<ConsumableResults.StockPosting> scrap(@PathVariable Long id, @RequestBody ConsumableCommands.Stock command) {
        return R.ok(inventory.scrap(id, command));
    }

    @PostMapping("/{id}/return")
    @SaCheckPermission("oa:consumable:return")
    @RepeatSubmit.Disabled
    @SysLog("耗材实物退回")
    public R<ConsumableResults.StockPosting> returnStock(@PathVariable Long id, @RequestBody ConsumableCommands.ReturnStock command) {
        return R.ok(inventory.returnStock(id, command));
    }

    @PostMapping("/{id}/recalculate")
    @SaCheckPermission("oa:consumable-ledger:recalculate")
    @RepeatSubmit.Disabled
    @SysLog("耗材库存核对重算")
    public R<ConsumableResults.Recalculation> recalculate(@PathVariable Long id, @RequestBody ConsumableCommands.Recalculate command) {
        return R.ok(maintenance.recalculate(id, command));
    }

    @GetMapping("/reports/stock")
    @SaCheckPermission("oa:consumable-report:list")
    public R<PageResult<ConsumableResults.ReportRow>> stockReport(ConsumableQuery query) {
        return R.ok(reads.stockReport(query));
    }

    @GetMapping("/reports/usage")
    @SaCheckPermission("oa:consumable-report:list")
    public R<PageResult<ConsumableResults.ReportRow>> usageReport(ConsumableQuery query) {
        return R.ok(reads.usageReport(query));
    }

    @GetMapping("/reports/cost")
    @SaCheckPermission({"oa:consumable-report:list", "oa:consumable-report:cost"})
    public R<PageResult<ConsumableResults.ReportRow>> costReport(ConsumableQuery query) {
        return R.ok(reads.costReport(query));
    }
}
