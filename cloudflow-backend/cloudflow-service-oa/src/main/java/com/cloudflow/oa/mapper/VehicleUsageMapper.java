package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.oa.domain.VehicleUsage;
import com.cloudflow.oa.domain.vo.VehicleScheduleItemVO;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Mapper;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 用车申请 Mapper 接口
 */
@Mapper
public interface VehicleUsageMapper extends BaseMapper<VehicleUsage> {

    IPage<VehicleUsage> selectUsagePage(Page<VehicleUsage> page,
                                        @Param("query") VehicleUsage query);

    VehicleUsage selectUsageDetail(@Param("usageId") Long usageId);

    VehicleUsage selectCurrentUsageByVehicleId(@Param("vehicleId") Long vehicleId);

    VehicleUsage selectNextUsageByVehicleId(@Param("vehicleId") Long vehicleId);

    List<VehicleUsage> selectRecentUsagesByVehicleId(@Param("vehicleId") Long vehicleId,
                                                     @Param("limit") Integer limit);

    List<VehicleScheduleItemVO> selectSchedule(@Param("vehicleId") Long vehicleId,
                                               @Param("startDate") LocalDateTime startDate,
                                               @Param("endDate") LocalDateTime endDate);
}
