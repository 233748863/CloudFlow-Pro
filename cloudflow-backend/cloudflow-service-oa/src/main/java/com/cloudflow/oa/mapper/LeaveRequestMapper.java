package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.oa.domain.LeaveRequest;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

/**
 * 请假申请 Mapper 接口
 */
@Mapper
public interface LeaveRequestMapper extends BaseMapper<LeaveRequest> {

    /**
     * 获取今日最大请假单号序号
     */
    @Select("SELECT MAX(CAST(SUBSTRING(leave_no, 11) AS UNSIGNED)) FROM biz_leave_request WHERE leave_no LIKE CONCAT('QJ', DATE_FORMAT(NOW(), '%Y%m%d'), '%')")
    Integer getTodayMaxSeq();
}
