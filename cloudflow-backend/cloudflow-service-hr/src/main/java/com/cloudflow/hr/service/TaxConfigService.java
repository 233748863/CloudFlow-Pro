package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.dto.TaxConfigCreateDTO;
import com.cloudflow.hr.domain.dto.TaxConfigUpdateDTO;
import com.cloudflow.hr.domain.vo.TaxConfigVO;

/**
 * 个税配置服务接口
 * 
 * @author CloudFlow
 * @date 2026-03-20
 */
public interface TaxConfigService {
    
    /**
     * 创建个税配置
     * 
     * @param dto 创建DTO
     * @return 配置ID
     */
    Long createTaxConfig(TaxConfigCreateDTO dto);
    
    /**
     * 更新个税配置
     * 
     * @param id 配置ID
     * @param dto 更新DTO
     */
    void updateTaxConfig(Long id, TaxConfigUpdateDTO dto);
    
    /**
     * 获取当前生效的个税配置
     * 
     * @return 个税配置VO
     */
    TaxConfigVO getCurrentTaxConfig();
    
    /**
     * 根据ID获取个税配置
     * 
     * @param id 配置ID
     * @return 个税配置VO
     */
    TaxConfigVO getTaxConfig(Long id);
}
