package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.dto.InterviewEvaluationDTO;
import com.cloudflow.hr.domain.dto.InterviewQueryDTO;
import com.cloudflow.hr.domain.dto.InterviewScheduleDTO;
import com.cloudflow.hr.domain.dto.InterviewUpdateDTO;
import com.cloudflow.hr.domain.vo.InterviewVO;

import java.util.List;

/**
 * 面试服务接口
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
public interface InterviewService {

    /**
     * 安排面试
     * 
     * @param dto 面试安排信息
     * @return 面试ID
     */
    Long scheduleInterview(InterviewScheduleDTO dto);

    /**
     * 更新面试
     * 
     * @param id 面试ID
     * @param dto 面试更新信息
     */
    void updateInterview(Long id, InterviewUpdateDTO dto);

    /**
     * 完成面试评价
     * 
     * @param id 面试ID
     * @param dto 面试评价信息
     */
    void completeInterview(Long id, InterviewEvaluationDTO dto);

    /**
     * 取消面试
     * 
     * @param id 面试ID
     */
    void cancelInterview(Long id);

    /**
     * 查询面试详情
     * 
     * @param id 面试ID
     * @return 面试详情
     */
    InterviewVO getInterview(Long id);

    /**
     * 查询面试列表
     * 
     * @param query 查询条件
     * @return 面试列表
     */
    List<InterviewVO> listInterviews(InterviewQueryDTO query);
}
