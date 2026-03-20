package com.cloudflow.hr.service.impl;
import com.cloudflow.common.core.utils.SecurityUtils;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.cloudflow.hr.domain.dto.ReportingLineSetDTO;
import com.cloudflow.hr.domain.entity.ReportingLine;
import com.cloudflow.hr.domain.vo.ReportingLineVO;
import com.cloudflow.hr.domain.vo.ReportingMatrixVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.ReportingLineMapper;
import com.cloudflow.hr.service.ReportingLineService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 汇报关系服务实现类
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ReportingLineServiceImpl implements ReportingLineService {

    private final ReportingLineMapper reportingLineMapper;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void setReportingLine(ReportingLineSetDTO dto) {
        log.info("设置汇报关系，员工ID：{}，汇报对象ID：{}，汇报类型：{}", 
                dto.getEmployeeId(), dto.getReportToId(), dto.getReportType());

        // 验证汇报类型
        if (!"DIRECT".equals(dto.getReportType()) && !"DOTTED".equals(dto.getReportType())) {
            throw new HrBusinessException("汇报类型只能是DIRECT或DOTTED");
        }

        // 验证不能自己汇报给自己
        if (dto.getEmployeeId().equals(dto.getReportToId())) {
            throw new HrBusinessException("员工不能汇报给自己");
        }

        // 验证循环汇报
        validateCircularReporting(dto.getEmployeeId(), dto.getReportToId());

        Long tenantId = SecurityUtils.getTenantId();

        // 如果是直接汇报，先失效该员工的其他直接汇报关系
        if ("DIRECT".equals(dto.getReportType())) {
            LambdaQueryWrapper<ReportingLine> queryWrapper = Wrappers.lambdaQuery();
            queryWrapper.eq(ReportingLine::getTenantId, tenantId)
                    .eq(ReportingLine::getEmployeeId, dto.getEmployeeId())
                    .eq(ReportingLine::getReportType, "DIRECT")
                    .and(wrapper -> wrapper
                            .isNull(ReportingLine::getExpiryDate)
                            .or()
                            .ge(ReportingLine::getExpiryDate, LocalDate.now())
                    );

            List<ReportingLine> existingLines = reportingLineMapper.selectList(queryWrapper);
            for (ReportingLine line : existingLines) {
                line.setExpiryDate(LocalDate.now().minusDays(1));
                reportingLineMapper.updateById(line);
            }
        }

        // 检查是否已存在相同的汇报关系
        LambdaQueryWrapper<ReportingLine> checkWrapper = Wrappers.lambdaQuery();
        checkWrapper.eq(ReportingLine::getTenantId, tenantId)
                .eq(ReportingLine::getEmployeeId, dto.getEmployeeId())
                .eq(ReportingLine::getReportToId, dto.getReportToId())
                .eq(ReportingLine::getReportType, dto.getReportType())
                .and(wrapper -> wrapper
                        .isNull(ReportingLine::getExpiryDate)
                        .or()
                        .ge(ReportingLine::getExpiryDate, LocalDate.now())
                );

        ReportingLine existingLine = reportingLineMapper.selectOne(checkWrapper);
        if (existingLine != null) {
            throw new HrBusinessException("该汇报关系已存在");
        }

        // 创建新的汇报关系
        ReportingLine reportingLine = new ReportingLine();
        reportingLine.setTenantId(tenantId);
        reportingLine.setEmployeeId(dto.getEmployeeId());
        reportingLine.setReportToId(dto.getReportToId());
        reportingLine.setReportType(dto.getReportType());
        reportingLine.setEffectiveDate(dto.getEffectiveDate() != null ? dto.getEffectiveDate() : LocalDate.now());
        reportingLine.setExpiryDate(dto.getExpiryDate());

        reportingLineMapper.insert(reportingLine);
        log.info("设置汇报关系成功，汇报关系ID：{}", reportingLine.getId());
    }

    @Override
    public List<ReportingLineVO> getReportingLines(Long employeeId) {
        log.info("获取员工汇报关系，员工ID：{}", employeeId);

        Long tenantId = SecurityUtils.getTenantId();

        // 查询有效的汇报关系
        LambdaQueryWrapper<ReportingLine> queryWrapper = Wrappers.lambdaQuery();
        queryWrapper.eq(ReportingLine::getTenantId, tenantId)
                .eq(ReportingLine::getEmployeeId, employeeId)
                .and(wrapper -> wrapper
                        .isNull(ReportingLine::getExpiryDate)
                        .or()
                        .ge(ReportingLine::getExpiryDate, LocalDate.now())
                )
                .orderByDesc(ReportingLine::getEffectiveDate);

        List<ReportingLine> reportingLines = reportingLineMapper.selectList(queryWrapper);

        // 转换为VO
        return reportingLines.stream().map(line -> {
            ReportingLineVO vo = new ReportingLineVO();
            BeanUtils.copyProperties(line, vo);

            // 设置汇报类型描述
            vo.setReportTypeDesc("DIRECT".equals(line.getReportType()) ? "直接汇报" : "虚线汇报");

            // TODO: 从员工表获取员工姓名和工号
            // 这里暂时使用占位符，等员工模块实现后再补充
            vo.setEmployeeName("员工" + line.getEmployeeId());
            vo.setEmployeeNo("EMP" + line.getEmployeeId());
            vo.setReportToName("员工" + line.getReportToId());
            vo.setReportToNo("EMP" + line.getReportToId());

            return vo;
        }).collect(Collectors.toList());
    }

    @Override
    public ReportingMatrixVO getReportingMatrix(Long deptId) {
        log.info("获取部门汇报关系矩阵，部门ID：{}", deptId);

        // TODO: 实现部门汇报关系矩阵查询
        // 需要：
        // 1. 查询部门下的所有员工
        // 2. 查询这些员工的汇报关系
        // 3. 构建汇报关系树
        // 这里暂时返回空对象，等员工模块实现后再补充

        ReportingMatrixVO matrixVO = new ReportingMatrixVO();
        matrixVO.setDeptId(deptId);
        matrixVO.setDeptName("部门" + deptId);
        matrixVO.setReportingLines(new ArrayList<>());
        matrixVO.setReportingTree(new ArrayList<>());

        log.warn("部门汇报关系矩阵功能待实现，需要员工模块支持");
        return matrixVO;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deleteReportingLine(Long id) {
        log.info("删除汇报关系，汇报关系ID：{}", id);

        Long tenantId = SecurityUtils.getTenantId();

        // 查询汇报关系
        ReportingLine reportingLine = reportingLineMapper.selectById(id);
        if (reportingLine == null) {
            throw new HrBusinessException("汇报关系不存在");
        }

        // 验证租户
        if (!tenantId.equals(reportingLine.getTenantId())) {
            throw new HrBusinessException("无权删除该汇报关系");
        }

        // 软删除：设置失效日期
        reportingLine.setExpiryDate(LocalDate.now().minusDays(1));
        reportingLineMapper.updateById(reportingLine);

        log.info("删除汇报关系成功");
    }

    /**
     * 验证循环汇报
     * 检查是否会形成汇报环路
     */
    private void validateCircularReporting(Long employeeId, Long reportToId) {
        Long tenantId = SecurityUtils.getTenantId();
        Long currentId = reportToId;
        int maxDepth = 10; // 最大检查深度，防止无限循环
        int depth = 0;

        while (currentId != null && depth < maxDepth) {
            // 如果汇报对象的上级是当前员工，则形成循环
            if (currentId.equals(employeeId)) {
                throw new HrBusinessException("不能设置循环汇报关系");
            }

            // 查询汇报对象的直接汇报人
            LambdaQueryWrapper<ReportingLine> queryWrapper = Wrappers.lambdaQuery();
            queryWrapper.eq(ReportingLine::getTenantId, tenantId)
                    .eq(ReportingLine::getEmployeeId, currentId)
                    .eq(ReportingLine::getReportType, "DIRECT")
                    .and(wrapper -> wrapper
                            .isNull(ReportingLine::getExpiryDate)
                            .or()
                            .ge(ReportingLine::getExpiryDate, LocalDate.now())
                    );

            ReportingLine line = reportingLineMapper.selectOne(queryWrapper);
            if (line == null) {
                break;
            }

            currentId = line.getReportToId();
            depth++;
        }

        if (depth >= maxDepth) {
            log.warn("汇报关系链过长，可能存在问题");
        }
    }
}
