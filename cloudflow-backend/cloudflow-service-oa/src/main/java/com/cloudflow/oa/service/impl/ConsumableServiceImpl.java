package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.oa.domain.BizPurchaseItem;
import com.cloudflow.oa.domain.SysAssetLog;
import com.cloudflow.oa.domain.SysConsumable;
import com.cloudflow.oa.domain.SysSupplier;
import com.cloudflow.oa.domain.dto.ConsumableReplenishmentSuggestionDTO;
import com.cloudflow.oa.mapper.BizPurchaseItemMapper;
import com.cloudflow.oa.mapper.SysAssetLogMapper;
import com.cloudflow.oa.mapper.SysConsumableMapper;
import com.cloudflow.oa.mapper.SysSupplierMapper;
import com.cloudflow.oa.service.IConsumableService;
import com.cloudflow.common.audit.annotation.Audit;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 耗材管理 Service 实现类
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ConsumableServiceImpl extends ServiceImpl<SysConsumableMapper, SysConsumable>
        implements IConsumableService {

    private final SysAssetLogMapper assetLogMapper;
    private final BizPurchaseItemMapper purchaseItemMapper;
    private final SysSupplierMapper supplierMapper;

    @Override
    public IPage<SysConsumable> queryPage(SysConsumable query, int pageNum, int pageSize) {
        LambdaQueryWrapper<SysConsumable> wrapper = new LambdaQueryWrapper<>();

        // 按名称模糊搜索
        if (StringUtils.hasText(query.getName())) {
            wrapper.like(SysConsumable::getName, query.getName());
        }
        // 按型号模糊搜索
        if (StringUtils.hasText(query.getModel())) {
            wrapper.like(SysConsumable::getModel, query.getModel());
        }
        wrapper.eq(SysConsumable::getDeleted, "0");
        // 按创建时间倒序
        wrapper.orderByDesc(SysConsumable::getCreateTime);

        return page(new Page<>(pageNum, pageSize), wrapper);
    }

    @Override
    public List<SysConsumable> getLowStockList() {
        // 查询库存数量 <= 低库存阈值的耗材
        LambdaQueryWrapper<SysConsumable> wrapper = new LambdaQueryWrapper<>();
        wrapper.apply("quantity <= low_stock_threshold");
        wrapper.eq(SysConsumable::getWarnEnabled, 1);
        wrapper.eq(SysConsumable::getDeleted, "0");
        wrapper.orderByAsc(SysConsumable::getQuantity);
        return list(wrapper);
    }

    @Override
    public List<ConsumableReplenishmentSuggestionDTO> getReplenishmentSuggestions() {
        return getLowStockList().stream().map(this::toSuggestion).toList();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean addStock(Long consumableId, int quantity, String remark) {
        if (quantity <= 0) {
            log.warn("入库数量必须大于0，consumableId: {}, quantity: {}", consumableId, quantity);
            return false;
        }
        SysConsumable consumable = getById(consumableId);
        if (consumable == null || !Integer.valueOf(0).equals(consumable.getDeleted())) {
            return false;
        }
        consumable.setQuantity(consumable.getQuantity() + quantity);
        consumable.setUpdateBy(UserContext.getUserName());
        consumable.setUpdateTime(LocalDateTime.now());
        log.info("耗材入库：{}，入库数量: {}，当前库存: {}", consumable.getName(), quantity, consumable.getQuantity());
        boolean updated = updateById(consumable);
        if (updated) {
            saveStockLog(consumableId, "入库", quantity, remark);
        }
        return updated;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean reduceStock(Long consumableId, int quantity, String stockOutType, String remark) {
        if (quantity <= 0) {
            log.warn("出库数量必须大于0，consumableId: {}, quantity: {}", consumableId, quantity);
            return false;
        }
        if (!StringUtils.hasText(stockOutType)) {
            log.warn("出库类型不能为空，consumableId: {}", consumableId);
            return false;
        }
        SysConsumable consumable = getById(consumableId);
        if (consumable == null || !Integer.valueOf(0).equals(consumable.getDeleted())) {
            return false;
        }
        if (consumable.getQuantity() < quantity) {
            log.warn("耗材库存不足：{}，当前库存: {}，请求出库: {}", consumable.getName(), consumable.getQuantity(), quantity);
            return false;
        }
        consumable.setQuantity(consumable.getQuantity() - quantity);
        consumable.setUpdateBy(UserContext.getUserName());
        consumable.setUpdateTime(LocalDateTime.now());
        log.info("耗材出库：{}，出库数量: {}，剩余库存: {}", consumable.getName(), quantity, consumable.getQuantity());
        boolean updated = updateById(consumable);
        if (updated) {
            String type = "LOSS".equals(stockOutType) ? "盘亏调整" : "领用出库";
            saveStockLog(consumableId, type, -quantity, remark);
        }
        return updated;
    }

    @Override
    @Audit(name = "校验耗材删除", highRisk = true)
    public boolean canDelete(Long consumableId) {
        if (consumableId == null) {
            return false;
        }
        Long count = purchaseItemMapper.selectCount(new LambdaQueryWrapper<BizPurchaseItem>()
                .eq(BizPurchaseItem::getConsumableId, consumableId));
        return count == null || count == 0;
    }

    private void saveStockLog(Long consumableId, String type, Integer quantityChange, String remark) {
        SysAssetLog logRecord = new SysAssetLog();
        logRecord.setTenantId(UserContext.getTenantId());
        logRecord.setRefId(consumableId);
        logRecord.setRefType("2");
        logRecord.setType(type);
        logRecord.setQuantityChange(quantityChange);
        logRecord.setOperatorId(UserContext.getUserId());
        logRecord.setRemark(remark);
        logRecord.setCreateTime(LocalDateTime.now());
        assetLogMapper.insert(logRecord);
    }

    private ConsumableReplenishmentSuggestionDTO toSuggestion(SysConsumable consumable) {
        ConsumableReplenishmentSuggestionDTO suggestion = new ConsumableReplenishmentSuggestionDTO();
        suggestion.setConsumableId(consumable.getConsumableId());
        suggestion.setName(consumable.getName());
        suggestion.setModel(consumable.getModel());
        suggestion.setUnit(consumable.getUnit());
        suggestion.setQuantity(consumable.getQuantity());
        suggestion.setLowStockThreshold(consumable.getLowStockThreshold());
        suggestion.setTargetStock(consumable.getTargetStock());
        suggestion.setDefaultSupplierId(consumable.getDefaultSupplierId());
        int targetStock = consumable.getTargetStock() == null ? 0 : consumable.getTargetStock();
        int quantity = consumable.getQuantity() == null ? 0 : consumable.getQuantity();
        suggestion.setSuggestedQuantity(Math.max(targetStock - quantity, 0));
        if (consumable.getDefaultSupplierId() != null) {
            SysSupplier supplier = supplierMapper.selectById(consumable.getDefaultSupplierId());
            if (supplier != null && Integer.valueOf(0).equals(supplier.getDeleted())) {
                suggestion.setDefaultSupplierName(supplier.getSupplierName());
            }
        }
        return suggestion;
    }
}
