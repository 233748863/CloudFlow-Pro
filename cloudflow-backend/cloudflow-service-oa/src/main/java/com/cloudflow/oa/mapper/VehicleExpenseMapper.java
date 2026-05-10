package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.oa.domain.VehicleExpense;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Mapper;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * 车辆费用 Mapper 接口
 */
@Mapper
public interface VehicleExpenseMapper extends BaseMapper<VehicleExpense> {

    IPage<VehicleExpense> selectExpensePage(Page<VehicleExpense> page,
                                            @Param("query") VehicleExpense query,
                                            @Param("startDate") String startDate,
                                            @Param("endDate") String endDate);

    List<VehicleExpense> selectRecentExpensesByVehicleId(@Param("vehicleId") Long vehicleId,
                                                         @Param("limit") Integer limit);

    Map<String, Object> selectExpenseStats(@Param("startDate") String startDate,
                                           @Param("endDate") String endDate);

    List<Map<String, Object>> selectExpenseGroupByType(@Param("startDate") String startDate,
                                                       @Param("endDate") String endDate);

    BigDecimal sumExpenseAmountByVehicle(@Param("vehicleId") Long vehicleId,
                                         @Param("days") Integer days);
}
