package com.cloudflow.hr.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.domain.dto.AttendanceAnomalyQueryDTO;
import com.cloudflow.hr.domain.dto.AttendanceMonthlyQueryDTO;
import com.cloudflow.hr.domain.dto.AttendanceReportExportDTO;
import com.cloudflow.hr.domain.vo.AttendanceAnomalyVO;
import com.cloudflow.hr.domain.vo.AttendanceMonthlyVO;
import com.cloudflow.hr.domain.vo.AttendanceRateVO;
import com.cloudflow.hr.service.AttendanceStatisticsService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 考勤统计控制器
 * 提供考勤月报、异常统计和报表导出接口
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Slf4j
@RestController
@RequestMapping("/attendance/statistics")
@RequiredArgsConstructor
public class AttendanceStatisticsController {

    private final AttendanceStatisticsService attendanceStatisticsService;

    /**
     * 生成月度考勤汇总（批量生成所有员工）
     */
    @PostMapping("/monthly/generate")
    public R<Void> generateMonthlyAttendance(@RequestParam Integer year, @RequestParam Integer month) {
        log.info("生成月度考勤汇总，年份: {}, 月份: {}", year, month);
        attendanceStatisticsService.generateMonthlyAttendance(year, month);
        return R.ok();
    }

    /**
     * 生成员工月度考勤汇总
     */
    @PostMapping("/monthly/generate/{employeeId}")
    public R<Void> generateEmployeeMonthlyAttendance(
            @PathVariable Long employeeId,
            @RequestParam Integer year,
            @RequestParam Integer month) {
        log.info("生成员工月度考勤汇总，员工ID: {}, 年份: {}, 月份: {}", employeeId, year, month);
        attendanceStatisticsService.generateEmployeeMonthlyAttendance(employeeId, year, month);
        return R.ok();
    }

    /**
     * 获取员工月度考勤汇总
     */
    @GetMapping("/monthly/{employeeId}")
    public R<AttendanceMonthlyVO> getMonthlyAttendance(
            @PathVariable Long employeeId,
            @RequestParam Integer year,
            @RequestParam Integer month) {
        log.info("获取员工月度考勤汇总，员工ID: {}, 年份: {}, 月份: {}", employeeId, year, month);
        AttendanceMonthlyVO vo = attendanceStatisticsService.getMonthlyAttendance(employeeId, year, month);
        return R.ok(vo);
    }

    /**
     * 查询月度考勤汇总列表
     */
    @GetMapping("/monthly")
    public R<List<AttendanceMonthlyVO>> listMonthlyAttendance(@Valid AttendanceMonthlyQueryDTO query) {
        log.info("查询月度考勤汇总列表");
        List<AttendanceMonthlyVO> list = attendanceStatisticsService.listMonthlyAttendance(query);
        return R.ok(list);
    }

    /**
     * 查询异常考勤统计
     */
    @GetMapping("/anomalies")
    public R<List<AttendanceAnomalyVO>> listAttendanceAnomalies(@Valid AttendanceAnomalyQueryDTO query) {
        log.info("查询异常考勤统计");
        List<AttendanceAnomalyVO> list = attendanceStatisticsService.listAttendanceAnomalies(query);
        return R.ok(list);
    }

    /**
     * 获取部门出勤率分析
     */
    @GetMapping("/rate")
    public R<AttendanceRateVO> getAttendanceRate(
            @RequestParam(required = false) Long deptId,
            @RequestParam Integer year,
            @RequestParam Integer month) {
        log.info("获取部门出勤率分析，部门ID: {}, 年份: {}, 月份: {}", deptId, year, month);
        AttendanceRateVO vo = attendanceStatisticsService.getAttendanceRate(deptId, year, month);
        return R.ok(vo);
    }

    /**
     * 导出考勤报表
     */
    @PostMapping("/export")
    public R<String> exportAttendanceReport(@Valid @RequestBody AttendanceReportExportDTO dto) {
        log.info("导出考勤报表，参数: {}", dto);
        String fileUrl = attendanceStatisticsService.exportAttendanceReport(dto);
        return R.ok(fileUrl);
    }
}
