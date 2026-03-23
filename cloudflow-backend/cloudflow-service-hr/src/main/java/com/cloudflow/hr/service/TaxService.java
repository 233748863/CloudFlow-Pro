package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.dto.TaxCalculationDTO;
import com.cloudflow.hr.domain.vo.TaxCalculationVO;

/**
 * 个税计算服务接口
 * 
 * @author CloudFlow
 * @date 2026-03-20
 */
public interface TaxService {
    
    /**
     * 计算个人所得税
     * 
     * @param dto 计算请求DTO
     * @return 计算结果VO
     */
    TaxCalculationVO calculateTax(TaxCalculationDTO dto);
}
