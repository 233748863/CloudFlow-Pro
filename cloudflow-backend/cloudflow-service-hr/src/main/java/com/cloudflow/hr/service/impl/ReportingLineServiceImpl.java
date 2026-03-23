package com.cloudflow.hr.service.impl;
import com.cloudflow.common.core.utils.SecurityUtils;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.cloudflow.hr.client.vo.DeptVO;
import com.cloudflow.hr.domain.dto.ReportingLineSetDTO;
import com.cloudflow.hr.domain.entity.Employee;
import com.cloudflow.hr.domain.entity.ReportingLine;
import com.cloudflow.hr.domain.vo.ReportingLineVO;
import com.cloudflow.hr.domain.vo.ReportingMatrixVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.EmployeeMapper;
import com.cloudflow.hr.mapper.ReportingLineMapper;
import com.cloudflow.hr.service.DeptPostSyncService;
import com.cloudflow.hr.service.ReportingLineService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
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
    private final EmployeeMapper employeeMapper;
    private final DeptPostSyncService deptPostSyncService;

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

        Long tenantId = SecurityUtils.getTenantId();
        LocalDate effectiveDate = dto.getEffectiveDate() != null ? dto.getEffectiveDate() : LocalDate.now();
        validateDateRange(effectiveDate, dto.getExpiryDate());
        getEmployeeOrThrow(dto.getEmployeeId(), tenantId);
        getEmployeeOrThrow(dto.getReportToId(), tenantId);

        ReportingLine duplicateLine = findActiveReportingLine(
                tenantId, dto.getEmployeeId(), dto.getReportToId(), dto.getReportType());
        if (duplicateLine != null) {
            throw new HrBusinessException("该汇报关系已存在");
        }

        // 验证循环汇报
        validateCircularReporting(dto.getEmployeeId(), dto.getReportToId());

        // 如果是直接汇报，先失效该员工的其他直接汇报关系
        if ("DIRECT".equals(dto.getReportType())) {
            expireActiveDirectLines(tenantId, dto.getEmployeeId());
        }

        // 创建新的汇报关系
        ReportingLine reportingLine = new ReportingLine();
        reportingLine.setTenantId(tenantId);
        reportingLine.setEmployeeId(dto.getEmployeeId());
        reportingLine.setReportToId(dto.getReportToId());
        reportingLine.setReportType(dto.getReportType());
        reportingLine.setEffectiveDate(effectiveDate);
        reportingLine.setExpiryDate(dto.getExpiryDate());

        reportingLineMapper.insert(reportingLine);
        log.info("设置汇报关系成功，汇报关系ID：{}", reportingLine.getId());
    }

    @Override
    public List<ReportingLineVO> getReportingLines(Long employeeId) {
        log.info("获取员工汇报关系，员工ID：{}", employeeId);

        Long tenantId = SecurityUtils.getTenantId();
        getEmployeeOrThrow(employeeId, tenantId);

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

        return buildReportingLineVOs(reportingLines, tenantId);
    }

    @Override
    public ReportingMatrixVO getReportingMatrix(Long deptId) {
        log.info("获取部门汇报关系矩阵，部门ID：{}", deptId);
        Long tenantId = SecurityUtils.getTenantId();

        DeptVO dept = deptPostSyncService.getCachedDept(deptId);
        if (dept == null) {
            throw HrBusinessException.invalidDeptOrPost("DEPT", deptId);
        }

        ReportingMatrixVO matrixVO = new ReportingMatrixVO();
        matrixVO.setDeptId(deptId);
        matrixVO.setDeptName(dept.getDeptName());

        LambdaQueryWrapper<Employee> employeeWrapper = Wrappers.lambdaQuery();
        employeeWrapper.eq(Employee::getTenantId, tenantId)
                .eq(Employee::getDeptId, deptId)
                .orderByAsc(Employee::getId);
        List<Employee> deptEmployees = employeeMapper.selectList(employeeWrapper);
        if (deptEmployees.isEmpty()) {
            matrixVO.setReportingLines(new ArrayList<>());
            matrixVO.setReportingTree(new ArrayList<>());
            return matrixVO;
        }

        Set<Long> deptEmployeeIds = deptEmployees.stream()
                .map(Employee::getId)
                .collect(Collectors.toSet());

        LambdaQueryWrapper<ReportingLine> reportingWrapper = Wrappers.lambdaQuery();
        reportingWrapper.eq(ReportingLine::getTenantId, tenantId)
                .in(ReportingLine::getEmployeeId, deptEmployeeIds)
                .and(wrapper -> wrapper
                        .isNull(ReportingLine::getExpiryDate)
                        .or()
                        .ge(ReportingLine::getExpiryDate, LocalDate.now()))
                .orderByAsc(ReportingLine::getEffectiveDate)
                .orderByAsc(ReportingLine::getId);
        List<ReportingLine> reportingLines = reportingLineMapper.selectList(reportingWrapper);

        matrixVO.setReportingLines(buildReportingLineVOs(reportingLines, tenantId));

        Set<Long> relatedEmployeeIds = new HashSet<>(deptEmployeeIds);
        reportingLines.stream()
                .map(ReportingLine::getReportToId)
                .forEach(relatedEmployeeIds::add);
        Map<Long, Employee> employeeMap = loadEmployeeMap(tenantId, relatedEmployeeIds);

        Map<Long, ReportingMatrixVO.EmployeeNode> nodeMap = new HashMap<>();
        for (Employee employee : deptEmployees) {
            ReportingMatrixVO.EmployeeNode node = buildEmployeeNode(employee);
            node.setDottedReportToList(new ArrayList<>());
            node.setDirectReports(new ArrayList<>());
            nodeMap.put(employee.getId(), node);
        }

        Set<Long> directChildrenInDept = new HashSet<>();
        for (ReportingLine reportingLine : reportingLines) {
            ReportingMatrixVO.EmployeeNode employeeNode = nodeMap.get(reportingLine.getEmployeeId());
            if (employeeNode == null) {
                continue;
            }
            Employee manager = employeeMap.get(reportingLine.getReportToId());
            ReportingMatrixVO.EmployeeNode managerNode = buildEmployeeReference(manager, reportingLine.getReportToId());
            if ("DIRECT".equals(reportingLine.getReportType())) {
                employeeNode.setDirectReportTo(managerNode);
                if (nodeMap.containsKey(reportingLine.getReportToId())) {
                    nodeMap.get(reportingLine.getReportToId()).getDirectReports().add(employeeNode);
                    directChildrenInDept.add(reportingLine.getEmployeeId());
                }
            } else {
                employeeNode.getDottedReportToList().add(managerNode);
            }
        }

        List<ReportingMatrixVO.EmployeeNode> roots = deptEmployees.stream()
                .map(Employee::getId)
                .filter(employeeId -> !directChildrenInDept.contains(employeeId))
                .map(nodeMap::get)
                .collect(Collectors.toList());
        matrixVO.setReportingTree(roots);
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

    private Employee getEmployeeOrThrow(Long employeeId, Long tenantId) {
        Employee employee = employeeMapper.selectById(employeeId);
        if (employee == null || !tenantId.equals(employee.getTenantId())) {
            throw HrBusinessException.employeeNotFound(employeeId);
        }
        return employee;
    }

    private void validateDateRange(LocalDate effectiveDate, LocalDate expiryDate) {
        if (expiryDate != null && expiryDate.isBefore(effectiveDate)) {
            throw new HrBusinessException("INVALID_REPORTING_DATE", "失效日期不能早于生效日期");
        }
    }

    private ReportingLine findActiveReportingLine(Long tenantId, Long employeeId, Long reportToId, String reportType) {
        LambdaQueryWrapper<ReportingLine> wrapper = Wrappers.lambdaQuery();
        wrapper.eq(ReportingLine::getTenantId, tenantId)
                .eq(ReportingLine::getEmployeeId, employeeId)
                .eq(ReportingLine::getReportToId, reportToId)
                .eq(ReportingLine::getReportType, reportType)
                .and(query -> query.isNull(ReportingLine::getExpiryDate)
                        .or()
                        .ge(ReportingLine::getExpiryDate, LocalDate.now()))
                .last("LIMIT 1");
        return reportingLineMapper.selectOne(wrapper);
    }

    private void expireActiveDirectLines(Long tenantId, Long employeeId) {
        LambdaQueryWrapper<ReportingLine> wrapper = Wrappers.lambdaQuery();
        wrapper.eq(ReportingLine::getTenantId, tenantId)
                .eq(ReportingLine::getEmployeeId, employeeId)
                .eq(ReportingLine::getReportType, "DIRECT")
                .and(query -> query.isNull(ReportingLine::getExpiryDate)
                        .or()
                        .ge(ReportingLine::getExpiryDate, LocalDate.now()));
        List<ReportingLine> existingLines = reportingLineMapper.selectList(wrapper);
        for (ReportingLine line : existingLines) {
            line.setExpiryDate(LocalDate.now().minusDays(1));
            reportingLineMapper.updateById(line);
        }
    }

    private List<ReportingLineVO> buildReportingLineVOs(List<ReportingLine> reportingLines, Long tenantId) {
        if (reportingLines.isEmpty()) {
            return new ArrayList<>();
        }

        Set<Long> employeeIds = new HashSet<>();
        for (ReportingLine reportingLine : reportingLines) {
            employeeIds.add(reportingLine.getEmployeeId());
            employeeIds.add(reportingLine.getReportToId());
        }
        Map<Long, Employee> employeeMap = loadEmployeeMap(tenantId, employeeIds);

        return reportingLines.stream().map(line -> {
            ReportingLineVO vo = new ReportingLineVO();
            BeanUtils.copyProperties(line, vo);
            vo.setReportTypeDesc("DIRECT".equals(line.getReportType()) ? "直接汇报" : "虚线汇报");

            Employee employee = employeeMap.get(line.getEmployeeId());
            Employee reportTo = employeeMap.get(line.getReportToId());
            vo.setEmployeeName(employee != null ? employee.getName() : "员工" + line.getEmployeeId());
            vo.setEmployeeNo(employee != null ? employee.getEmployeeNo() : null);
            vo.setReportToName(reportTo != null ? reportTo.getName() : "员工" + line.getReportToId());
            vo.setReportToNo(reportTo != null ? reportTo.getEmployeeNo() : null);
            return vo;
        }).collect(Collectors.toList());
    }

    private Map<Long, Employee> loadEmployeeMap(Long tenantId, Set<Long> employeeIds) {
        if (employeeIds == null || employeeIds.isEmpty()) {
            return new HashMap<>();
        }

        LambdaQueryWrapper<Employee> wrapper = Wrappers.lambdaQuery();
        wrapper.eq(Employee::getTenantId, tenantId)
                .in(Employee::getId, employeeIds);
        List<Employee> employees = employeeMapper.selectList(wrapper);
        return employees.stream().collect(Collectors.toMap(Employee::getId, employee -> employee));
    }

    private ReportingMatrixVO.EmployeeNode buildEmployeeNode(Employee employee) {
        ReportingMatrixVO.EmployeeNode node = new ReportingMatrixVO.EmployeeNode();
        node.setEmployeeId(employee.getId());
        node.setEmployeeName(employee.getName());
        node.setEmployeeNo(employee.getEmployeeNo());
        return node;
    }

    private ReportingMatrixVO.EmployeeNode buildEmployeeReference(Employee employee, Long employeeId) {
        ReportingMatrixVO.EmployeeNode node = new ReportingMatrixVO.EmployeeNode();
        node.setEmployeeId(employeeId);
        if (employee != null) {
            node.setEmployeeName(employee.getName());
            node.setEmployeeNo(employee.getEmployeeNo());
        }
        return node;
    }
}
