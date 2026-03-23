package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.dto.HandoverCompleteDTO;
import com.cloudflow.hr.domain.dto.ResignationApplicationCreateDTO;
import com.cloudflow.hr.domain.dto.ResignationConfirmDTO;
import com.cloudflow.hr.domain.vo.ResignationApplicationVO;
import com.cloudflow.hr.domain.vo.ResignationHandoverVO;

import java.util.List;

/**
 * 离职申请服务接口
 */
public interface ResignationService {

    /**
     * 创建离职申请
     *
     * @param dto 创建DTO
     * @return 申请ID
     */
    Long createResignationApplication(ResignationApplicationCreateDTO dto);

    /**
     * 提交离职申请
     *
     * @param id 申请ID
     */
    void submitResignationApplication(Long id);

    /**
     * 审批通过离职申请
     *
     * @param id 申请ID
     */
    void approveResignation(Long id);

    /**
     * 审批拒绝离职申请
     *
     * @param id 申请ID
     */
    void rejectResignation(Long id);

    /**
     * 完成离职面谈
     *
     * @param id 申请ID
     * @param interviewContent 面谈内容
     */
    void conductExitInterview(Long id, String interviewContent);

    /**
     * 完成交接
     *
     * @param dto 完成交接DTO
     */
    void completeHandover(HandoverCompleteDTO dto);

    /**
     * 确认离职
     *
     * @param dto 确认离职DTO
     */
    void confirmResignation(ResignationConfirmDTO dto);

    /**
     * 查询离职申请详情
     *
     * @param id 申请ID
     * @return 离职申请VO
     */
    ResignationApplicationVO getResignationApplication(Long id);

    /**
     * 查询员工的离职申请列表
     *
     * @param employeeId 员工ID
     * @return 离职申请列表
     */
    List<ResignationApplicationVO> listByEmployeeId(Long employeeId);

    /**
     * 查询离职交接清单
     *
     * @param applicationId 离职申请ID
     * @return 交接清单列表
     */
    List<ResignationHandoverVO> listHandovers(Long applicationId);
}
