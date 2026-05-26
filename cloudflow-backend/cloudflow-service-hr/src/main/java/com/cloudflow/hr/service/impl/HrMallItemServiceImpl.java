package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.web.MapConverters;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.hr.domain.dto.benefit.HrMallItemDTO;
import com.cloudflow.hr.domain.dto.benefit.HrMallItemQueryDTO;
import com.cloudflow.hr.domain.entity.HrMallItem;
import com.cloudflow.hr.domain.vo.benefit.HrMallItemVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrMallItemMapper;
import com.cloudflow.hr.service.HrMallItemService;
import com.cloudflow.hr.service.HrTypedCrudService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class HrMallItemServiceImpl implements HrMallItemService {

    private static final long DEFAULT_TENANT_ID = 100000L;

    private final HrMallItemMapper itemMapper;
    private final HrTypedCrudService crudService;
    private final ObjectMapper objectMapper;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long createItem(HrMallItemDTO dto) {
        HrMallItem item = objectMapper.convertValue(dto, HrMallItem.class);
        item.setTenantId(currentTenantId());
        if (!StringUtils.hasText(item.getItemNo())) {
            item.setItemNo("MI-" + System.currentTimeMillis());
        }
        if (!StringUtils.hasText(item.getStatus())) {
            item.setStatus("OFF_SHELF");
        }
        if (item.getStock() == null) {
            item.setStock(0);
        }
        if (item.getSalesCount() == null) {
            item.setSalesCount(0);
        }
        item.setDeleted(0);
        item.setCreateBy(currentUserName());
        item.setUpdateBy(currentUserName());
        itemMapper.insert(item);
        return item.getId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void updateItem(Long itemId, HrMallItemDTO dto) {
        crudService.updateProperties(HrMallItem.class, itemId,
                MapConverters.toMap(dto, objectMapper));
    }

    @Override
    public PageResult<HrMallItemVO> page(HrMallItemQueryDTO query) {
        Map<String, Object> raw = crudService.page(HrMallItem.class,
                MapConverters.toServiceQuery(query, objectMapper));
        return MapConverters.toPageResult(raw, HrMallItemVO.class, objectMapper);
    }

    @Override
    public HrMallItemVO get(Long itemId) {
        Map<String, Object> raw = crudService.get(HrMallItem.class, itemId);
        return MapConverters.toVO(raw, HrMallItemVO.class, objectMapper);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void onShelf(Long itemId) {
        UpdateWrapper<HrMallItem> uw = new UpdateWrapper<>();
        uw.eq("id", itemId).eq("tenant_id", currentTenantId())
                .set("status", "ON_SHELF")
                .set("update_time", LocalDateTime.now())
                .set("update_by", currentUserName());
        int rows = itemMapper.update(null, uw);
        if (rows == 0) {
            throw new HrBusinessException("MALL_ITEM_NOT_FOUND", "商品不存在：" + itemId);
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void offShelf(Long itemId) {
        UpdateWrapper<HrMallItem> uw = new UpdateWrapper<>();
        uw.eq("id", itemId).eq("tenant_id", currentTenantId())
                .set("status", "OFF_SHELF")
                .set("update_time", LocalDateTime.now())
                .set("update_by", currentUserName());
        int rows = itemMapper.update(null, uw);
        if (rows == 0) {
            throw new HrBusinessException("MALL_ITEM_NOT_FOUND", "商品不存在：" + itemId);
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public int deductStock(Long itemId, Integer quantity) {
        if (quantity == null || quantity <= 0) {
            throw new HrBusinessException("INVALID_QUANTITY", "数量必须为正数");
        }
        int rows = itemMapper.deductStock(itemId, currentTenantId(), quantity);
        if (rows == 0) {
            throw new HrBusinessException("INSUFFICIENT_STOCK", "商品库存不足或已下架：" + itemId);
        }
        return rows;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public int restoreStock(Long itemId, Integer quantity) {
        if (quantity == null || quantity <= 0) {
            return 0;
        }
        return itemMapper.restoreStock(itemId, currentTenantId(), quantity);
    }

    private long currentTenantId() {
        Long tenantId = TenantContext.getTenantId();
        if (tenantId != null) {
            return tenantId;
        }
        tenantId = UserContext.getTenantId();
        return tenantId == null ? DEFAULT_TENANT_ID : tenantId;
    }

    private String currentUserName() {
        return StringUtils.hasText(UserContext.getUserName()) ? UserContext.getUserName() : "system";
    }
}
