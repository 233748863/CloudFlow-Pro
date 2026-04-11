package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.utils.IdUtils;
import com.cloudflow.common.core.utils.SecurityUtils;
import com.cloudflow.hr.client.WorkflowServiceClient;
import com.cloudflow.hr.client.dto.ProcessStartDTO;
import com.cloudflow.hr.config.HrWorkflowProcessKeyProperties;
import com.cloudflow.hr.domain.dto.SalaryAdjustmentCreateDTO;
import com.cloudflow.hr.domain.dto.SalaryAdjustmentQueryDTO;
import com.cloudflow.hr.domain.entity.Employee;
import com.cloudflow.hr.domain.entity.EmployeeSalary;
import com.cloudflow.hr.domain.entity.SalaryAdjustment;
import com.cloudflow.hr.domain.vo.SalaryAdjustmentHistoryVO;
import com.cloudflow.hr.domain.vo.SalaryAdjustmentVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.exception.HrSystemException;
import com.cloudflow.hr.mapper.EmployeeMapper;
import com.cloudflow.hr.mapper.EmployeeSalaryMapper;
import com.cloudflow.hr.mapper.SalaryAdjustmentMapper;
import com.cloudflow.hr.service.SalaryAdjustmentService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * 调薪服务实现。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SalaryAdjustmentServiceImpl implements SalaryAdjustmentService {

    private final SalaryAdjustmentMapper salaryAdjustmentMapper;
    private final EmployeeMapper employeeMapper;
    private final EmployeeSalaryMapper employeeSalaryMapper;
    private final WorkflowServiceClient workflowServiceClient;
    private final HrWorkflowProcessKeyProperties workflowProcessKeyProperties;
    private final ObjectMapper objectMapper;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long createSalaryAdjustment(SalaryAdjustmentCreateDTO dto) {
        log.info("创建调薪申请，employeeId: {}, adjustmentType: {}", dto.getEmployeeId(), dto.getAdjustmentType());

        Long tenantId = SecurityUtils.getTenantId();
        Employee employee = employeeMapper.selectById(dto.getEmployeeId());
        if (employee == null || !tenantId.equals(employee.getTenantId())) {
            throw new HrBusinessException("员工不存在");
        }

        EmployeeSalary currentSalary = getActiveSalary(tenantId, dto.getEmployeeId());
        if (currentSalary == null) {
            throw new HrBusinessException("员工暂无薪资信息，无法发起调薪");
        }

        validateAfterSalaryData(dto);

        String applicationNo = salaryAdjustmentMapper.generateApplicationNo();
        if (applicationNo == null) {
            applicationNo = "SA" + IdUtils.snowflakeIdStr();
        }

        BigDecimal beforeTotal = currentSalary.getTotalSalary();
        BigDecimal afterTotal = dto.getAfterTotal();
        BigDecimal adjustmentAmount = afterTotal.subtract(beforeTotal);
        BigDecimal adjustmentRate = BigDecimal.ZERO;
        if (beforeTotal.compareTo(BigDecimal.ZERO) > 0) {
            adjustmentRate = adjustmentAmount
                    .divide(beforeTotal, 4, RoundingMode.HALF_UP)
                    .multiply(new BigDecimal("100"));
        }

        SalaryAdjustment salaryAdjustment = new SalaryAdjustment();
        salaryAdjustment.setTenantId(tenantId);
        salaryAdjustment.setApplicationNo(applicationNo);
        salaryAdjustment.setEmployeeId(dto.getEmployeeId());
        salaryAdjustment.setAdjustmentType(dto.getAdjustmentType());
        salaryAdjustment.setAdjustmentReason(dto.getAdjustmentReason());
        salaryAdjustment.setBeforeSalaryData(currentSalary.getSalaryData());
        salaryAdjustment.setAfterSalaryData(dto.getAfterSalaryData());
        salaryAdjustment.setBeforeTotal(beforeTotal);
        salaryAdjustment.setAfterTotal(afterTotal);
        salaryAdjustment.setAdjustmentAmount(adjustmentAmount);
        salaryAdjustment.setAdjustmentRate(adjustmentRate);
        salaryAdjustment.setEffectiveDate(dto.getEffectiveDate());
        salaryAdjustment.setStatus("DRAFT");
        salaryAdjustmentMapper.insert(salaryAdjustment);

        return salaryAdjustment.getId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void submitSalaryAdjustment(Long id) {
        log.info("提交调薪申请，id: {}", id);

        Long tenantId = SecurityUtils.getTenantId();
        SalaryAdjustment salaryAdjustment = salaryAdjustmentMapper.selectById(id);
        if (salaryAdjustment == null || !tenantId.equals(salaryAdjustment.getTenantId())) {
            throw new HrBusinessException("调薪申请不存在");
        }
        if (!"DRAFT".equals(salaryAdjustment.getStatus())) {
            throw new HrBusinessException("只有草稿状态的申请才能提交");
        }

        Employee employee = employeeMapper.selectById(salaryAdjustment.getEmployeeId());
        if (employee == null) {
            throw new HrBusinessException("员工不存在");
        }

        ProcessStartDTO processStartDTO = new ProcessStartDTO();
        processStartDTO.setTenantId(tenantId);
        processStartDTO.setProcessDefinitionKey(workflowProcessKeyProperties.getSalaryAdjustment());
        processStartDTO.setBusinessType("SALARY_ADJUSTMENT");
        processStartDTO.setBusinessId(salaryAdjustment.getId());
        processStartDTO.setBusinessNo(salaryAdjustment.getApplicationNo());
        processStartDTO.setProcessTitle("调薪申请-" + employee.getName());
        processStartDTO.setStartUserId(SecurityUtils.getUserId());

        Map<String, Object> variables = new HashMap<>();
        variables.put("applicationNo", salaryAdjustment.getApplicationNo());
        variables.put("employeeId", salaryAdjustment.getEmployeeId());
        variables.put("employeeName", employee.getName());
        variables.put("adjustmentType", salaryAdjustment.getAdjustmentType());
        variables.put("beforeTotal", salaryAdjustment.getBeforeTotal());
        variables.put("afterTotal", salaryAdjustment.getAfterTotal());
        variables.put("adjustmentAmount", salaryAdjustment.getAdjustmentAmount());
        variables.put("adjustmentRate", salaryAdjustment.getAdjustmentRate());
        variables.put("effectiveDate", salaryAdjustment.getEffectiveDate().toString());
        processStartDTO.setVariables(variables);

        try {
            R<String> result = workflowServiceClient.startProcess(processStartDTO);
            if (result == null) {
                throw new HrSystemException("WORKFLOW_START_FAILED", "启动审批流程失败: Workflow 服务无响应");
            }
            if (!result.isSuccess()) {
                throw new HrSystemException("WORKFLOW_START_FAILED", "启动审批流程失败: " + result.getMsg());
            }
            if (result.getData() == null || result.getData().isBlank()) {
                throw new HrSystemException("WORKFLOW_START_FAILED", "启动审批流程失败: Workflow 未返回流程实例ID");
            }

            salaryAdjustment.setProcessInstanceId(result.getData());
            salaryAdjustment.setStatus("APPROVING");
            salaryAdjustmentMapper.updateById(salaryAdjustment);
        } catch (HrSystemException e) {
            throw e;
        } catch (Exception e) {
            log.error("启动调薪审批流程失败", e);
            throw new HrSystemException("WORKFLOW_START_FAILED", "启动审批流程失败: " + e.getMessage(), e);
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void approveSalaryAdjustment(Long id) {
        log.info("调薪申请审批通过，id: {}", id);

        Long tenantId = SecurityUtils.getTenantId();
        SalaryAdjustment salaryAdjustment = salaryAdjustmentMapper.selectById(id);
        tenantId = salaryAdjustment != null ? salaryAdjustment.getTenantId() : tenantId;
        if (salaryAdjustment == null || !tenantId.equals(salaryAdjustment.getTenantId())) {
            throw new HrBusinessException("调薪申请不存在");
        }
        if (!"APPROVING".equals(salaryAdjustment.getStatus())) {
            throw new HrBusinessException("只有审批中的申请才能审批通过");
        }

        salaryAdjustment.setStatus("APPROVED");
        salaryAdjustmentMapper.updateById(salaryAdjustment);

        if (!salaryAdjustment.getEffectiveDate().isAfter(LocalDate.now())) {
            effectiveSalaryAdjustment(id);
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void rejectSalaryAdjustment(Long id) {
        log.info("审批拒绝调薪申请，id: {}", id);

        SalaryAdjustment salaryAdjustment = salaryAdjustmentMapper.selectById(id);
        if (salaryAdjustment == null) {
            throw new HrBusinessException("调薪申请不存在");
        }
        if (!"APPROVING".equals(salaryAdjustment.getStatus())) {
            throw new HrBusinessException("只有审批中的调薪申请才能拒绝");
        }

        salaryAdjustment.setStatus("REJECTED");
        salaryAdjustmentMapper.updateById(salaryAdjustment);

        log.info("调薪申请审批拒绝处理完成，id: {}", id);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void effectiveSalaryAdjustment(Long id) {
        log.info("调薪生效，id: {}", id);

        Long tenantId = SecurityUtils.getTenantId();
        SalaryAdjustment salaryAdjustment = salaryAdjustmentMapper.selectById(id);
        tenantId = salaryAdjustment != null ? salaryAdjustment.getTenantId() : tenantId;
        if (salaryAdjustment == null || !tenantId.equals(salaryAdjustment.getTenantId())) {
            throw new HrBusinessException("调薪申请不存在");
        }
        if (!"APPROVED".equals(salaryAdjustment.getStatus())) {
            throw new HrBusinessException("只有已通过的申请才能生效");
        }
        if (salaryAdjustment.getEffectiveDate() != null && salaryAdjustment.getEffectiveDate().isAfter(LocalDate.now())) {
            throw new HrBusinessException("未到调薪生效日期，不能提前执行生效");
        }

        EmployeeSalary currentSalary = getActiveSalary(tenantId, salaryAdjustment.getEmployeeId());
        if (currentSalary == null) {
            throw new HrBusinessException("员工当前薪资信息不存在");
        }

        currentSalary.setStatus("EXPIRED");
        employeeSalaryMapper.updateById(currentSalary);

        EmployeeSalary newSalary = new EmployeeSalary();
        newSalary.setTenantId(tenantId);
        newSalary.setEmployeeId(salaryAdjustment.getEmployeeId());
        newSalary.setStructureId(currentSalary.getStructureId());
        newSalary.setSalaryData(salaryAdjustment.getAfterSalaryData());
        newSalary.setTotalSalary(salaryAdjustment.getAfterTotal());
        newSalary.setEffectiveDate(salaryAdjustment.getEffectiveDate());
        newSalary.setStatus("ACTIVE");
        employeeSalaryMapper.insert(newSalary);

        salaryAdjustment.setStatus("EFFECTIVE");
        salaryAdjustmentMapper.updateById(salaryAdjustment);
    }

    @Override
    public SalaryAdjustmentVO getSalaryAdjustment(Long id) {
        log.info("查询调薪申请详情，id: {}", id);

        Long tenantId = SecurityUtils.getTenantId();
        SalaryAdjustment salaryAdjustment = salaryAdjustmentMapper.selectById(id);
        if (salaryAdjustment == null || !tenantId.equals(salaryAdjustment.getTenantId())) {
            throw new HrBusinessException("调薪申请不存在");
        }

        SalaryAdjustmentVO vo = salaryAdjustmentMapper.selectDetailById(id);
        if (vo == null) {
            throw new HrBusinessException("调薪申请不存在");
        }
        return vo;
    }

    @Override
    public Page<SalaryAdjustmentVO> listSalaryAdjustments(SalaryAdjustmentQueryDTO query) {
        log.info("分页查询调薪申请列表");

        Long tenantId = SecurityUtils.getTenantId();
        LambdaQueryWrapper<SalaryAdjustment> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(SalaryAdjustment::getTenantId, tenantId);

        if (query.getEmployeeId() != null) {
            queryWrapper.eq(SalaryAdjustment::getEmployeeId, query.getEmployeeId());
        }
        if (query.getAdjustmentType() != null) {
            queryWrapper.eq(SalaryAdjustment::getAdjustmentType, query.getAdjustmentType());
        }
        if (query.getStatus() != null) {
            queryWrapper.eq(SalaryAdjustment::getStatus, query.getStatus());
        }
        if (query.getEffectiveDateStart() != null) {
            queryWrapper.ge(SalaryAdjustment::getEffectiveDate, query.getEffectiveDateStart());
        }
        if (query.getEffectiveDateEnd() != null) {
            queryWrapper.le(SalaryAdjustment::getEffectiveDate, query.getEffectiveDateEnd());
        }
        queryWrapper.orderByDesc(SalaryAdjustment::getCreateTime);

        Page<SalaryAdjustment> entityPage = salaryAdjustmentMapper.selectPage(
                new Page<>(query.getPageNum(), query.getPageSize()),
                queryWrapper
        );

        Page<SalaryAdjustmentVO> result = new Page<>(
                entityPage.getCurrent(),
                entityPage.getSize(),
                entityPage.getTotal()
        );
        result.setRecords(entityPage.getRecords().stream().map(this::convertToVO).toList());
        return result;
    }

    @Override
    public List<SalaryAdjustmentHistoryVO> getSalaryAdjustmentHistory(Long employeeId) {
        log.info("查询员工调薪历史，employeeId: {}", employeeId);

        Long tenantId = SecurityUtils.getTenantId();
        Employee employee = employeeMapper.selectById(employeeId);
        if (employee == null || !tenantId.equals(employee.getTenantId())) {
            throw new HrBusinessException("员工不存在");
        }

        return salaryAdjustmentMapper.selectHistoryByEmployeeId(employeeId);
    }

    private EmployeeSalary getActiveSalary(Long tenantId, Long employeeId) {
        LambdaQueryWrapper<EmployeeSalary> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(EmployeeSalary::getTenantId, tenantId)
                .eq(EmployeeSalary::getEmployeeId, employeeId)
                .eq(EmployeeSalary::getStatus, "ACTIVE")
                .orderByDesc(EmployeeSalary::getEffectiveDate)
                .last("LIMIT 1");
        return employeeSalaryMapper.selectOne(queryWrapper);
    }

    private void validateAfterSalaryData(SalaryAdjustmentCreateDTO dto) {
        try {
            Map<String, BigDecimal> salaryData = objectMapper.readValue(
                    dto.getAfterSalaryData(),
                    new TypeReference<Map<String, BigDecimal>>() {}
            );
            if (salaryData == null || salaryData.isEmpty()) {
                throw new HrBusinessException("INVALID_AFTER_SALARY_DATA", "调薪后薪资明细不能为空");
            }

            BigDecimal sum = salaryData.values().stream()
                    .filter(Objects::nonNull)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            if (sum.compareTo(dto.getAfterTotal()) != 0) {
                throw new HrBusinessException("INVALID_AFTER_TOTAL", "调薪后薪资明细合计必须等于 afterTotal");
            }
        } catch (HrBusinessException e) {
            throw e;
        } catch (Exception e) {
            throw new HrBusinessException("INVALID_AFTER_SALARY_DATA", "调薪后薪资数据必须是合法 JSON，且金额格式正确");
        }
    }

    private SalaryAdjustmentVO convertToVO(SalaryAdjustment salaryAdjustment) {
        SalaryAdjustmentVO vo = new SalaryAdjustmentVO();
        BeanUtils.copyProperties(salaryAdjustment, vo);

        Employee employee = employeeMapper.selectById(salaryAdjustment.getEmployeeId());
        if (employee != null) {
            vo.setEmployeeName(employee.getName());
            vo.setEmployeeNo(employee.getEmployeeNo());
        }

        return vo;
    }
}
