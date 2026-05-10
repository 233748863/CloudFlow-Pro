package com.cloudflow.oa.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.oa.domain.VehicleExpense;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import java.util.Map;

/**
 * 车辆费用服务接口
 */
public interface IVehicleExpenseService extends IService<VehicleExpense> {

    /**
     * 分页查询费用
     */
    PageResult<VehicleExpense> queryPage(VehicleExpense expense, PageQuery pageQuery, String startDate, String endDate);

    /**
     * 统计费用 (按车辆、类型等)
     */
    Map<String, Object> getExpenseStats(String startDate, String endDate);

    java.util.List<VehicleExpense> listRecentByVehicleId(Long vehicleId, Integer limit);
}
