package com.cloudflow.oa.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.oa.domain.VehicleMaintenance;

import java.util.List;

public interface IVehicleMaintenanceService extends IService<VehicleMaintenance> {

    PageResult<VehicleMaintenance> queryPage(VehicleMaintenance maintenance, PageQuery pageQuery);

    List<VehicleMaintenance> listByVehicleId(Long vehicleId, Integer limit);
}
