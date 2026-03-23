package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.dto.SalaryItemCreateDTO;
import com.cloudflow.hr.domain.dto.SalaryItemUpdateDTO;
import com.cloudflow.hr.domain.vo.SalaryItemVO;

import java.util.List;

/**
 * 薪资项目服务接口
 * 提供薪资项目的CRUD操作
 */
public interface SalaryItemService {
    
    /**
     * 创建薪资项目
     * @param dto 薪资项目创建DTO
     * @return 薪资项目ID
     */
    Long createSalaryItem(SalaryItemCreateDTO dto);
    
    /**
     * 更新薪资项目
     * @param id 薪资项目ID
     * @param dto 薪资项目更新DTO
     */
    void updateSalaryItem(Long id, SalaryItemUpdateDTO dto);
    
    /**
     * 获取薪资项目详情
     * @param id 薪资项目ID
     * @return 薪资项目视图对象
     */
    SalaryItemVO getSalaryItem(Long id);
    
    /**
     * 查询所有薪资项目列表
     * @return 薪资项目列表
     */
    List<SalaryItemVO> listSalaryItems();
    
    /**
     * 删除薪资项目
     * @param id 薪资项目ID
     */
    void deleteSalaryItem(Long id);
}
