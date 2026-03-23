package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.utils.SecurityUtils;
import com.cloudflow.hr.domain.dto.EmployeeTaxDeductionCreateDTO;
import com.cloudflow.hr.domain.dto.EmployeeTaxDeductionUpdateDTO;
import com.cloudflow.hr.domain.entity.Employee;
import com.cloudflow.hr.domain.entity.EmployeeTaxDeduction;
import com.cloudflow.hr.domain.vo.EmployeeTaxDeductionVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.EmployeeMapper;
import com.cloudflow.hr.mapper.EmployeeTaxDeductionMapper;
import com.cloudflow.hr.service.EmployeeTaxDeductionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 员工专项扣除服务实现类
 * 
 * @author CloudFlow
 * @date 2026-03-20
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class EmployeeTaxDeductionServiceImpl implements EmployeeTaxDeductionService {
    
    private final EmployeeTaxDeductionMapper taxDeductionMapper;
    private final EmployeeMapper employeeMapper;
    
    /**
     * 扣除类型名称映射
     */
    private static final Map<String, String> DEDUCTION_TYPE_NAMES = new HashMap<>();
    
    static {
        DEDUCTION_TYPE_NAMES.put("CHILD_EDU", "子女教育");
        DEDUCTION_TYPE_NAMES.put("CONTINUING_EDU", "继续教育");
        DEDUCTION_TYPE_NAMES.put("MEDICAL", "大病医疗");
        DEDUCTION_TYPE_NAMES.put("HOUSING_LOAN", "住房贷款利息");
        DEDUCTION_TYPE_NAMES.put("HOUSING_RENT", "住房租金");
        DEDUCTION_TYPE_NAMES.put("ELDERLY_CARE", "赡养老人");
    }
    
    /**
     * 添加员工专项扣除
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long addTaxDeduction(EmployeeTaxDeductionCreateDTO dto) {
        log.info("添加员工专项扣除，员工ID：{}，扣除类型：{}", dto.getEmployeeId(), dto.getDeductionType());
        
        Employee employee = getEmployeeOrThrow(dto.getEmployeeId());
        validateDeductionType(dto.getDeductionType());
        validateDeductionAmount(dto.getAmount());
        validateDateRange(dto.getStartDate(), dto.getEndDate());

        // 创建专项扣除实体
        EmployeeTaxDeduction deduction = new EmployeeTaxDeduction();
        BeanUtils.copyProperties(dto, deduction);
        deduction.setTenantId(employee.getTenantId());
        deduction.setStatus("ACTIVE"); // 默认生效中
        
        // 保存到数据库
        taxDeductionMapper.insert(deduction);
        
        log.info("员工专项扣除添加成功，ID：{}", deduction.getId());
        return deduction.getId();
    }
    
    /**
     * 更新员工专项扣除
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void updateTaxDeduction(Long id, EmployeeTaxDeductionUpdateDTO dto) {
        log.info("更新员工专项扣除，ID：{}", id);
        
        // 查询扣除记录是否存在
        Long tenantId = SecurityUtils.getTenantId();
        EmployeeTaxDeduction deduction = taxDeductionMapper.selectById(id);
        if (deduction == null || !tenantId.equals(deduction.getTenantId())) {
            throw new HrBusinessException("TAX_DEDUCTION_NOT_FOUND", "专项附加扣除记录不存在");
        }

        BigDecimal amount = dto.getAmount() != null ? dto.getAmount() : deduction.getAmount();
        LocalDate startDate = dto.getStartDate() != null ? dto.getStartDate() : deduction.getStartDate();
        LocalDate endDate = dto.getEndDate() != null ? dto.getEndDate() : deduction.getEndDate();
        String status = dto.getStatus() != null ? dto.getStatus() : deduction.getStatus();

        validateDeductionAmount(amount);
        validateDateRange(startDate, endDate);
        validateDeductionStatus(status);

        // 更新扣除信息
        if (dto.getAmount() != null) {
            deduction.setAmount(dto.getAmount());
        }
        if (dto.getStartDate() != null) {
            deduction.setStartDate(dto.getStartDate());
        }
        if (dto.getEndDate() != null) {
            deduction.setEndDate(dto.getEndDate());
        }
        if (dto.getStatus() != null) {
            deduction.setStatus(dto.getStatus());
        }
        if (dto.getRemark() != null) {
            deduction.setRemark(dto.getRemark());
        }
        
        taxDeductionMapper.updateById(deduction);
        
        log.info("员工专项扣除更新成功");
    }
    
    /**
     * 删除员工专项扣除
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deleteTaxDeduction(Long id) {
        log.info("删除员工专项扣除，ID：{}", id);
        
        // 查询扣除记录是否存在
        Long tenantId = SecurityUtils.getTenantId();
        EmployeeTaxDeduction deduction = taxDeductionMapper.selectById(id);
        if (deduction == null || !tenantId.equals(deduction.getTenantId())) {
            throw new HrBusinessException("TAX_DEDUCTION_NOT_FOUND", "专项附加扣除记录不存在");
        }

        // 逻辑删除
        taxDeductionMapper.deleteById(id);
        
        log.info("员工专项扣除删除成功");
    }
    
    /**
     * 查询员工的所有专项扣除
     */
    @Override
    public List<EmployeeTaxDeductionVO> listTaxDeductions(Long employeeId) {
        log.info("查询员工的所有专项扣除，员工ID：{}", employeeId);
        
        Employee employee = getEmployeeOrThrow(employeeId);
        Long tenantId = employee.getTenantId();
        
        // 查询专项扣除列表
        LambdaQueryWrapper<EmployeeTaxDeduction> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(EmployeeTaxDeduction::getTenantId, tenantId)
                .eq(EmployeeTaxDeduction::getEmployeeId, employeeId)
                .orderByDesc(EmployeeTaxDeduction::getCreateTime);
        
        List<EmployeeTaxDeduction> deductions = taxDeductionMapper.selectList(queryWrapper);
        
        // 转换为VO
        return deductions.stream().map(deduction -> {
            EmployeeTaxDeductionVO vo = new EmployeeTaxDeductionVO();
            BeanUtils.copyProperties(deduction, vo);
            vo.setEmployeeName(employee.getName());
            vo.setDeductionTypeName(DEDUCTION_TYPE_NAMES.get(deduction.getDeductionType()));
            return vo;
        }).collect(Collectors.toList());
    }
    
    /**
     * 查询员工在指定日期生效的专项扣除
     */
    @Override
    public List<EmployeeTaxDeductionVO> listActiveTaxDeductions(Long employeeId, Integer year, Integer month) {
        log.info("查询员工在指定日期生效的专项扣除，员工ID：{}，年月：{}-{}", employeeId, year, month);
        
        validateYearMonth(year, month);
        LocalDate queryDate = LocalDate.of(year, month, 1);

        Employee employee = getEmployeeOrThrow(employeeId);
        Long tenantId = employee.getTenantId();
        
        // 查询生效的专项扣除
        LambdaQueryWrapper<EmployeeTaxDeduction> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(EmployeeTaxDeduction::getTenantId, tenantId)
                .eq(EmployeeTaxDeduction::getEmployeeId, employeeId)
                .eq(EmployeeTaxDeduction::getStatus, "ACTIVE")
                .le(EmployeeTaxDeduction::getStartDate, queryDate)
                .and(wrapper -> wrapper.isNull(EmployeeTaxDeduction::getEndDate)
                        .or()
                        .ge(EmployeeTaxDeduction::getEndDate, queryDate));
        
        List<EmployeeTaxDeduction> deductions = taxDeductionMapper.selectList(queryWrapper);
        
        // 转换为VO
        return deductions.stream().map(deduction -> {
            EmployeeTaxDeductionVO vo = new EmployeeTaxDeductionVO();
            BeanUtils.copyProperties(deduction, vo);
            vo.setEmployeeName(employee.getName());
            vo.setDeductionTypeName(DEDUCTION_TYPE_NAMES.get(deduction.getDeductionType()));
            return vo;
        }).collect(Collectors.toList());
    }

    private Employee getEmployeeOrThrow(Long employeeId) {
        Long tenantId = SecurityUtils.getTenantId();
        Employee employee = employeeMapper.selectById(employeeId);
        if (employee == null || !tenantId.equals(employee.getTenantId())) {
            throw new HrBusinessException("EMPLOYEE_NOT_FOUND", "员工不存在");
        }
        return employee;
    }

    private void validateDeductionType(String deductionType) {
        if (!DEDUCTION_TYPE_NAMES.containsKey(deductionType)) {
            throw new HrBusinessException("INVALID_DEDUCTION_TYPE", "扣除类型无效");
        }
    }

    private void validateDeductionAmount(BigDecimal amount) {
        if (amount == null || amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new HrBusinessException("INVALID_DEDUCTION_AMOUNT", "扣除金额必须大于 0");
        }
    }

    private void validateDateRange(LocalDate startDate, LocalDate endDate) {
        if (startDate != null && endDate != null && endDate.isBefore(startDate)) {
            throw new HrBusinessException("INVALID_DEDUCTION_DATE", "结束日期不能早于开始日期");
        }
    }

    private void validateDeductionStatus(String status) {
        if (!"ACTIVE".equals(status) && !"EXPIRED".equals(status)) {
            throw new HrBusinessException("INVALID_DEDUCTION_STATUS", "专项附加扣除状态无效");
        }
    }

    private void validateYearMonth(Integer year, Integer month) {
        if (year == null || year < 2000 || year > 9999) {
            throw new HrBusinessException("INVALID_YEAR", "年份必须在 2000 到 9999 之间");
        }
        if (month == null || month < 1 || month > 12) {
            throw new HrBusinessException("INVALID_MONTH", "月份必须在 1 到 12 之间");
        }
    }
}
