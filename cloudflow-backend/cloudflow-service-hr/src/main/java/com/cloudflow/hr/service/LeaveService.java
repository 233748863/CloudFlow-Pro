package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.cloudflow.hr.domain.dto.*;
import com.cloudflow.hr.domain.vo.LeaveApplicationVO;
import com.cloudflow.hr.domain.vo.LeaveQuotaVO;
import com.cloudflow.hr.domain.vo.LeaveTypeVO;

import java.util.List;

/**
 * 假期管理服务接口
 */
public interface LeaveService {
    
    // ==================== 假期类型管理 ====================
    
    /**
     * 创建假期类型
     *
     * @param dto 假期类型创建DTO
     * @return 假期类型ID
     */
    Long createLeaveType(LeaveTypeCreateDTO dto);
    
    /**
     * 更新假期类型
     *
     * @param id 假期类型ID
     * @param dto 假期类型更新DTO
     */
    void updateLeaveType(Long id, LeaveTypeUpdateDTO dto);
    
    /**
     * 获取假期类型详情
     *
     * @param id 假期类型ID
     * @return 假期类型VO
     */
    LeaveTypeVO getLeaveType(Long id);
    
    /**
     * 获取假期类型列表
     *
     * @return 假期类型列表
     */
    List<LeaveTypeVO> listLeaveTypes();
    
    // ==================== 假期额度管理 ====================
    
    /**
     * 初始化员工年度假期额度
     *
     * @param employeeId 员工ID
     * @param year 年度
     */
    void initLeaveQuota(Long employeeId, Integer year);
    
    /**
     * 调整假期额度
     *
     * @param dto 假期额度调整DTO
     */
    void adjustLeaveQuota(LeaveQuotaAdjustDTO dto);
    
    /**
     * 获取员工假期额度
     *
     * @param employeeId 员工ID
     * @param leaveTypeId 假期类型ID
     * @param year 年度
     * @return 假期额度VO
     */
    LeaveQuotaVO getLeaveQuota(Long employeeId, Long leaveTypeId, Integer year);
    
    /**
     * 获取员工假期额度列表
     *
     * @param employeeId 员工ID
     * @param year 年度
     * @return 假期额度列表
     */
    List<LeaveQuotaVO> listLeaveQuotas(Long employeeId, Integer year);
    
    // ==================== 请假申请管理 ====================
    
    /**
     * 创建请假申请
     *
     * @param dto 请假申请创建DTO
     * @return 请假申请ID
     */
    Long createLeaveApplication(LeaveApplicationCreateDTO dto);
    
    /**
     * 提交请假申请（启动审批流程）
     *
     * @param id 请假申请ID
     */
    void submitLeaveApplication(Long id);
    
    /**
     * 审批通过后扣减额度
     *
     * @param id 请假申请ID
     */
    void approveLeaveApplication(Long id);
    
    /**
     * 审批拒绝后释放冻结额度
     *
     * @param id 请假申请ID
     */
    void rejectLeaveApplication(Long id);
    
    /**
     * 撤销请假后恢复额度
     *
     * @param id 请假申请ID
     */
    void cancelLeaveApplication(Long id);
    
    /**
     * 获取请假申请详情
     *
     * @param id 请假申请ID
     * @return 请假申请详情
     */
    LeaveApplicationVO getLeaveApplication(Long id);

    /**
     * 分页查询请假申请列表
     *
     * @param query 查询条件
     * @return 请假申请分页列表
     */
    IPage<LeaveApplicationVO> listLeaveApplications(LeaveApplicationQueryDTO query);
}
