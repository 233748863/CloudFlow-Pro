package com.cloudflow.hr.service;

import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.hr.domain.dto.benefit.HrMallOrderPlaceDTO;
import com.cloudflow.hr.domain.dto.benefit.HrMallOrderQueryDTO;
import com.cloudflow.hr.domain.vo.benefit.HrMallOrderVO;

public interface IHrMallOrderService {

    Long placeOrder(HrMallOrderPlaceDTO dto);

    PageResult<HrMallOrderVO> page(HrMallOrderQueryDTO query);

    PageResult<HrMallOrderVO> listMine(HrMallOrderQueryDTO query);

    HrMallOrderVO get(Long orderId);

    void ship(Long orderId, String expressNo);

    void cancel(Long orderId, String reason);

    void complete(Long orderId);
}
