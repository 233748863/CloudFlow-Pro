package com.cloudflow.oa.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.oa.domain.SysAssetLog;
import com.cloudflow.oa.domain.SysConsumable;
import com.cloudflow.oa.domain.dto.ConsumableStockDTO;
import com.cloudflow.oa.mapper.SysAssetLogMapper;
import com.cloudflow.oa.service.IConsumableService;
import lombok.RequiredArgsConstructor;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 耗材管理 Controller
 * 前端请求路径：/oa/consumable/xxx → 网关 StripPrefix=1 → /consumable/xxx
 */
@RestController
@RequestMapping("/consumable")
@RequiredArgsConstructor
public class ConsumableController {

    private final IConsumableService consumableService;
    private final SysAssetLogMapper assetLogMapper;

    /**
     * 分页查询耗材列表
     */
    @GetMapping("/list")
    @SaCheckPermission("oa:consumable:list")
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
    @SaCheckPermission("oa:consumable:list")
    public R getInfo(@PathVariable("id") Long id) {
        SysConsumable consumable = consumableService.getById(id);
        if (consumable == null) {
            return R.fail("耗材不存在");
        }
        return R.ok(consumable);
    }

    /**
     * 新增耗材 - 管理员/经理
     */
    @SysLog("新增耗材")
    // M0-8: 防重复提交
    @RepeatSubmit
    @PostMapping
    @SaCheckPermission("oa:consumable:add")
    public R add(@RequestBody SysConsumable consumable) {
        consumable.setConsumableId(null);
        consumable.setQuantity(0);
        normalizeWarnFields(consumable);
        consumable.setDeleted(0);
        consumable.setTenantId(UserContext.getTenantId());
        consumable.setCreateBy(UserContext.getUserName());
        consumable.setUpdateBy(UserContext.getUserName());
        return R.result(consumableService.save(consumable));
    }

    /**
     * 修改耗材 - 管理员/经理
     */
    @SysLog("修改耗材")
    @PutMapping
    @SaCheckPermission("oa:consumable:edit")
    public R edit(@RequestBody SysConsumable consumable) {
        if (consumable.getConsumableId() == null) {
            return R.fail("耗材ID不能为空");
        }
        SysConsumable existing = consumableService.getById(consumable.getConsumableId());
        if (existing == null) {
            return R.fail("耗材不存在");
        }
        existing.setName(consumable.getName());
        existing.setModel(consumable.getModel());
        existing.setUnit(consumable.getUnit());
        normalizeWarnFields(consumable);
        existing.setLowStockThreshold(consumable.getLowStockThreshold());
        existing.setDefaultSupplierId(consumable.getDefaultSupplierId());
        existing.setTargetStock(consumable.getTargetStock());
        existing.setWarnEnabled(consumable.getWarnEnabled());
        existing.setUpdateBy(UserContext.getUserName());
        return R.result(consumableService.updateById(existing));
    }

    /**
     * 删除耗材 - 管理员/经理
     */
    @SysLog("删除耗材")
    @DeleteMapping("/{ids}")
    @SaCheckPermission("oa:consumable:remove")
    public R remove(@PathVariable("ids") List<Long> ids) {
        for (Long id : ids) {
            SysConsumable existing = consumableService.getById(id);
            if (existing == null || !Integer.valueOf(0).equals(existing.getDeleted())) {
                return R.fail("耗材不存在");
            }
            if (existing.getQuantity() != null && existing.getQuantity() > 0) {
                return R.fail("库存不为0的耗材不能删除，请先出库或盘亏调整");
            }
            if (!consumableService.canDelete(id)) {
                return R.fail("耗材已被采购申请引用，不能删除");
            }
        }
        for (Long id : ids) {
            SysConsumable consumable = new SysConsumable();
            consumable.setConsumableId(id);
            consumable.setDeleted(1);
            consumable.setUpdateBy(UserContext.getUserName());
            consumableService.updateById(consumable);
        }
        return R.ok();
    }

    /**
     * 获取耗材库存流水。
     */
    @GetMapping("/{id}/logs")
    @SaCheckPermission("oa:consumable:list")
    public R logs(@PathVariable("id") Long id) {
        LambdaQueryWrapper<SysAssetLog> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysAssetLog::getRefId, id)
                .eq(SysAssetLog::getRefType, "2")
                .orderByDesc(SysAssetLog::getCreateTime);
        return R.ok(assetLogMapper.selectList(wrapper));
    }

    /**
     * 获取库存不足的耗材列表
     */
    @GetMapping("/low-stock")
    @SaCheckPermission("oa:consumable:list")
    public R lowStock() {
        return R.ok(consumableService.getLowStockList());
    }

    /**
     * 获取补货建议。
     */
    @GetMapping("/replenishment-suggestions")
    @SaCheckPermission("oa:consumable:list")
    public R replenishmentSuggestions() {
        return R.ok(consumableService.getReplenishmentSuggestions());
    }

    /**
     * 入库操作 - 管理员/经理
     */
    @SysLog("耗材入库")
    // M0-8: 防重复提交
    @RepeatSubmit
    @PostMapping("/{id}/add-stock")
    @SaCheckPermission("oa:consumable:add-stock")
    public R addStock(@PathVariable("id") Long id, @RequestBody ConsumableStockDTO dto) {
        Integer quantity = dto.getQuantity();
        if (quantity == null || quantity <= 0) {
            return R.fail("入库数量必须大于0");
        }
        String remark = toText(dto.getRemark());
        if (!StringUtils.hasText(remark)) {
            return R.fail("入库原因不能为空");
        }
        return R.result(consumableService.addStock(id, quantity, remark));
    }

    /**
     * 出库操作 - 管理员/经理
     */
    @SysLog("耗材出库")
    @PostMapping("/{id}/reduce-stock")
    @SaCheckPermission("oa:consumable:reduce-stock")
    public R reduceStock(@PathVariable("id") Long id, @RequestBody ConsumableStockDTO dto) {
        Integer quantity = dto.getQuantity();
        if (quantity == null || quantity <= 0) {
            return R.fail("出库数量必须大于0");
        }
        String stockOutType = toText(dto.getStockOutType());
        if (!"ISSUE".equals(stockOutType) && !"LOSS".equals(stockOutType)) {
            return R.fail("请选择出库类型");
        }
        String remark = toText(dto.getRemark());
        if (!StringUtils.hasText(remark)) {
            return R.fail("出库原因不能为空");
        }
        boolean result = consumableService.reduceStock(id, quantity, stockOutType, remark);
        if (!result) {
            return R.fail("出库失败，可能库存不足");
        }
        return R.ok();
    }

    private String toText(String value) {
        return value == null ? null : String.valueOf(value).trim();
    }

    private void normalizeWarnFields(SysConsumable consumable) {
        if (consumable.getLowStockThreshold() == null || consumable.getLowStockThreshold() < 0) {
            consumable.setLowStockThreshold(10);
        }
        if (consumable.getTargetStock() == null || consumable.getTargetStock() < 0) {
            consumable.setTargetStock(Math.max(consumable.getLowStockThreshold(), 10));
        }
        if (consumable.getWarnEnabled() == null) {
            consumable.setWarnEnabled(1);
        }
    }
}

