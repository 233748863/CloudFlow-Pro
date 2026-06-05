package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.oa.domain.SysConsumable;
import org.apache.ibatis.annotations.Mapper;

import java.util.List;

@Mapper
public interface SysConsumableMapper extends BaseMapper<SysConsumable> {

    List<SysConsumable> selectLowStockList();
}
