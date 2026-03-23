package com.cloudflow.hr.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.domain.dto.ReportingLineSetDTO;
import com.cloudflow.hr.domain.vo.ReportingLineVO;
import com.cloudflow.hr.domain.vo.ReportingMatrixVO;
import com.cloudflow.hr.service.ReportingLineService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 汇报关系控制器
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Slf4j
@RestController
@RequestMapping("/reporting-line")
@RequiredArgsConstructor
public class ReportingLineController {

    private final ReportingLineService reportingLineService;

    /**
     * 设置汇报关系
     * 
     * @param dto 汇报关系设置DTO
     * @return 操作结果
     */
    @PostMapping("/set")
    public R<Void> setReportingLine(@Validated @RequestBody ReportingLineSetDTO dto) {
        log.info("设置汇报关系，请求参数：{}", dto);
        reportingLineService.setReportingLine(dto);
        return R.ok();
    }

    /**
     * 获取员工的汇报关系列表
     * 
     * @param employeeId 员工ID
     * @return 汇报关系列表
     */
    @GetMapping("/employee/{employeeId}")
    public R<List<ReportingLineVO>> getReportingLines(@PathVariable Long employeeId) {
        log.info("获取员工汇报关系，员工ID：{}", employeeId);
        List<ReportingLineVO> reportingLines = reportingLineService.getReportingLines(employeeId);
        return R.ok(reportingLines);
    }

    /**
     * 获取部门汇报关系矩阵
     * 
     * @param deptId 部门ID
     * @return 汇报关系矩阵
     */
    @GetMapping("/matrix/{deptId}")
    public R<ReportingMatrixVO> getReportingMatrix(@PathVariable Long deptId) {
        log.info("获取部门汇报关系矩阵，部门ID：{}", deptId);
        ReportingMatrixVO matrix = reportingLineService.getReportingMatrix(deptId);
        return R.ok(matrix);
    }

    /**
     * 删除汇报关系
     * 
     * @param id 汇报关系ID
     * @return 操作结果
     */
    @DeleteMapping("/{id}")
    public R<Void> deleteReportingLine(@PathVariable Long id) {
        log.info("删除汇报关系，汇报关系ID：{}", id);
        reportingLineService.deleteReportingLine(id);
        return R.ok();
    }
}
