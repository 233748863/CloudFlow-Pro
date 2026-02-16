package com.cloudflow.oa.mapper;

import com.baomidou.dynamic.datasource.annotation.DS;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.common.datasource.constants.DsConstants;
import com.cloudflow.oa.domain.BusinessTrip;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

/**
 * 出差申请 Mapper 接口
 */
@DS(DsConstants.MASTER)
@Mapper
public interface BusinessTripMapper extends BaseMapper<BusinessTrip> {

    /**
     * 获取今日最大出差单号序号
     */
    @Select("SELECT MAX(CAST(SUBSTRING(trip_no, 11) AS UNSIGNED)) FROM biz_business_trip WHERE trip_no LIKE CONCAT('CC', DATE_FORMAT(NOW(), '%Y%m%d'), '%')")
    Integer getTodayMaxSeq();
}
