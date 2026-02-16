package com.cloudflow.oa.mapper;

import com.baomidou.dynamic.datasource.annotation.DS;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.common.datasource.constants.DsConstants;
import com.cloudflow.oa.domain.OvertimeRequest;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

/**
 * 加班申请 Mapper 接口
 */
@DS(DsConstants.MASTER)
@Mapper
public interface OvertimeRequestMapper extends BaseMapper<OvertimeRequest> {

    /**
     * 获取今日最大加班单号序号
     */
    @Select("SELECT MAX(CAST(SUBSTRING(overtime_no, 11) AS UNSIGNED)) FROM biz_overtime_request WHERE overtime_no LIKE CONCAT('JB', DATE_FORMAT(NOW(), '%Y%m%d'), '%')")
    Integer getTodayMaxSeq();
}
