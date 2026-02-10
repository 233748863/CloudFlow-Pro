package com.cloudflow.oa.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.oa.domain.SysAttendanceRecord;
import com.cloudflow.oa.domain.SysAttendanceRule;

public interface IAttendanceService extends IService<SysAttendanceRecord> {
    
    /**
     * 员工打卡
     */
    boolean checkIn(SysAttendanceRecord record);
    
    /**
     * 获取当前适用的考勤规则
     */
    SysAttendanceRule getCurrentRule();
}
