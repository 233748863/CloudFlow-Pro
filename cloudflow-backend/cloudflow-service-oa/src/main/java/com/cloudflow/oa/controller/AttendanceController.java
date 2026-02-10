package com.cloudflow.oa.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.oa.domain.SysAttendanceRecord;
import com.cloudflow.oa.domain.SysAttendanceRule;
import com.cloudflow.oa.service.IAttendanceService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/attendance")
public class AttendanceController {

    @Autowired
    private IAttendanceService attendanceService;

    /**
     * 打卡 (签到/签退)
     */
    @PostMapping("/checkin")
    public R<Boolean> checkIn(@RequestBody SysAttendanceRecord record) {
        return R.ok(attendanceService.checkIn(record));
    }

    /**
     * 获取当前考勤规则
     */
    @GetMapping("/rule")
    public R<SysAttendanceRule> getRule() {
        return R.ok(attendanceService.getCurrentRule());
    }
}
