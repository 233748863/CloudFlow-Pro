package com.cloudflow.oa.service;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.oa.domain.SysConsumable;
import com.cloudflow.oa.domain.dto.ConsumableReplenishmentSuggestionDTO;

import java.util.List;

/**
 * 耗材管理 Service 接口
 */
public interface IConsumableService extends IService<SysConsumable> {

    /**
     * 分页查询耗材列表
     */
    IPage<SysConsumable> queryPage(SysConsumable query, int pageNum, int pageSize);

    /**
     * 获取库存不足的耗材列表
     */
    List<SysConsumable> getLowStockList();

    /**
     * 获取补货建议。
     */
    List<ConsumableReplenishmentSuggestionDTO> getReplenishmentSuggestions();

    /**
     * 入库（增加库存）
     */
    boolean addStock(Long consumableId, int quantity, String remark);

    /**
     * 出库（减少库存）
     */
    boolean reduceStock(Long consumableId, int quantity, String stockOutType, String remark);

    /**
     * 是否可删除。
     */
    boolean canDelete(Long consumableId);
}
