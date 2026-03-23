package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.dto.ProbationConfirmationCreateDTO;
import com.cloudflow.hr.domain.vo.ProbationConfirmationVO;

import java.util.List;

/**
 * 转正申请服务接口
 * 
 * @author CloudFlow
 */
public interface ProbationConfirmationService {
    
    /**
     * 创建转正申请
     * 
     * @param dto 创建DTO
     * @return 申请ID
     */
    Long createProbationConfirmation(ProbationConfirmationCreateDTO dto);
    
    /**
     * 提交转正申请（启动审批流程）
     * 
     * @param id 申请ID
     */
    void submitProbationConfirmation(Long id);
    
    /**
     * 审批通过处理（更新员工状态为正式员工）
     * 
     * @param id 申请ID
     */
    void approveProbationConfirmation(Long id);
    
    /**
     * 审批拒绝处理（延长试用期或离职）
     * 
     * @param id 申请ID
     * @param reason 拒绝原因
     * @param extensionDays 延长天数（如果为null则标记为离职）
     */
    void rejectProbationConfirmation(Long id, String reason, Integer extensionDays);
    
    /**
     * 查询转正申请详情
     * 
     * @param id 申请ID
     * @return 转正申请VO
     */
    ProbationConfirmationVO getProbationConfirmation(Long id);
    
    /**
     * 查询员工的转正申请列表
     * 
     * @param employeeId 员工ID
     * @return 转正申请列表
     */
    List<ProbationConfirmationVO> listByEmployeeId(Long employeeId);
    
    /**
     * 发送转正提醒（定时任务调用）
     * 检查试用期到期前15天的员工，发送转正提醒
     */
    void sendProbationReminders();
}
