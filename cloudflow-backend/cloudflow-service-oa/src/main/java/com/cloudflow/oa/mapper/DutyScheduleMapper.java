package com.cloudflow.oa.mapper;

import com.baomidou.dynamic.datasource.annotation.DS;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.datasource.constants.DsConstants;
import com.cloudflow.common.datascope.DataScope;
import com.cloudflow.oa.domain.DutySchedule;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * 值班排班 Mapper 接口
 */
@DS(DsConstants.MASTER)
@Mapper
public interface DutyScheduleMapper extends BaseMapper<DutySchedule> {

    IPage<DutySchedule> selectPageByDataScope(Page<DutySchedule> page,
                                              @Param("query") DutySchedule query,
                                              @Param("dataScope") DataScope dataScope);
}
