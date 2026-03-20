package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.dto.PositionCreateDTO;
import com.cloudflow.hr.domain.dto.PositionQueryDTO;
import com.cloudflow.hr.domain.dto.PositionUpdateDTO;
import com.cloudflow.hr.domain.vo.PositionDetailVO;
import com.cloudflow.hr.domain.vo.PositionVO;

import java.util.List;

/**
 * 职位服务接口
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
public interface PositionService {
    
    /**
     * 创建职位
     * 
     * @param dto 职位创建DTO
     * @return 职位ID
     */
    Long createPosition(PositionCreateDTO dto);
    
    /**
     * 更新职位
     * 
     * @param id 职位ID
     * @param dto 职位更新DTO
     */
    void updatePosition(Long id, PositionUpdateDTO dto);
    
    /**
     * 查询职位详情（包含关联信息）
     * 
     * @param id 职位ID
     * @return 职位详情VO
     */
    PositionDetailVO getPosition(Long id);
    
    /**
     * 查询职位列表
     * 
     * @param query 查询条件
     * @return 职位列表
     */
    List<PositionVO> listPositions(PositionQueryDTO query);
    
    /**
     * 删除职位
     * 
     * @param id 职位ID
     */
    void deletePosition(Long id);
}
