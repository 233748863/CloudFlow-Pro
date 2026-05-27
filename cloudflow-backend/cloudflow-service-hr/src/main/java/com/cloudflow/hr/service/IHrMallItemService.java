package com.cloudflow.hr.service;

import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.hr.domain.dto.benefit.HrMallItemDTO;
import com.cloudflow.hr.domain.dto.benefit.HrMallItemQueryDTO;
import com.cloudflow.hr.domain.vo.benefit.HrMallItemVO;

public interface IHrMallItemService {

    Long createItem(HrMallItemDTO dto);

    void updateItem(Long itemId, HrMallItemDTO dto);

    PageResult<HrMallItemVO> page(HrMallItemQueryDTO query);

    HrMallItemVO get(Long itemId);

    void onShelf(Long itemId);

    void offShelf(Long itemId);

    int deductStock(Long itemId, Integer quantity);

    int restoreStock(Long itemId, Integer quantity);
}
