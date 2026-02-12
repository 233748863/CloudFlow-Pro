package com.cloudflow.oa.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.oa.domain.SysAttendanceRecord;
import com.cloudflow.oa.domain.SysAttendanceRule;

import java.util.Map;

public interface IAttendanceService extends IService<SysAttendanceRecord> {
    
    /**
     * 员工打卡
     */
    boolean checkIn(SysAttendanceRecord record);
    
    /**
     * 获取当前适用的考勤规则
     */
    SysAttendanceRule getCurrentRule();
    
    /**
     * 更新考勤规则（新增或修改）
     */
    boolean saveOrUpdateRule(SysAttendanceRule rule);
    
    /**
     * 获取考勤记录列表（分页）
     */
    Map<String, Object> getRecordList(Long userId, String startDate, String endDate, Integer pageNum, Integer pageSize);
    
    /**
     * 获取考勤统计（月度汇总）
     */
    Map<String, Object> getMonthlyStatistics(Long userId, String month);
}
