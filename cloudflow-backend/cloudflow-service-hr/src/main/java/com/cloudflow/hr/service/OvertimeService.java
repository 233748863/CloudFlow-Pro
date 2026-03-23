package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.dto.OvertimeApplicationCreateDTO;
import com.cloudflow.hr.domain.dto.OvertimeApplicationQueryDTO;
import com.cloudflow.hr.domain.vo.OvertimeApplicationVO;
import com.cloudflow.hr.domain.vo.OvertimeStatisticsVO;

import java.time.YearMonth;
import java.util.List;

/**
 * 加班管理服务接口
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
public interface OvertimeService {

    /**
     * 创建加班申请
     * 
     * @param dto 创建DTO
     * @return 申请ID
     */
    Long createOvertimeApplication(OvertimeApplicationCreateDTO dto);

    /**
     * 提交加班申请（启动审批流程）
     * 
     * @param id 申请ID
     */
    void submitOvertimeApplication(Long id);

    /**
     * 审批通过后处理（转换为调休或加班费）
     * 
     * @param id 申请ID
     */
    void approveOvertimeApplication(Long id);

    /**
     * 审批拒绝
     * 
     * @param id 申请ID
     */
    void rejectOvertimeApplication(Long id);

    /**
     * 查询加班申请列表
     * 
     * @param query 查询条件
     * @return 加班申请列表
     */
    List<OvertimeApplicationVO> listOvertimeApplications(OvertimeApplicationQueryDTO query);

    /**
     * 获取加班申请详情
     * 
     * @param id 申请ID
     * @return 加班申请详情
     */
    OvertimeApplicationVO getOvertimeApplication(Long id);

    /**
     * 获取员工加班统计
     * 
     * @param employeeId 员工ID
     * @param yearMonth 年月
     * @return 加班统计数据
     */
    OvertimeStatisticsVO getOvertimeStatistics(Long employeeId, YearMonth yearMonth);
}
