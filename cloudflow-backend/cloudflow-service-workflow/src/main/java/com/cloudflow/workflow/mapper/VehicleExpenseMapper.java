package com.cloudflow.workflow.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.workflow.domain.VehicleExpense;
import org.apache.ibatis.annotations.Mapper;

/**
 * 车辆费用 Mapper 接口
 */
@Mapper
public interface VehicleExpenseMapper extends BaseMapper<VehicleExpense> {
}
