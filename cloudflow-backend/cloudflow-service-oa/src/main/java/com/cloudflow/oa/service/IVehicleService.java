package com.cloudflow.oa.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.oa.domain.SysVehicle;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.oa.domain.vo.DynamicMapVO;
import com.cloudflow.oa.domain.vo.VehicleProfileVO;
import com.cloudflow.oa.domain.vo.VehicleScheduleItemVO;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 车辆服务接口
 */
public interface IVehicleService extends IService<SysVehicle> {

    /**
     * 分页查询车辆列表
     */
    PageResult<SysVehicle> queryPage(SysVehicle vehicle, PageQuery pageQuery);

    /**
     * 获取可用车辆列表
     */
    List<SysVehicle> listAvailable();

    /**
     * 获取车辆统计概览（各状态数量、保险即将到期等）
     */
    DynamicMapVO getVehicleStats();

    VehicleProfileVO getVehicleProfile(Long vehicleId);

    List<VehicleScheduleItemVO> getVehicleSchedule(Long vehicleId, LocalDateTime startDate, LocalDateTime endDate);
}
