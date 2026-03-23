package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.hr.domain.dto.SalaryAdjustmentCreateDTO;
import com.cloudflow.hr.domain.dto.SalaryAdjustmentQueryDTO;
import com.cloudflow.hr.domain.vo.SalaryAdjustmentHistoryVO;
import com.cloudflow.hr.domain.vo.SalaryAdjustmentVO;

import java.util.List;

/**
 * 调薪管理服务接口
 */
public interface SalaryAdjustmentService {

    /**
     * 创建调薪申请
     *
     * @param dto 创建DTO
     * @return 调薪申请ID
     */
    Long createSalaryAdjustment(SalaryAdjustmentCreateDTO dto);

    /**
     * 提交调薪申请
     *
     * @param id 调薪申请ID
     */
    void submitSalaryAdjustment(Long id);

    /**
     * 审批通过调薪申请
     *
     * @param id 调薪申请ID
     */
    void approveSalaryAdjustment(Long id);

    /**
     * 审批拒绝调薪申请
     *
     * @param id 调薪申请ID
     */
    void rejectSalaryAdjustment(Long id);

    /**
     * 调薪生效
     *
     * @param id 调薪申请ID
     */
    void effectiveSalaryAdjustment(Long id);

    /**
     * 查询调薪申请详情
     *
     * @param id 调薪申请ID
     * @return 调薪申请VO
     */
    SalaryAdjustmentVO getSalaryAdjustment(Long id);

    /**
     * 分页查询调薪申请列表
     *
     * @param query 查询条件
     * @return 分页结果
     */
    Page<SalaryAdjustmentVO> listSalaryAdjustments(SalaryAdjustmentQueryDTO query);

    /**
     * 查询员工调薪历史
     *
     * @param employeeId 员工ID
     * @return 调薪历史列表
     */
    List<SalaryAdjustmentHistoryVO> getSalaryAdjustmentHistory(Long employeeId);
}
