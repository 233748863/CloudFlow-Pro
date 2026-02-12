package com.cloudflow.oa.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.oa.domain.SysAttendanceRecord;
import com.cloudflow.oa.domain.SysAttendanceRule;
import com.cloudflow.oa.service.IAttendanceService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

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

    /**
     * 保存/更新考勤规则
     */
    @PostMapping("/rule")
    public R<Boolean> saveRule(@RequestBody SysAttendanceRule rule) {
        return R.ok(attendanceService.saveOrUpdateRule(rule));
    }

    /**
     * 查询考勤记录列表（分页）
     */
    @GetMapping("/records")
    public R<Map<String, Object>> getRecords(
            @RequestParam(required = false) Long userId,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate,
            @RequestParam(defaultValue = "1") Integer pageNum,
            @RequestParam(defaultValue = "20") Integer pageSize) {
        return R.ok(attendanceService.getRecordList(userId, startDate, endDate, pageNum, pageSize));
    }

    /**
     * 获取月度考勤统计
     */
    @GetMapping("/statistics")
    public R<Map<String, Object>> getStatistics(
            @RequestParam(required = false) Long userId,
            @RequestParam String month) {
        return R.ok(attendanceService.getMonthlyStatistics(userId, month));
    }
}
