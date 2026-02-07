package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.oa.domain.SysVehicle;
import com.cloudflow.oa.mapper.SysVehicleMapper;
import com.cloudflow.oa.service.IVehicleService;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.List;

@Service
public class VehicleServiceImpl extends ServiceImpl<SysVehicleMapper, SysVehicle> implements IVehicleService {

    @Override
    public PageResult<SysVehicle> queryPage(SysVehicle vehicle, PageQuery pageQuery) {
        LambdaQueryWrapper<SysVehicle> wrapper = new LambdaQueryWrapper<>();
        wrapper.like(StringUtils.hasText(vehicle.getLicensePlate()), SysVehicle::getLicensePlate, vehicle.getLicensePlate())
               .eq(StringUtils.hasText(vehicle.getStatus()), SysVehicle::getStatus, vehicle.getStatus());
        
        Page<SysVehicle> page = this.page(pageQuery.build(), wrapper);
        return PageResult.build(page);
    }

    @Override
    public List<SysVehicle> listAvailable() {
        return this.list(new LambdaQueryWrapper<SysVehicle>().eq(SysVehicle::getStatus, "1")); // 1=可用
    }
}
