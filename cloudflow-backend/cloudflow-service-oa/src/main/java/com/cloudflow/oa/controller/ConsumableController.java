package com.cloudflow.oa.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.oa.domain.SysAssetLog;
import com.cloudflow.oa.domain.SysConsumable;
import com.cloudflow.oa.domain.dto.ConsumableCommands;
import com.cloudflow.oa.domain.dto.ConsumableReplenishmentSuggestionDTO;
import com.cloudflow.oa.domain.dto.ConsumableStockDTO;
import com.cloudflow.oa.domain.vo.ConsumableResults;
import com.cloudflow.oa.service.IConsumableService;
import com.cloudflow.oa.service.impl.ConsumableInventoryService;
import com.cloudflow.oa.service.impl.ConsumableReadService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/consumable")
@RequiredArgsConstructor
public class ConsumableController {
    private final IConsumableService consumableService;
    private final ConsumableInventoryService inventory;
    private final ConsumableReadService reads;

    @GetMapping("/list")
    @SaCheckPermission("oa:consumable:list")
    public R<IPage<SysConsumable>> list(SysConsumable query, @RequestParam(defaultValue = "1") Integer pageNum,
                                       @RequestParam(defaultValue = "10") Integer pageSize) {
        IPage<SysConsumable> page = consumableService.queryPage(query, pageNum, pageSize);
        page.setRecords(page.getRecords().stream().map(reads::maskStock).toList());
        return R.ok(page);
    }

    @GetMapping("/{id}")
    @SaCheckPermission("oa:consumable:list")
    public R<SysConsumable> getInfo(@PathVariable Long id) { return R.ok(reads.stock(id)); }

    @PostMapping
    @SaCheckPermission("oa:consumable:add")
    @RepeatSubmit
    @SysLog("新增耗材")
    public R<Void> add(@RequestBody ConsumableCommands.MasterData command) {
        consumableService.createMaterial(command);
        return R.ok();
    }

    @PutMapping
    @SaCheckPermission("oa:consumable:edit")
    @RepeatSubmit
    @SysLog("修改耗材")
    public R<Void> edit(@RequestBody ConsumableCommands.MasterData command) {
        consumableService.editMaterial(command);
        return R.ok();
    }

    @DeleteMapping("/{ids}")
    @SaCheckPermission("oa:consumable:remove")
    @SysLog("删除耗材")
    public R<Void> remove(@PathVariable List<Long> ids) {
        consumableService.deleteMaterials(ids);
        return R.ok();
    }

    @GetMapping("/{id}/logs")
    @SaCheckPermission("oa:consumable:list")
    public R<List<SysAssetLog>> logs(@PathVariable Long id) { return R.ok(reads.logs(id)); }

    @GetMapping("/low-stock")
    @SaCheckPermission("oa:consumable:list")
    public R<List<SysConsumable>> lowStock() {
        return R.ok(consumableService.getLowStockList().stream().map(reads::maskStock).toList());
    }

    @GetMapping("/replenishment-suggestions")
    @SaCheckPermission("oa:consumable:list")
    public R<List<ConsumableReplenishmentSuggestionDTO>> replenishmentSuggestions() {
        return R.ok(consumableService.getReplenishmentSuggestions());
    }

    @PostMapping("/{id}/add-stock")
    @SaCheckPermission("oa:consumable:add-stock")
    @RepeatSubmit.Disabled
    @SysLog("耗材入库")
    public R<ConsumableResults.StockPosting> addStock(@PathVariable Long id, @RequestBody ConsumableCommands.Stock command) {
        return R.ok(inventory.inbound(id, command));
    }

    @PostMapping("/{id}/reduce-stock")
    @SaCheckPermission("oa:consumable:reduce-stock")
    @RepeatSubmit.Disabled
    @SysLog("耗材出库")
    public R<Object> reduceStock(@PathVariable Long id, @RequestBody ConsumableStockDTO command) {
        return R.ok(inventory.reduce(id, command));
    }
}
