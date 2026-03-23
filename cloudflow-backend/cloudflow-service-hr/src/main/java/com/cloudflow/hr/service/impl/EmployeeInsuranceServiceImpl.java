package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.utils.SecurityUtils;
import com.cloudflow.hr.domain.dto.EmployeeInsuranceAssignDTO;
import com.cloudflow.hr.domain.dto.EmployeeInsuranceQueryDTO;
import com.cloudflow.hr.domain.entity.Employee;
import com.cloudflow.hr.domain.entity.EmployeeInsurance;
import com.cloudflow.hr.domain.entity.InsuranceScheme;
import com.cloudflow.hr.domain.vo.EmployeeInsuranceDetailVO;
import com.cloudflow.hr.domain.vo.EmployeeInsuranceVO;
import com.cloudflow.hr.domain.vo.InsuranceCalculationVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.EmployeeInsuranceMapper;
import com.cloudflow.hr.mapper.EmployeeMapper;
import com.cloudflow.hr.mapper.InsuranceSchemeMapper;
import com.cloudflow.hr.service.EmployeeInsuranceService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 员工五险一金服务实现类
 * 提供员工五险一金的分配、查询和计算功能
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class EmployeeInsuranceServiceImpl implements EmployeeInsuranceService {
    
    private final EmployeeInsuranceMapper employeeInsuranceMapper;
    private final InsuranceSchemeMapper insuranceSchemeMapper;
    private final EmployeeMapper employeeMapper;
    
    /**
     * 为员工分配五险一金方案
     * 
     * @param dto 分配DTO
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void assignInsuranceScheme(EmployeeInsuranceAssignDTO dto) {
        log.info("为员工分配五险一金方案，员工ID：{}，方案ID：{}", dto.getEmployeeId(), dto.getSchemeId());
        
        // 验证员工是否存在
        Employee employee = employeeMapper.selectById(dto.getEmployeeId());
        if (employee == null) {
            throw new HrBusinessException("员工不存在");
        }
        
        // 验证租户权限
        if (!employee.getTenantId().equals(SecurityUtils.getTenantId())) {
            throw new HrBusinessException("无权限操作该员工");
        }
        
        // 验证方案是否存在
        InsuranceScheme scheme = insuranceSchemeMapper.selectById(dto.getSchemeId());
        if (scheme == null) {
            throw new HrBusinessException("五险一金方案不存在");
        }
        
        // 验证方案租户权限
        if (!scheme.getTenantId().equals(SecurityUtils.getTenantId())) {
            throw new HrBusinessException("无权限使用该方案");
        }
        
        // 验证缴纳基数是否在范围内
        if (dto.getBase().compareTo(scheme.getBaseMin()) < 0) {
            throw new HrBusinessException("缴纳基数不能低于下限：" + scheme.getBaseMin());
        }
        if (dto.getBase().compareTo(scheme.getBaseMax()) > 0) {
            throw new HrBusinessException("缴纳基数不能高于上限：" + scheme.getBaseMax());
        }
        
        // 查询员工是否已有生效中的五险一金记录
        LambdaQueryWrapper<EmployeeInsurance> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(EmployeeInsurance::getTenantId, SecurityUtils.getTenantId())
                   .eq(EmployeeInsurance::getEmployeeId, dto.getEmployeeId())
                   .eq(EmployeeInsurance::getStatus, "ACTIVE");
        EmployeeInsurance existingInsurance = employeeInsuranceMapper.selectOne(queryWrapper);
        
        // 如果存在生效中的记录，将其状态更新为已过期
        if (existingInsurance != null) {
            existingInsurance.setStatus("EXPIRED");
            employeeInsuranceMapper.updateById(existingInsurance);
            log.info("将员工原有五险一金记录设置为已过期，记录ID：{}", existingInsurance.getId());
        }
        
        // 创建新的五险一金记录
        EmployeeInsurance insurance = new EmployeeInsurance();
        insurance.setTenantId(SecurityUtils.getTenantId());
        insurance.setEmployeeId(dto.getEmployeeId());
        insurance.setSchemeId(dto.getSchemeId());
        insurance.setBase(dto.getBase());
        insurance.setEffectiveDate(dto.getEffectiveDate());
        insurance.setStatus("ACTIVE");
        
        employeeInsuranceMapper.insert(insurance);
        
        log.info("员工五险一金方案分配成功，记录ID：{}", insurance.getId());
    }
    
    /**
     * 获取员工五险一金详情
     * 
     * @param employeeId 员工ID
     * @return 员工五险一金详情VO
     */
    @Override
    public EmployeeInsuranceDetailVO getEmployeeInsurance(Long employeeId) {
        log.info("查询员工五险一金详情，员工ID：{}", employeeId);
        
        // 验证员工是否存在
        Employee employee = employeeMapper.selectById(employeeId);
        if (employee == null) {
            throw new HrBusinessException("员工不存在");
        }
        
        // 验证租户权限
        if (!employee.getTenantId().equals(SecurityUtils.getTenantId())) {
            throw new HrBusinessException("无权限查看该员工信息");
        }
        
        // 查询员工生效中的五险一金记录
        LambdaQueryWrapper<EmployeeInsurance> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(EmployeeInsurance::getTenantId, SecurityUtils.getTenantId())
                   .eq(EmployeeInsurance::getEmployeeId, employeeId)
                   .eq(EmployeeInsurance::getStatus, "ACTIVE")
                   .orderByDesc(EmployeeInsurance::getEffectiveDate)
                   .last("LIMIT 1");
        EmployeeInsurance insurance = employeeInsuranceMapper.selectOne(queryWrapper);
        
        if (insurance == null) {
            throw new HrBusinessException("员工未分配五险一金方案");
        }
        
        // 查询方案信息
        InsuranceScheme scheme = insuranceSchemeMapper.selectById(insurance.getSchemeId());
        if (scheme == null) {
            throw new HrBusinessException("五险一金方案不存在");
        }
        
        // 构建详情VO
        EmployeeInsuranceDetailVO detailVO = new EmployeeInsuranceDetailVO();
        detailVO.setEmployeeId(employee.getId());
        detailVO.setEmployeeName(employee.getName());
        detailVO.setEmployeeNo(employee.getEmployeeNo());
        detailVO.setSchemeId(scheme.getId());
        detailVO.setSchemeName(scheme.getSchemeName());
        detailVO.setCity(scheme.getCity());
        detailVO.setBase(insurance.getBase());
        detailVO.setEffectiveDate(insurance.getEffectiveDate());
        
        // 计算各项缴纳金额
        BigDecimal base = insurance.getBase();
        
        // 养老保险
        detailVO.setPensionCompanyAmount(calculateAmount(base, scheme.getPensionCompanyRate()));
        detailVO.setPensionPersonalAmount(calculateAmount(base, scheme.getPensionPersonalRate()));
        
        // 医疗保险
        detailVO.setMedicalCompanyAmount(calculateAmount(base, scheme.getMedicalCompanyRate()));
        detailVO.setMedicalPersonalAmount(calculateAmount(base, scheme.getMedicalPersonalRate()));
        
        // 失业保险
        detailVO.setUnemploymentCompanyAmount(calculateAmount(base, scheme.getUnemploymentCompanyRate()));
        detailVO.setUnemploymentPersonalAmount(calculateAmount(base, scheme.getUnemploymentPersonalRate()));
        
        // 工伤保险（只有公司缴纳）
        detailVO.setInjuryCompanyAmount(calculateAmount(base, scheme.getInjuryCompanyRate()));
        
        // 生育保险（只有公司缴纳）
        detailVO.setMaternityCompanyAmount(calculateAmount(base, scheme.getMaternityCompanyRate()));
        
        // 公积金
        detailVO.setHousingFundCompanyAmount(calculateAmount(base, scheme.getHousingFundCompanyRate()));
        detailVO.setHousingFundPersonalAmount(calculateAmount(base, scheme.getHousingFundPersonalRate()));
        
        // 计算总额
        BigDecimal companyTotal = detailVO.getPensionCompanyAmount()
                .add(detailVO.getMedicalCompanyAmount())
                .add(detailVO.getUnemploymentCompanyAmount())
                .add(detailVO.getInjuryCompanyAmount())
                .add(detailVO.getMaternityCompanyAmount())
                .add(detailVO.getHousingFundCompanyAmount());
        
        BigDecimal personalTotal = detailVO.getPensionPersonalAmount()
                .add(detailVO.getMedicalPersonalAmount())
                .add(detailVO.getUnemploymentPersonalAmount())
                .add(detailVO.getHousingFundPersonalAmount());
        
        detailVO.setCompanyTotalAmount(companyTotal);
        detailVO.setPersonalTotalAmount(personalTotal);
        detailVO.setTotalAmount(companyTotal.add(personalTotal));
        
        return detailVO;
    }
    
    /**
     * 分页查询员工五险一金列表
     * 
     * @param query 查询条件
     * @return 分页结果
     */
    @Override
    public Page<EmployeeInsuranceVO> listEmployeeInsurances(EmployeeInsuranceQueryDTO query) {
        log.info("分页查询员工五险一金列表，查询条件：{}", query);
        
        // 构建分页对象
        Page<EmployeeInsurance> page = new Page<>(query.getPageNum(), query.getPageSize());
        
        // 构建查询条件
        LambdaQueryWrapper<EmployeeInsurance> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(EmployeeInsurance::getTenantId, SecurityUtils.getTenantId());
        
        if (query.getEmployeeId() != null) {
            queryWrapper.eq(EmployeeInsurance::getEmployeeId, query.getEmployeeId());
        }
        
        if (query.getSchemeId() != null) {
            queryWrapper.eq(EmployeeInsurance::getSchemeId, query.getSchemeId());
        }
        
        if (StringUtils.hasText(query.getStatus())) {
            queryWrapper.eq(EmployeeInsurance::getStatus, query.getStatus());
        }
        
        queryWrapper.orderByDesc(EmployeeInsurance::getEffectiveDate);
        
        // 执行查询
        Page<EmployeeInsurance> insurancePage = employeeInsuranceMapper.selectPage(page, queryWrapper);
        
        // 转换为VO
        Page<EmployeeInsuranceVO> voPage = new Page<>(insurancePage.getCurrent(), insurancePage.getSize(), insurancePage.getTotal());
        List<EmployeeInsuranceVO> voList = insurancePage.getRecords().stream()
                .map(this::convertToVO)
                .collect(Collectors.toList());
        voPage.setRecords(voList);
        
        return voPage;
    }
    
    /**
     * 计算五险一金
     * 
     * @param employeeId 员工ID
     * @param salary 薪资（用于计算基数）
     * @return 计算结果VO
     */
    @Override
    public InsuranceCalculationVO calculateInsurance(Long employeeId, BigDecimal salary) {
        log.info("计算员工五险一金，员工ID：{}，薪资：{}", employeeId, salary);
        
        // 验证员工是否存在
        Employee employee = employeeMapper.selectById(employeeId);
        if (employee == null) {
            throw new HrBusinessException("员工不存在");
        }
        
        // 验证租户权限
        if (!employee.getTenantId().equals(SecurityUtils.getTenantId())) {
            throw new HrBusinessException("无权限查看该员工信息");
        }
        
        // 查询员工生效中的五险一金记录
        LambdaQueryWrapper<EmployeeInsurance> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(EmployeeInsurance::getTenantId, SecurityUtils.getTenantId())
                   .eq(EmployeeInsurance::getEmployeeId, employeeId)
                   .eq(EmployeeInsurance::getStatus, "ACTIVE")
                   .orderByDesc(EmployeeInsurance::getEffectiveDate)
                   .last("LIMIT 1");
        EmployeeInsurance insurance = employeeInsuranceMapper.selectOne(queryWrapper);
        
        if (insurance == null) {
            throw new HrBusinessException("员工未分配五险一金方案");
        }
        
        // 查询方案信息
        InsuranceScheme scheme = insuranceSchemeMapper.selectById(insurance.getSchemeId());
        if (scheme == null) {
            throw new HrBusinessException("五险一金方案不存在");
        }
        
        // 计算缴纳基数（如果提供了薪资，则根据薪资计算基数，否则使用配置的基数）
        BigDecimal base = insurance.getBase();
        if (salary != null && salary.compareTo(BigDecimal.ZERO) > 0) {
            // 根据薪资计算基数，确保在范围内
            base = salary;
            if (base.compareTo(scheme.getBaseMin()) < 0) {
                base = scheme.getBaseMin();
            }
            if (base.compareTo(scheme.getBaseMax()) > 0) {
                base = scheme.getBaseMax();
            }
        }
        
        // 构建计算结果VO
        InsuranceCalculationVO calculationVO = new InsuranceCalculationVO();
        calculationVO.setBase(base);
        
        // 计算各项缴纳金额
        // 养老保险
        calculationVO.setPensionCompanyAmount(calculateAmount(base, scheme.getPensionCompanyRate()));
        calculationVO.setPensionPersonalAmount(calculateAmount(base, scheme.getPensionPersonalRate()));
        
        // 医疗保险
        calculationVO.setMedicalCompanyAmount(calculateAmount(base, scheme.getMedicalCompanyRate()));
        calculationVO.setMedicalPersonalAmount(calculateAmount(base, scheme.getMedicalPersonalRate()));
        
        // 失业保险
        calculationVO.setUnemploymentCompanyAmount(calculateAmount(base, scheme.getUnemploymentCompanyRate()));
        calculationVO.setUnemploymentPersonalAmount(calculateAmount(base, scheme.getUnemploymentPersonalRate()));
        
        // 工伤保险（只有公司缴纳）
        calculationVO.setInjuryCompanyAmount(calculateAmount(base, scheme.getInjuryCompanyRate()));
        
        // 生育保险（只有公司缴纳）
        calculationVO.setMaternityCompanyAmount(calculateAmount(base, scheme.getMaternityCompanyRate()));
        
        // 公积金
        calculationVO.setHousingFundCompanyAmount(calculateAmount(base, scheme.getHousingFundCompanyRate()));
        calculationVO.setHousingFundPersonalAmount(calculateAmount(base, scheme.getHousingFundPersonalRate()));
        
        // 计算总额
        BigDecimal companyTotal = calculationVO.getPensionCompanyAmount()
                .add(calculationVO.getMedicalCompanyAmount())
                .add(calculationVO.getUnemploymentCompanyAmount())
                .add(calculationVO.getInjuryCompanyAmount())
                .add(calculationVO.getMaternityCompanyAmount())
                .add(calculationVO.getHousingFundCompanyAmount());
        
        BigDecimal personalTotal = calculationVO.getPensionPersonalAmount()
                .add(calculationVO.getMedicalPersonalAmount())
                .add(calculationVO.getUnemploymentPersonalAmount())
                .add(calculationVO.getHousingFundPersonalAmount());
        
        calculationVO.setCompanyTotalAmount(companyTotal);
        calculationVO.setPersonalTotalAmount(personalTotal);
        calculationVO.setTotalAmount(companyTotal.add(personalTotal));
        
        return calculationVO;
    }
    
    /**
     * 计算缴纳金额
     * 
     * @param base 缴纳基数
     * @param rate 缴纳比例（%）
     * @return 缴纳金额（保留2位小数）
     */
    private BigDecimal calculateAmount(BigDecimal base, BigDecimal rate) {
        if (base == null || rate == null) {
            return BigDecimal.ZERO;
        }
        // 金额 = 基数 * 比例 / 100，保留2位小数，四舍五入
        return base.multiply(rate)
                  .divide(new BigDecimal("100"), 2, RoundingMode.HALF_UP);
    }
    
    /**
     * 将实体转换为VO
     * 
     * @param insurance 员工五险一金实体
     * @return 员工五险一金VO
     */
    private EmployeeInsuranceVO convertToVO(EmployeeInsurance insurance) {
        EmployeeInsuranceVO vo = new EmployeeInsuranceVO();
        BeanUtils.copyProperties(insurance, vo);
        
        // 查询员工信息
        Employee employee = employeeMapper.selectById(insurance.getEmployeeId());
        if (employee != null) {
            vo.setEmployeeName(employee.getName());
            vo.setEmployeeNo(employee.getEmployeeNo());
        }
        
        // 查询方案信息
        InsuranceScheme scheme = insuranceSchemeMapper.selectById(insurance.getSchemeId());
        if (scheme != null) {
            vo.setSchemeName(scheme.getSchemeName());
            vo.setCity(scheme.getCity());
        }
        
        return vo;
    }
}
