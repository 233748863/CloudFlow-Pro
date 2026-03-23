package com.cloudflow.hr.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.domain.dto.OvertimeApplicationCreateDTO;
import com.cloudflow.hr.domain.dto.OvertimeApplicationQueryDTO;
import com.cloudflow.hr.domain.vo.OvertimeApplicationVO;
import com.cloudflow.hr.domain.vo.OvertimeStatisticsVO;
import com.cloudflow.hr.service.OvertimeService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.time.YearMonth;
import java.util.List;

/**
 * 加班管理控制器
 * 提供加班申请、审批和统计接口
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Slf4j
@RestController
@RequestMapping("/overtime")
@RequiredArgsConstructor
public class OvertimeController {

    private final OvertimeService overtimeService;

    /**
     * 创建加班申请
     */
    @PostMapping("/applications")
    public R<Long> createOvertimeApplication(@Valid @RequestBody OvertimeApplicationCreateDTO dto) {
        log.info("创建加班申请，员工ID: {}", dto.getEmployeeId());
        Long id = overtimeService.createOvertimeApplication(dto);
        return R.ok(id);
    }

    /**
     * 提交加班申请
     */
    @PostMapping("/applications/{id}/submit")
    public R<Void> submitOvertimeApplication(@PathVariable Long id) {
        log.info("提交加班申请，ID: {}", id);
        overtimeService.submitOvertimeApplication(id);
        return R.ok();
    }

    /**
     * 审批通过加班申请
     */
    @PostMapping("/applications/{id}/approve")
    public R<Void> approveOvertimeApplication(@PathVariable Long id) {
        log.info("审批通过加班申请，ID: {}", id);
        overtimeService.approveOvertimeApplication(id);
        return R.ok();
    }

    /**
     * 审批拒绝加班申请
     */
    @PostMapping("/applications/{id}/reject")
    public R<Void> rejectOvertimeApplication(@PathVariable Long id) {
        log.info("审批拒绝加班申请，ID: {}", id);
        overtimeService.rejectOvertimeApplication(id);
        return R.ok();
    }

    /**
     * 查询加班申请列表
     */
    @GetMapping("/applications")
    public R<List<OvertimeApplicationVO>> listOvertimeApplications(@Valid OvertimeApplicationQueryDTO query) {
        log.info("查询加班申请列表");
        List<OvertimeApplicationVO> list = overtimeService.listOvertimeApplications(query);
        return R.ok(list);
    }

    /**
     * 获取加班申请详情
     */
    @GetMapping("/applications/{id}")
    public R<OvertimeApplicationVO> getOvertimeApplication(@PathVariable Long id) {
        log.info("获取加班申请详情，ID: {}", id);
        OvertimeApplicationVO vo = overtimeService.getOvertimeApplication(id);
        return R.ok(vo);
    }

    /**
     * 获取员工加班统计
     */
    @GetMapping("/statistics/{employeeId}")
    public R<OvertimeStatisticsVO> getOvertimeStatistics(
            @PathVariable Long employeeId,
            @RequestParam String yearMonth) {
        log.info("获取员工加班统计，员工ID: {}, 年月: {}", employeeId, yearMonth);
        YearMonth ym = YearMonth.parse(yearMonth);
        OvertimeStatisticsVO statistics = overtimeService.getOvertimeStatistics(employeeId, ym);
        return R.ok(statistics);
    }
}
