package com.cloudflow.oa.mapper;

import com.baomidou.dynamic.datasource.annotation.DS;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.common.datasource.constants.DsConstants;
import com.cloudflow.oa.domain.AttendanceAppeal;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

/**
 * 补卡/外勤申请 Mapper 接口
 */
@DS(DsConstants.MASTER)
@Mapper
public interface AttendanceAppealMapper extends BaseMapper<AttendanceAppeal> {

    /**
     * 获取今日最大申请单号序号
     */
    @Select("SELECT MAX(CAST(SUBSTRING(appeal_no, 11) AS UNSIGNED)) FROM biz_attendance_appeal WHERE appeal_no LIKE CONCAT('BK', DATE_FORMAT(NOW(), '%Y%m%d'), '%')")
    Integer getTodayMaxSeq();
}
