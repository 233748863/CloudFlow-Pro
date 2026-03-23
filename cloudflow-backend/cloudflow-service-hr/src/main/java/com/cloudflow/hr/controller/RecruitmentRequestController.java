package com.cloudflow.hr.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.domain.dto.RecruitmentRequestCreateDTO;
import com.cloudflow.hr.domain.dto.RecruitmentRequestQueryDTO;
import com.cloudflow.hr.domain.vo.RecruitmentRequestVO;
import com.cloudflow.hr.service.RecruitmentRequestService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

/**
 * 招聘需求管理Controller
 *
 * @author CloudFlow
 * @since 2026-03-20
 */
@Slf4j
@RestController
@RequestMapping("/recruitment-request")
@RequiredArgsConstructor
public class RecruitmentRequestController {

    private final RecruitmentRequestService recruitmentRequestService;

    /**
     * 创建招聘需求
     *
     * @param dto 创建DTO
     * @return 招聘需求ID
     */
    @PostMapping
    public R<Long> createRecruitmentRequest(@Validated @RequestBody RecruitmentRequestCreateDTO dto) {
        log.info("创建招聘需求，部门ID：{}，职位ID：{}", dto.getDeptId(), dto.getPositionId());
        Long requestId = recruitmentRequestService.createRecruitmentRequest(dto);
        return R.ok(requestId);
    }

    /**
     * 提交招聘需求审批
     *
     * @param requestId 招聘需求ID
     * @return 操作结果
     */
    @PostMapping("/{requestId}/submit")
    public R<Void> submitRecruitmentRequest(@PathVariable Long requestId) {
        log.info("提交招聘需求审批，需求ID：{}", requestId);
        recruitmentRequestService.submitRecruitmentRequest(requestId);
        return R.ok();
    }

    /**
     * 审批通过招聘需求
     *
     * @param requestId 招聘需求ID
     * @return 操作结果
     */
    @PostMapping("/{requestId}/approve")
    public R<Void> approveRecruitmentRequest(@PathVariable Long requestId) {
        log.info("审批通过招聘需求，需求ID：{}", requestId);
        recruitmentRequestService.approveRecruitmentRequest(requestId);
        return R.ok();
    }

    /**
     * 完成招聘需求
     *
     * @param requestId 招聘需求ID
     * @return 操作结果
     */
    @PostMapping("/{requestId}/complete")
    public R<Void> completeRecruitmentRequest(@PathVariable Long requestId) {
        log.info("完成招聘需求，需求ID：{}", requestId);
        recruitmentRequestService.completeRecruitmentRequest(requestId);
        return R.ok();
    }

    /**
     * 取消招聘需求
     *
     * @param requestId 招聘需求ID
     * @return 操作结果
     */
    @PostMapping("/{requestId}/cancel")
    public R<Void> cancelRecruitmentRequest(@PathVariable Long requestId) {
        log.info("取消招聘需求，需求ID：{}", requestId);
        recruitmentRequestService.cancelRecruitmentRequest(requestId);
        return R.ok();
    }

    /**
     * 查询招聘需求详情
     *
     * @param requestId 招聘需求ID
     * @return 招聘需求VO
     */
    @GetMapping("/{requestId}")
    public R<RecruitmentRequestVO> getRecruitmentRequest(@PathVariable Long requestId) {
        log.info("查询招聘需求详情，需求ID：{}", requestId);
        RecruitmentRequestVO vo = recruitmentRequestService.getRecruitmentRequest(requestId);
        return R.ok(vo);
    }

    /**
     * 分页查询招聘需求列表
     *
     * @param query 查询条件
     * @return 招聘需求分页列表
     */
    @GetMapping("/list")
    public R<Page<RecruitmentRequestVO>> listRecruitmentRequests(RecruitmentRequestQueryDTO query) {
        log.info("分页查询招聘需求列表，查询条件：{}", query);
        Page<RecruitmentRequestVO> page = recruitmentRequestService.listRecruitmentRequests(query);
        return R.ok(page);
    }
}
