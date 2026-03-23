package com.cloudflow.hr.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.hr.domain.entity.SalaryAdjustment;
import com.cloudflow.hr.domain.vo.SalaryAdjustmentHistoryVO;
import com.cloudflow.hr.domain.vo.SalaryAdjustmentVO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 调薪申请Mapper接口
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Mapper
public interface SalaryAdjustmentMapper extends BaseMapper<SalaryAdjustment> {
    
    /**
     * 查询调薪申请详情（包含员工信息）
     * 
     * @param id 调薪申请ID
     * @return 调薪申请VO
     */
    SalaryAdjustmentVO selectDetailById(@Param("id") Long id);
    
    /**
     * 查询员工调薪历史
     * 
     * @param employeeId 员工ID
     * @return 调薪历史列表
     */
    List<SalaryAdjustmentHistoryVO> selectHistoryByEmployeeId(@Param("employeeId") Long employeeId);
    
    /**
     * 生成申请编号
     * 
     * @return 申请编号
     */
    String generateApplicationNo();
}
