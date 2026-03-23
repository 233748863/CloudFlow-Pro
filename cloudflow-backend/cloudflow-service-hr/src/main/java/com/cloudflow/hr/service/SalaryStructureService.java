package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.dto.SalaryStructureCreateDTO;
import com.cloudflow.hr.domain.dto.SalaryStructureUpdateDTO;
import com.cloudflow.hr.domain.vo.SalaryStructureDetailVO;
import com.cloudflow.hr.domain.vo.SalaryStructureVO;

import java.util.List;

/**
 * 薪资结构服务接口
 * 提供薪资结构的CRUD操作和薪资项目关联管理
 */
public interface SalaryStructureService {
    
    /**
     * 创建薪资结构
     * @param dto 薪资结构创建DTO
     * @return 薪资结构ID
     */
    Long createSalaryStructure(SalaryStructureCreateDTO dto);
    
    /**
     * 更新薪资结构
     * @param id 薪资结构ID
     * @param dto 薪资结构更新DTO
     */
    void updateSalaryStructure(Long id, SalaryStructureUpdateDTO dto);
    
    /**
     * 获取薪资结构详情（包含关联的薪资项目）
     * @param id 薪资结构ID
     * @return 薪资结构详情视图对象
     */
    SalaryStructureDetailVO getSalaryStructure(Long id);
    
    /**
     * 查询所有薪资结构列表
     * @return 薪资结构列表
     */
    List<SalaryStructureVO> listSalaryStructures();
    
    /**
     * 删除薪资结构
     * @param id 薪资结构ID
     */
    void deleteSalaryStructure(Long id);
}
