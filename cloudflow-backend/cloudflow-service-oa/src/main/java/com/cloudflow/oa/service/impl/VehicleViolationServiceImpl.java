package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.oa.domain.VehicleViolation;
import com.cloudflow.oa.mapper.VehicleViolationMapper;
import com.cloudflow.oa.service.IVehicleViolationService;
import com.cloudflow.common.audit.annotation.Audit;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class VehicleViolationServiceImpl extends ServiceImpl<VehicleViolationMapper, VehicleViolation>
        implements IVehicleViolationService {

    @Override
    public PageResult<VehicleViolation> queryPage(VehicleViolation violation, PageQuery pageQuery) {
        LambdaQueryWrapper<VehicleViolation> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(violation.getVehicleId() != null, VehicleViolation::getVehicleId, violation.getVehicleId())
                .eq(violation.getUsageId() != null, VehicleViolation::getUsageId, violation.getUsageId())
                .eq(violation.getStatus() != null && !violation.getStatus().isBlank(), VehicleViolation::getStatus, violation.getStatus())
                .orderByDesc(VehicleViolation::getViolationTime)
                .orderByDesc(VehicleViolation::getCreateTime);
        return PageResult.build(this.page(pageQuery.build(), wrapper));
    }

    @Override
    public List<VehicleViolation> listByVehicleId(Long vehicleId, Integer limit) {
        LambdaQueryWrapper<VehicleViolation> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(vehicleId != null, VehicleViolation::getVehicleId, vehicleId)
                .orderByDesc(VehicleViolation::getViolationTime)
                .last(limit != null && limit > 0, "LIMIT " + limit);
        return list(wrapper);
    }
}
