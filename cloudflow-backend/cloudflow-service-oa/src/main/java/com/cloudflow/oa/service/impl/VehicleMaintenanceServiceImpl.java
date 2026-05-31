package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.oa.domain.VehicleMaintenance;
import com.cloudflow.oa.mapper.VehicleMaintenanceMapper;
import com.cloudflow.oa.service.IVehicleMaintenanceService;
import com.cloudflow.common.audit.annotation.Audit;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class VehicleMaintenanceServiceImpl extends ServiceImpl<VehicleMaintenanceMapper, VehicleMaintenance>
        implements IVehicleMaintenanceService {

    @Override
    public PageResult<VehicleMaintenance> queryPage(VehicleMaintenance maintenance, PageQuery pageQuery) {
        LambdaQueryWrapper<VehicleMaintenance> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(maintenance.getVehicleId() != null, VehicleMaintenance::getVehicleId, maintenance.getVehicleId())
                .eq(maintenance.getStatus() != null && !maintenance.getStatus().isBlank(), VehicleMaintenance::getStatus, maintenance.getStatus())
                .orderByDesc(VehicleMaintenance::getMaintenanceDate)
                .orderByDesc(VehicleMaintenance::getCreateTime);
        return PageResult.build(this.page(pageQuery.build(), wrapper));
    }

    @Override
    public List<VehicleMaintenance> listByVehicleId(Long vehicleId, Integer limit) {
        LambdaQueryWrapper<VehicleMaintenance> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(vehicleId != null, VehicleMaintenance::getVehicleId, vehicleId)
                .orderByDesc(VehicleMaintenance::getMaintenanceDate)
                .last(limit != null && limit > 0, "LIMIT " + limit);
        return list(wrapper);
    }
}
