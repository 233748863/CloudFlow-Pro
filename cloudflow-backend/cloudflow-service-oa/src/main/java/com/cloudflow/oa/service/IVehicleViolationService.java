package com.cloudflow.oa.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.oa.domain.VehicleViolation;

import java.util.List;

public interface IVehicleViolationService extends IService<VehicleViolation> {

    PageResult<VehicleViolation> queryPage(VehicleViolation violation, PageQuery pageQuery);

    List<VehicleViolation> listByVehicleId(Long vehicleId, Integer limit);
}
