package com.cloudflow.hr.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.domain.dto.AttendanceCheckDTO;
import com.cloudflow.hr.domain.dto.AttendanceRecordQueryDTO;
import com.cloudflow.hr.domain.dto.AttendanceSupplementDTO;
import com.cloudflow.hr.domain.vo.AttendanceDailyVO;
import com.cloudflow.hr.domain.vo.AttendanceRecordVO;
import com.cloudflow.hr.service.AttendanceService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

/**
 * 考勤打卡控制器
 *
 * @author CloudFlow
 * @date 2026-03-20
 */
@Slf4j
@RestController
@RequestMapping("/attendance")
@RequiredArgsConstructor
public class AttendanceController {

    private final AttendanceService attendanceService;

    /**
     * 上班打卡
     *
     * @param dto 打卡请求DTO
     * @return 操作结果
     */
    @PostMapping("/check-in")
    public R<Void> checkIn(@Valid @RequestBody AttendanceCheckDTO dto) {
        log.info("上班打卡请求，employeeId: {}, checkMethod: {}", dto.getEmployeeId(), dto.getCheckMethod());
        attendanceService.checkIn(dto);
        return R.ok();
    }

    /**
     * 下班打卡
     *
     * @param dto 打卡请求DTO
     * @return 操作结果
     */
    @PostMapping("/check-out")
    public R<Void> checkOut(@Valid @RequestBody AttendanceCheckDTO dto) {
        log.info("下班打卡请求，employeeId: {}, checkMethod: {}", dto.getEmployeeId(), dto.getCheckMethod());
        attendanceService.checkOut(dto);
        return R.ok();
    }

    /**
     * 创建补卡申请
     *
     * @param dto 补卡申请DTO
     * @return 申请ID
     */
    @PostMapping("/supplement")
    public R<Long> createSupplementApplication(@Valid @RequestBody AttendanceSupplementDTO dto) {
        log.info("创建补卡申请，employeeId: {}, attendanceDate: {}", dto.getEmployeeId(), dto.getAttendanceDate());
        Long id = attendanceService.createSupplementApplication(dto);
        return R.ok(id);
    }

    /**
     * 提交补卡申请
     *
     * @param id 申请ID
     * @return 操作结果
     */
    @PostMapping("/supplement/{id}/submit")
    public R<Void> submitSupplementApplication(@PathVariable Long id) {
        log.info("提交补卡申请，id: {}", id);
        attendanceService.submitSupplementApplication(id);
        return R.ok();
    }

    /**
     * 审批通过补卡申请
     *
     * @param id 申请ID
     * @return 操作结果
     */
    @PostMapping("/supplement/{id}/approve")
    public R<Void> approveSupplementApplication(@PathVariable Long id) {
        log.info("审批通过补卡申请，id: {}", id);
        attendanceService.approveSupplementApplication(id);
        return R.ok();
    }

    /**
     * 审批拒绝补卡申请
     *
     * @param id 申请ID
     * @return 操作结果
     */
    @PostMapping("/supplement/{id}/reject")
    public R<Void> rejectSupplementApplication(@PathVariable Long id) {
        log.info("审批拒绝补卡申请，id: {}", id);
        attendanceService.rejectSupplementApplication(id);
        return R.ok();
    }

    /**
     * 查询打卡记录列表
     *
     * @param query 查询条件
     * @return 打卡记录列表
     */
    @GetMapping("/records")
    public R<List<AttendanceRecordVO>> listAttendanceRecords(AttendanceRecordQueryDTO query) {
        log.info("查询打卡记录列表，query: {}", query);
        List<AttendanceRecordVO> records = attendanceService.listAttendanceRecords(query);
        return R.ok(records);
    }

    /**
     * 获取某天的打卡记录
     *
     * @param employeeId 员工ID
     * @param date 日期
     * @return 每日考勤VO
     */
    @GetMapping("/daily")
    public R<AttendanceDailyVO> getDailyAttendance(
            @RequestParam Long employeeId,
            @RequestParam @DateTimeFormat(pattern = "yyyy-MM-dd") LocalDate date) {
        log.info("获取每日考勤，employeeId: {}, date: {}", employeeId, date);
        AttendanceDailyVO vo = attendanceService.getDailyAttendance(employeeId, date);
        return R.ok(vo);
    }
}
