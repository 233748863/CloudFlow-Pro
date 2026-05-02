package com.cloudflow.hr.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.domain.dto.AttendanceCheckDTO;
import com.cloudflow.hr.domain.dto.AttendanceRecordQueryDTO;
import com.cloudflow.hr.domain.dto.AttendanceSupplementDTO;
import com.cloudflow.hr.domain.vo.AttendanceDailyVO;
import com.cloudflow.hr.domain.vo.AttendanceRecordVO;
import com.cloudflow.hr.domain.vo.EffectiveAttendanceRuleVO;
import com.cloudflow.hr.service.AttendanceService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

/**
 * HR 考勤控制器。
 *
 * <p>补卡能力现在由 HR 微服务统一承接，前端旧 OA 页面会通过适配层重定向到这里。</p>
 */
@Slf4j
@RestController
@RequestMapping("/attendance")
@RequiredArgsConstructor
public class AttendanceController {

    private final AttendanceService attendanceService;

    @PostMapping("/check-in")
    public R<Void> checkIn(@Valid @RequestBody AttendanceCheckDTO dto) {
        log.info("上班打卡请求，employeeId: {}, checkMethod: {}", dto.getEmployeeId(), dto.getCheckMethod());
        attendanceService.checkIn(dto);
        return R.ok();
    }

    @PostMapping("/check-out")
    public R<Void> checkOut(@Valid @RequestBody AttendanceCheckDTO dto) {
        log.info("下班打卡请求，employeeId: {}, checkMethod: {}", dto.getEmployeeId(), dto.getCheckMethod());
        attendanceService.checkOut(dto);
        return R.ok();
    }

    @PostMapping("/supplement")
    public R<Long> createSupplementApplication(@Valid @RequestBody AttendanceSupplementDTO dto) {
        log.info("创建补卡申请，employeeId: {}, attendanceDate: {}", dto.getEmployeeId(), dto.getAttendanceDate());
        return R.ok(attendanceService.createSupplementApplication(dto));
    }

    @GetMapping("/supplement/list")
    public R<List<AttendanceRecordVO>> listSupplementApplications(AttendanceRecordQueryDTO query) {
        log.info("查询补卡申请列表，query: {}", query);
        return R.ok(attendanceService.listSupplementApplications(query));
    }

    @GetMapping("/supplement/{id}")
    public R<AttendanceRecordVO> getSupplementApplication(@PathVariable Long id) {
        log.info("查询补卡申请详情，id: {}", id);
        return R.ok(attendanceService.getSupplementApplication(id));
    }

    @PutMapping("/supplement/{id}")
    public R<Void> updateSupplementApplication(@PathVariable Long id,
                                               @Valid @RequestBody AttendanceSupplementDTO dto) {
        log.info("更新补卡申请，id: {}", id);
        attendanceService.updateSupplementApplication(id, dto);
        return R.ok();
    }

    @DeleteMapping("/supplement/{id}")
    public R<Void> deleteSupplementApplication(@PathVariable Long id) {
        log.info("删除补卡申请，id: {}", id);
        attendanceService.deleteSupplementApplication(id);
        return R.ok();
    }

    @PostMapping("/supplement/{id}/submit")
    public R<Void> submitSupplementApplication(@PathVariable Long id) {
        log.info("提交补卡申请，id: {}", id);
        attendanceService.submitSupplementApplication(id);
        return R.ok();
    }

    @PostMapping("/supplement/{id}/approve")
    public R<Void> approveSupplementApplication(@PathVariable Long id) {
        log.info("审批通过补卡申请，id: {}", id);
        attendanceService.approveSupplementApplication(id);
        return R.ok();
    }

    @PostMapping("/supplement/{id}/reject")
    public R<Void> rejectSupplementApplication(@PathVariable Long id) {
        log.info("审批驳回补卡申请，id: {}", id);
        attendanceService.rejectSupplementApplication(id);
        return R.ok();
    }

    @GetMapping("/records")
    public R<List<AttendanceRecordVO>> listAttendanceRecords(AttendanceRecordQueryDTO query) {
        log.info("查询考勤记录列表，query: {}", query);
        return R.ok(attendanceService.listAttendanceRecords(query));
    }

    @GetMapping("/daily")
    public R<AttendanceDailyVO> getDailyAttendance(
            @RequestParam Long employeeId,
            @RequestParam @DateTimeFormat(pattern = "yyyy-MM-dd") LocalDate date) {
        log.info("查询日考勤，employeeId: {}, date: {}", employeeId, date);
        return R.ok(attendanceService.getDailyAttendance(employeeId, date));
    }

    @GetMapping("/rule/effective")
    public R<EffectiveAttendanceRuleVO> getEffectiveRule(
            @RequestParam(required = false) Long employeeId,
            @RequestParam(required = false) @DateTimeFormat(pattern = "yyyy-MM-dd") LocalDate date) {
        return R.ok(attendanceService.getEffectiveRule(employeeId, date));
    }
}
