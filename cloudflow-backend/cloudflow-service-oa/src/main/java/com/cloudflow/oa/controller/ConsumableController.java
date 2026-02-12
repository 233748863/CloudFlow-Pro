package com.cloudflow.oa.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.oa.domain.SysConsumable;
import com.cloudflow.oa.service.IConsumableService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 耗材管理 Controller
 * 前端请求路径：/oa/consumable/xxx → 网关 StripPrefix=1 → /consumable/xxx
 */
@RestController
@RequestMapping("/consumable")
@RequiredArgsConstructor
public class ConsumableController {

    private final IConsumableService consumableService;

    /**
     * 分页查询耗材列表
     */
    @GetMapping("/list")
    public R list(SysConsumable query,
                  @RequestParam(value = "pageNum", defaultValue = "1") Integer pageNum,
                  @RequestParam(value = "pageSize", defaultValue = "10") Integer pageSize) {
        IPage<SysConsumable> page = consumableService.queryPage(query, pageNum, pageSize);
        return R.ok(page);
    }

    /**
     * 获取耗材详情
     */
    @GetMapping("/{id}")
    public R getInfo(@PathVariable("id") Long id) {
        SysConsumable consumable = consumableService.getById(id);
        if (consumable == null) {
            return R.fail("耗材不存在");
        }
        return R.ok(consumable);
    }

    /**
     * 新增耗材
     */
    @PostMapping
    public R add(@RequestBody SysConsumable consumable) {
        return R.result(consumableService.save(consumable));
    }

    /**
     * 修改耗材
     */
    @PutMapping
    public R edit(@RequestBody SysConsumable consumable) {
        if (consumable.getConsumableId() == null) {
            return R.fail("耗材ID不能为空");
        }
        return R.result(consumableService.updateById(consumable));
    }

    /**
     * 删除耗材
     */
    @DeleteMapping("/{ids}")
    public R remove(@PathVariable("ids") List<Long> ids) {
        return R.result(consumableService.removeBatchByIds(ids));
    }

    /**
     * 获取库存不足的耗材列表
     */
    @GetMapping("/low-stock")
    public R lowStock() {
        return R.ok(consumableService.getLowStockList());
    }

    /**
     * 入库操作
     */
    @PostMapping("/{id}/add-stock")
    public R addStock(@PathVariable("id") Long id, @RequestBody Map<String, Integer> params) {
        Integer quantity = params.get("quantity");
        if (quantity == null || quantity <= 0) {
            return R.fail("入库数量必须大于0");
        }
        return R.result(consumableService.addStock(id, quantity));
    }

    /**
     * 出库操作
     */
    @PostMapping("/{id}/reduce-stock")
    public R reduceStock(@PathVariable("id") Long id, @RequestBody Map<String, Integer> params) {
        Integer quantity = params.get("quantity");
        if (quantity == null || quantity <= 0) {
            return R.fail("出库数量必须大于0");
        }
        boolean result = consumableService.reduceStock(id, quantity);
        if (!result) {
            return R.fail("出库失败，可能库存不足");
        }
        return R.ok();
    }
}
