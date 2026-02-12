package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.oa.domain.SysConsumable;
import com.cloudflow.oa.mapper.SysConsumableMapper;
import com.cloudflow.oa.service.IConsumableService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.List;

/**
 * 耗材管理 Service 实现类
 */
@Slf4j
@Service
public class ConsumableServiceImpl extends ServiceImpl<SysConsumableMapper, SysConsumable>
        implements IConsumableService {

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
        // 按创建时间倒序
        wrapper.orderByDesc(SysConsumable::getCreateTime);

        return page(new Page<>(pageNum, pageSize), wrapper);
    }

    @Override
    public List<SysConsumable> getLowStockList() {
        // 查询库存数量 <= 低库存阈值的耗材
        LambdaQueryWrapper<SysConsumable> wrapper = new LambdaQueryWrapper<>();
        wrapper.apply("quantity <= low_stock_threshold");
        wrapper.orderByAsc(SysConsumable::getQuantity);
        return list(wrapper);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean addStock(Long consumableId, int quantity) {
        if (quantity <= 0) {
            log.warn("入库数量必须大于0，consumableId: {}, quantity: {}", consumableId, quantity);
            return false;
        }
        SysConsumable consumable = getById(consumableId);
        if (consumable == null) {
            return false;
        }
        consumable.setQuantity(consumable.getQuantity() + quantity);
        log.info("耗材入库：{}，入库数量: {}，当前库存: {}", consumable.getName(), quantity, consumable.getQuantity());
        return updateById(consumable);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean reduceStock(Long consumableId, int quantity) {
        if (quantity <= 0) {
            log.warn("出库数量必须大于0，consumableId: {}, quantity: {}", consumableId, quantity);
            return false;
        }
        SysConsumable consumable = getById(consumableId);
        if (consumable == null) {
            return false;
        }
        if (consumable.getQuantity() < quantity) {
            log.warn("耗材库存不足：{}，当前库存: {}，请求出库: {}", consumable.getName(), consumable.getQuantity(), quantity);
            return false;
        }
        consumable.setQuantity(consumable.getQuantity() - quantity);
        log.info("耗材出库：{}，出库数量: {}，剩余库存: {}", consumable.getName(), quantity, consumable.getQuantity());
        return updateById(consumable);
    }
}
