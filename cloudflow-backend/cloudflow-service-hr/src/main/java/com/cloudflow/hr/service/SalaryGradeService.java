package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.dto.SalaryGradeSetDTO;
import com.cloudflow.hr.domain.vo.SalaryGradeVO;

import java.util.List;

/**
 * 薪资等级服务接口
 * 提供薪资等级的设置和查询功能
 */
public interface SalaryGradeService {
    
    /**
     * 设置薪资等级
     * 如果职级已有薪资等级，则更新；否则创建新记录
     * @param dto 薪资等级设置DTO
     */
    void setSalaryGrade(SalaryGradeSetDTO dto);
    
    /**
     * 获取指定职级的薪资等级
     * @param levelId 职级ID
     * @return 薪资等级视图对象
     */
    SalaryGradeVO getSalaryGrade(Long levelId);
    
    /**
     * 查询所有薪资等级列表
     * @return 薪资等级列表
     */
    List<SalaryGradeVO> listSalaryGrades();
    
    /**
     * 删除薪资等级
     * @param levelId 职级ID
     */
    void deleteSalaryGrade(Long levelId);
}
