package com.cloudflow.oa.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.oa.domain.VehicleFuelLog;

import java.util.List;
import java.util.Map;

/**
 * OA-P0-1 车辆油耗服务。
 */
public interface IVehicleFuelLogService extends IService<VehicleFuelLog> {

    Page<VehicleFuelLog> queryPage(Long vehicleId, String startDate, String endDate,
                                   Integer pageNum, Integer pageSize);

    List<VehicleFuelLog> listByVehicle(Long vehicleId, Integer limit);

    boolean saveFuelLog(VehicleFuelLog log);

    boolean updateFuelLog(VehicleFuelLog log);

    Map<String, Object> statsByVehicle(Long vehicleId, Integer recentDays);
}
