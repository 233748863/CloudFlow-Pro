package com.cloudflow.oa.mapper;

import com.baomidou.dynamic.datasource.annotation.DS;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.datasource.constants.DsConstants;
import com.cloudflow.common.datascope.DataScope;
import com.cloudflow.oa.domain.BusinessTrip;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * 出差申请 Mapper 接口
 */
@DS(DsConstants.MASTER)
@Mapper
public interface BusinessTripMapper extends BaseMapper<BusinessTrip> {

    IPage<BusinessTrip> selectPageByDataScope(Page<BusinessTrip> page,
                                              @Param("query") BusinessTrip query,
                                              @Param("dataScope") DataScope dataScope);

    /**
     * 获取今日最大出差单号序号
     */
    Integer getTodayMaxSeq();
}
