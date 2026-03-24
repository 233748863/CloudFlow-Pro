package com.cloudflow.hr.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.domain.dto.OnboardingApplicationCreateDTO;
import com.cloudflow.hr.domain.dto.OnboardingConfirmDTO;
import com.cloudflow.hr.domain.dto.OnboardingTaskCompleteDTO;
import com.cloudflow.hr.domain.vo.OnboardingApplicationVO;
import com.cloudflow.hr.domain.vo.OnboardingTaskVO;
import com.cloudflow.hr.service.OnboardingService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 入职流程控制器
 *
 * @author CloudFlow
 * @since 2026-03-20
 */
@Slf4j
@RestController
@RequestMapping("/onboarding")
@RequiredArgsConstructor
public class OnboardingController {

    private final OnboardingService onboardingService;

    /**
     * 创建入职申请
     *
     * @param dto 入职申请创建DTO
     * @return 入职申请ID
     */
    @PostMapping("/application")
    public R<Long> createOnboardingApplication(@Validated @RequestBody OnboardingApplicationCreateDTO dto) {
        log.info("创建入职申请，姓名：{}", dto.getName());
        Long applicationId = onboardingService.createOnboardingApplication(dto);
        return R.ok(applicationId);
    }

    /**
     * 提交入职申请（启动审批流程）
     *
     * @param applicationId 入职申请ID
     * @return 操作结果
     */
    @PostMapping("/application/{applicationId}/submit")
    public R<Void> submitOnboardingApplication(@PathVariable Long applicationId) {
        log.info("提交入职申请，申请ID：{}", applicationId);
        onboardingService.submitOnboardingApplication(applicationId);
        return R.ok();
    }

    /**
     * 审批通过处理（由工作流回调）
     *
     * @param applicationId 入职申请ID
     * @return 操作结果
     */
    @PostMapping("/application/{applicationId}/approve")
    public R<Void> approveOnboarding(@PathVariable Long applicationId) {
        log.info("入职申请审批通过，申请ID：{}", applicationId);
        onboardingService.approveOnboarding(applicationId);
        return R.ok();
    }

    /**
     * 完成入职任务
     *
     * @param dto 任务完成DTO
     * @return 操作结果
     */
    @PostMapping("/task/complete")
    public R<Void> completeOnboardingTask(@Validated @RequestBody OnboardingTaskCompleteDTO dto) {
        log.info("完成入职任务，任务ID：{}", dto.getTaskId());
        onboardingService.completeOnboardingTask(dto);
        return R.ok();
    }

    /**
     * 确认入职（更新员工状态、记录入职日期）
     *
     * @param dto 确认入职DTO
     * @return 操作结果
     */
    @PostMapping("/application/confirm")
    public R<Void> confirmOnboarding(@Validated @RequestBody OnboardingConfirmDTO dto) {
        log.info("确认入职，申请ID：{}", dto.getApplicationId());
        onboardingService.confirmOnboarding(dto);
        return R.ok();
    }

    /**
     * 获取入职申请列表
     *
     * @param keyword 关键词
     * @param status 状态
     * @return 入职申请列表
     */
    @GetMapping("/application/list")
    public R<List<OnboardingApplicationVO>> listOnboardingApplications(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String status) {
        log.info("查询入职申请列表，keyword：{}，status：{}", keyword, status);
        List<OnboardingApplicationVO> applications = onboardingService.listOnboardingApplications(keyword, status);
        return R.ok(applications);
    }

    /**
     * 获取入职申请详情
     *
     * @param applicationId 入职申请ID
     * @return 入职申请VO
     */
    @GetMapping("/application/{applicationId}")
    public R<OnboardingApplicationVO> getOnboardingApplication(@PathVariable Long applicationId) {
        log.info("查询入职申请详情，申请ID：{}", applicationId);
        OnboardingApplicationVO vo = onboardingService.getOnboardingApplication(applicationId);
        return R.ok(vo);
    }

    /**
     * 获取入职任务列表
     *
     * @param applicationId 入职申请ID
     * @return 入职任务列表
     */
    @GetMapping("/application/{applicationId}/tasks")
    public R<List<OnboardingTaskVO>> getOnboardingTasks(@PathVariable Long applicationId) {
        log.info("查询入职任务列表，申请ID：{}", applicationId);
        List<OnboardingTaskVO> tasks = onboardingService.getOnboardingTasks(applicationId);
        return R.ok(tasks);
    }
}
