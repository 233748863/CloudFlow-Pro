package com.cloudflow.oa.mapper;

import com.baomidou.dynamic.datasource.annotation.DS;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.common.datasource.constants.DsConstants;
import com.cloudflow.oa.domain.LeaveRequest;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

/**
 * 请假申请 Mapper 接口
 * <p>
 * 使用 @DS 注解指定数据源：
 * - @DS(DsConstants.MASTER) 或不加注解 → 使用主数据源（默认）
 * - @DS(DsConstants.REPORT) → 使用报表数据源
 * - @DS("自定义名称") → 使用 Nacos 中配置的对应数据源
 * </p>
 */
@DS(DsConstants.MASTER)
@Mapper
public interface LeaveRequestMapper extends BaseMapper<LeaveRequest> {

    /**
     * 获取今日最大请假单号序号
     */
    @Select("SELECT MAX(CAST(SUBSTRING(leave_no, 11) AS UNSIGNED)) FROM biz_leave_request WHERE leave_no LIKE CONCAT('QJ', DATE_FORMAT(NOW(), '%Y%m%d'), '%')")
    Integer getTodayMaxSeq();
}
