package com.cloudflow.hr.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.hr.domain.entity.Position;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * 职位Mapper接口
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Mapper
public interface PositionMapper extends BaseMapper<Position> {
    
    /**
     * 检查职位是否有在职员工
     * 
     * @param positionId 职位ID
     * @return 在职员工数量
     */
    int countEmployeesByPositionId(@Param("positionId") Long positionId);
}
