package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.oa.domain.SysVehicle;
import com.cloudflow.oa.domain.vo.VehicleProfileVO;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Mapper;

import java.util.List;

/**
 * 车辆信息 Mapper 接口
 */
@Mapper
public interface SysVehicleMapper extends BaseMapper<SysVehicle> {

    IPage<SysVehicle> selectVehiclePage(Page<SysVehicle> page,
                                        @Param("query") SysVehicle query);

    List<SysVehicle> selectAvailableWithRuntime();
}
