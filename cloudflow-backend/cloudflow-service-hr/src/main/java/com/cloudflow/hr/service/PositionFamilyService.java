package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.dto.PositionFamilyCreateDTO;
import com.cloudflow.hr.domain.dto.PositionFamilyUpdateDTO;
import com.cloudflow.hr.domain.vo.PositionFamilyVO;

import java.util.List;

/**
 * 职位族服务接口
 * 
 * @author CloudFlow
 */
public interface PositionFamilyService {
    
    /**
     * 创建职位族
     * 
     * @param dto 职位族创建DTO
     * @return 职位族ID
     */
    Long createPositionFamily(PositionFamilyCreateDTO dto);
    
    /**
     * 更新职位族
     * 
     * @param id 职位族ID
     * @param dto 职位族更新DTO
     */
    void updatePositionFamily(Long id, PositionFamilyUpdateDTO dto);
    
    /**
     * 获取职位族详情
     * 
     * @param id 职位族ID
     * @return 职位族VO
     */
    PositionFamilyVO getPositionFamily(Long id);
    
    /**
     * 获取所有职位族列表
     * 
     * @return 职位族列表
     */
    List<PositionFamilyVO> listPositionFamilies();
    
    /**
     * 删除职位族
     * 
     * @param id 职位族ID
     */
    void deletePositionFamily(Long id);
}
