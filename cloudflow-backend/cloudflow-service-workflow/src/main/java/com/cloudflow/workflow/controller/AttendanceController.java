package com.cloudflow.workflow.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.workflow.domain.SysAttendanceRecord;
import com.cloudflow.workflow.domain.SysAttendanceRule;
import com.cloudflow.workflow.service.IAttendanceService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/workflow/attendance")
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
