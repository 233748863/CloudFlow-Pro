package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.dto.InsuranceSchemeCreateDTO;
import com.cloudflow.hr.domain.dto.InsuranceSchemeUpdateDTO;
import com.cloudflow.hr.domain.vo.InsuranceSchemeVO;

import java.util.List;

/**
 * 五险一金方案服务接口
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
public interface InsuranceSchemeService {

    /**
     * 创建五险一金方案
     * 
     * @param dto 创建DTO
     * @return 方案ID
     */
    Long createInsuranceScheme(InsuranceSchemeCreateDTO dto);

    /**
     * 更新五险一金方案
     * 
     * @param id 方案ID
     * @param dto 更新DTO
     */
    void updateInsuranceScheme(Long id, InsuranceSchemeUpdateDTO dto);

    /**
     * 获取五险一金方案详情
     * 
     * @param id 方案ID
     * @return 方案VO
     */
    InsuranceSchemeVO getInsuranceScheme(Long id);

    /**
     * 获取五险一金方案列表
     * 
     * @return 方案列表
     */
    List<InsuranceSchemeVO> listInsuranceSchemes();

    /**
     * 根据城市获取五险一金方案列表
     * 
     * @param city 城市
     * @return 方案列表
     */
    List<InsuranceSchemeVO> listInsuranceSchemesByCity(String city);
}
