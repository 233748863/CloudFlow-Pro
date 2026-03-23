package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.dto.OnboardingApplicationCreateDTO;
import com.cloudflow.hr.domain.dto.OnboardingConfirmDTO;
import com.cloudflow.hr.domain.dto.OnboardingTaskCompleteDTO;
import com.cloudflow.hr.domain.vo.OnboardingApplicationVO;
import com.cloudflow.hr.domain.vo.OnboardingTaskVO;

import java.util.List;

/**
 * 入职流程服务接口
 */
public interface OnboardingService {

    /**
     * 创建入职申请
     *
     * @param dto 入职申请创建DTO
     * @return 入职申请ID
     */
    Long createOnboardingApplication(OnboardingApplicationCreateDTO dto);

    /**
     * 提交入职申请
     *
     * @param applicationId 入职申请ID
     */
    void submitOnboardingApplication(Long applicationId);

    /**
     * 审批通过处理
     *
     * @param applicationId 入职申请ID
     */
    void approveOnboarding(Long applicationId);

    /**
     * 审批拒绝处理
     *
     * @param applicationId 入职申请ID
     */
    void rejectOnboarding(Long applicationId);

    /**
     * 完成入职任务
     *
     * @param dto 任务完成DTO
     */
    void completeOnboardingTask(OnboardingTaskCompleteDTO dto);

    /**
     * 确认入职
     *
     * @param dto 确认入职DTO
     */
    void confirmOnboarding(OnboardingConfirmDTO dto);

    /**
     * 获取入职申请详情
     *
     * @param applicationId 入职申请ID
     * @return 入职申请VO
     */
    OnboardingApplicationVO getOnboardingApplication(Long applicationId);

    /**
     * 获取入职任务列表
     *
     * @param applicationId 入职申请ID
     * @return 入职任务列表
     */
    List<OnboardingTaskVO> getOnboardingTasks(Long applicationId);
}
