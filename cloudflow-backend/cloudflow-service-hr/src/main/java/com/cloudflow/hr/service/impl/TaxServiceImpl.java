package com.cloudflow.hr.service.impl;

import com.cloudflow.common.core.utils.SecurityUtils;
import com.cloudflow.hr.domain.dto.TaxCalculationDTO;
import com.cloudflow.hr.domain.entity.Employee;
import com.cloudflow.hr.domain.vo.EmployeeTaxDeductionVO;
import com.cloudflow.hr.domain.vo.TaxCalculationVO;
import com.cloudflow.hr.domain.vo.TaxConfigVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.EmployeeMapper;
import com.cloudflow.hr.service.EmployeeTaxDeductionService;
import com.cloudflow.hr.service.TaxConfigService;
import com.cloudflow.hr.service.TaxService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 个税计算服务实现类
 * 
 * @author CloudFlow
 * @date 2026-03-20
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TaxServiceImpl implements TaxService {
    
    private final TaxConfigService taxConfigService;
    private final EmployeeTaxDeductionService taxDeductionService;
    private final EmployeeMapper employeeMapper;
    private final ObjectMapper objectMapper;
    
    /**
     * 计算个人所得税
     */
    @Override
    public TaxCalculationVO calculateTax(TaxCalculationDTO dto) {
        log.info("计算个人所得税，员工ID：{}，应税收入：{}", dto.getEmployeeId(), dto.getTaxableIncome());

        validateCalculationRequest(dto);
        Employee employee = getEmployeeOrThrow(dto.getEmployeeId());

        // 获取当前生效的个税配置
        TaxConfigVO taxConfig = taxConfigService.getCurrentTaxConfig();
        
        // 获取年月（如果未指定，使用当前年月）
        Integer year = dto.getYear() != null ? dto.getYear() : LocalDate.now().getYear();
        Integer month = dto.getMonth() != null ? dto.getMonth() : LocalDate.now().getMonthValue();
        
        // 查询员工的专项附加扣除
        List<EmployeeTaxDeductionVO> deductions = taxDeductionService.listActiveTaxDeductions(
                dto.getEmployeeId(), year, month);
        
        // 计算专项附加扣除总额
        BigDecimal totalDeduction = deductions.stream()
                .map(EmployeeTaxDeductionVO::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        
        // 计算应纳税所得额 = 应税收入 - 起征点 - 专项附加扣除
        BigDecimal taxableAmount = dto.getTaxableIncome()
                .subtract(taxConfig.getThreshold())
                .subtract(totalDeduction);
        
        // 如果应纳税所得额小于等于0，则不需要缴税
        if (taxableAmount.compareTo(BigDecimal.ZERO) <= 0) {
            return buildZeroTaxResult(dto, taxConfig, deductions, totalDeduction);
        }
        
        // 根据税率表计算税额
        TaxBracket bracket = findTaxBracket(taxConfig.getTaxBrackets(), taxableAmount);
        
        // 计算应纳税额 = 应纳税所得额 * 税率 - 速算扣除数
        BigDecimal taxAmount = taxableAmount
                .multiply(bracket.getRate())
                .subtract(bracket.getDeduction())
                .setScale(2, RoundingMode.HALF_UP);
        
        // 确保税额不为负数
        if (taxAmount.compareTo(BigDecimal.ZERO) < 0) {
            taxAmount = BigDecimal.ZERO;
        }
        
        // 计算税后收入
        BigDecimal afterTaxIncome = dto.getTaxableIncome().subtract(taxAmount);
        
        // 构建返回结果
        TaxCalculationVO result = new TaxCalculationVO();
        result.setEmployeeId(dto.getEmployeeId());
        result.setTaxableIncome(dto.getTaxableIncome());
        result.setThreshold(taxConfig.getThreshold());
        result.setTotalDeduction(totalDeduction);
        result.setDeductionDetails(convertToDeductionDetails(deductions));
        result.setTaxableAmount(taxableAmount);
        result.setTaxRate(bracket.getRate());
        result.setQuickDeduction(bracket.getDeduction());
        result.setTaxAmount(taxAmount);
        result.setAfterTaxIncome(afterTaxIncome);
        
        log.info("个税计算完成，应纳税额：{}，税后收入：{}", taxAmount, afterTaxIncome);
        return result;
    }

    private void validateCalculationRequest(TaxCalculationDTO dto) {
        if (dto.getTaxableIncome() == null || dto.getTaxableIncome().compareTo(BigDecimal.ZERO) < 0) {
            throw new HrBusinessException("INVALID_TAXABLE_INCOME", "应税收入不能小于0");
        }
        if (dto.getYear() != null && (dto.getYear() < 2000 || dto.getYear() > 9999)) {
            throw new HrBusinessException("INVALID_YEAR", "年份必须在 2000 到 9999 之间");
        }
        if (dto.getMonth() != null && (dto.getMonth() < 1 || dto.getMonth() > 12)) {
            throw new HrBusinessException("INVALID_MONTH", "月份必须在 1 到 12 之间");
        }
    }

    private Employee getEmployeeOrThrow(Long employeeId) {
        Long tenantId = SecurityUtils.getTenantId();
        Employee employee = employeeMapper.selectById(employeeId);
        if (employee == null || !tenantId.equals(employee.getTenantId())) {
            throw new HrBusinessException("EMPLOYEE_NOT_FOUND", "员工不存在");
        }
        return employee;
    }
    
    /**
     * 构建零税额结果
     */
    private TaxCalculationVO buildZeroTaxResult(TaxCalculationDTO dto, TaxConfigVO taxConfig,
                                                List<EmployeeTaxDeductionVO> deductions, BigDecimal totalDeduction) {
        TaxCalculationVO result = new TaxCalculationVO();
        result.setEmployeeId(dto.getEmployeeId());
        result.setTaxableIncome(dto.getTaxableIncome());
        result.setThreshold(taxConfig.getThreshold());
        result.setTotalDeduction(totalDeduction);
        result.setDeductionDetails(convertToDeductionDetails(deductions));
        result.setTaxableAmount(BigDecimal.ZERO);
        result.setTaxRate(BigDecimal.ZERO);
        result.setQuickDeduction(BigDecimal.ZERO);
        result.setTaxAmount(BigDecimal.ZERO);
        result.setAfterTaxIncome(dto.getTaxableIncome());
        return result;
    }
    
    /**
     * 根据应纳税所得额查找适用的税率档次
     */
    private TaxBracket findTaxBracket(String taxBracketsJson, BigDecimal taxableAmount) {
        try {
            List<Map<String, Object>> brackets = objectMapper.readValue(
                    taxBracketsJson, new TypeReference<List<Map<String, Object>>>() {});
            
            for (Map<String, Object> bracket : brackets) {
                BigDecimal min = new BigDecimal(bracket.get("min").toString());
                BigDecimal max = bracket.containsKey("max") && bracket.get("max") != null
                        ? new BigDecimal(bracket.get("max").toString())
                        : new BigDecimal(Long.MAX_VALUE);
                
                // 判断应纳税所得额是否在当前档次范围内
                if (taxableAmount.compareTo(min) >= 0 && taxableAmount.compareTo(max) < 0) {
                    BigDecimal rate = new BigDecimal(bracket.get("rate").toString());
                    BigDecimal deduction = new BigDecimal(bracket.get("deduction").toString());
                    return new TaxBracket(min, max, rate, deduction);
                }
            }
            
            // 如果没有找到匹配的档次，使用最高档次
            Map<String, Object> lastBracket = brackets.get(brackets.size() - 1);
            BigDecimal rate = new BigDecimal(lastBracket.get("rate").toString());
            BigDecimal deduction = new BigDecimal(lastBracket.get("deduction").toString());
            return new TaxBracket(BigDecimal.ZERO, new BigDecimal(Long.MAX_VALUE), rate, deduction);
            
        } catch (Exception e) {
            log.error("解析税率表失败", e);
            throw new HrBusinessException("税率表配置错误");
        }
    }
    
    /**
     * 转换专项扣除为明细列表
     */
    private List<TaxCalculationVO.DeductionDetail> convertToDeductionDetails(List<EmployeeTaxDeductionVO> deductions) {
        List<TaxCalculationVO.DeductionDetail> details = new ArrayList<>();
        for (EmployeeTaxDeductionVO deduction : deductions) {
            TaxCalculationVO.DeductionDetail detail = new TaxCalculationVO.DeductionDetail();
            detail.setDeductionType(deduction.getDeductionType());
            detail.setDeductionTypeName(deduction.getDeductionTypeName());
            detail.setAmount(deduction.getAmount());
            details.add(detail);
        }
        return details;
    }
    
    /**
     * 税率档次内部类
     */
    private static class TaxBracket {
        private final BigDecimal min;
        private final BigDecimal max;
        private final BigDecimal rate;
        private final BigDecimal deduction;
        
        public TaxBracket(BigDecimal min, BigDecimal max, BigDecimal rate, BigDecimal deduction) {
            this.min = min;
            this.max = max;
            this.rate = rate;
            this.deduction = deduction;
        }
        
        public BigDecimal getRate() {
            return rate;
        }
        
        public BigDecimal getDeduction() {
            return deduction;
        }
    }
}
