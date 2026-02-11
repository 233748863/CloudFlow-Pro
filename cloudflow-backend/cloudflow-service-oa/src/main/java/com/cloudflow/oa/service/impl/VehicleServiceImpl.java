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

import java.util.*;

@Service
public class VehicleServiceImpl extends ServiceImpl<SysVehicleMapper, SysVehicle> implements IVehicleService {

    @Override
    public PageResult<SysVehicle> queryPage(SysVehicle vehicle, PageQuery pageQuery) {
        LambdaQueryWrapper<SysVehicle> wrapper = new LambdaQueryWrapper<>();
        wrapper.like(StringUtils.hasText(vehicle.getLicensePlate()), SysVehicle::getLicensePlate, vehicle.getLicensePlate())
               .eq(StringUtils.hasText(vehicle.getStatus()), SysVehicle::getStatus, vehicle.getStatus())
               .orderByDesc(SysVehicle::getCreateTime);
        
        Page<SysVehicle> page = this.page(pageQuery.build(), wrapper);
        return PageResult.build(page);
    }

    @Override
    public List<SysVehicle> listAvailable() {
        return this.list(new LambdaQueryWrapper<SysVehicle>().eq(SysVehicle::getStatus, "1")); // 1=可用
    }

    @Override
    public Map<String, Object> getVehicleStats() {
        List<SysVehicle> allVehicles = this.list();
        Map<String, Object> stats = new HashMap<>();
        stats.put("total", allVehicles.size());
        stats.put("available", allVehicles.stream().filter(v -> "1".equals(v.getStatus())).count());
        stats.put("booked", allVehicles.stream().filter(v -> "2".equals(v.getStatus())).count());
        stats.put("inUse", allVehicles.stream().filter(v -> "3".equals(v.getStatus())).count());
        stats.put("maintenance", allVehicles.stream().filter(v -> "4".equals(v.getStatus())).count());
        stats.put("scrapped", allVehicles.stream().filter(v -> "5".equals(v.getStatus())).count());
        // 保险即将到期（30天内）
        Date now = new Date();
        Calendar cal = Calendar.getInstance();
        cal.setTime(now);
        cal.add(Calendar.DAY_OF_MONTH, 30);
        Date thirtyDaysLater = cal.getTime();
        long insuranceExpiringSoon = allVehicles.stream()
                .filter(v -> v.getInsuranceExpiry() != null 
                        && v.getInsuranceExpiry().after(now) 
                        && v.getInsuranceExpiry().before(thirtyDaysLater))
                .count();
        stats.put("insuranceExpiringSoon", insuranceExpiringSoon);
        return stats;
    }
}
