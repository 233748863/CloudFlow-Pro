package com.cloudflow.hr.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.domain.dto.InterviewEvaluationDTO;
import com.cloudflow.hr.domain.dto.InterviewQueryDTO;
import com.cloudflow.hr.domain.dto.InterviewScheduleDTO;
import com.cloudflow.hr.domain.dto.InterviewUpdateDTO;
import com.cloudflow.hr.domain.vo.InterviewVO;
import com.cloudflow.hr.service.InterviewService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 面试管理控制器
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Slf4j
@RestController
@RequestMapping("/interview")
@RequiredArgsConstructor
@Tag(name = "面试管理", description = "面试管理相关接口")
public class InterviewController {

    private final InterviewService interviewService;

    /**
     * 安排面试
     */
    @PostMapping("/schedule")
    @Operation(summary = "安排面试", description = "为候选人安排面试")
    public R<Long> scheduleInterview(@Validated @RequestBody InterviewScheduleDTO dto) {
        log.info("安排面试请求: {}", dto);
        Long id = interviewService.scheduleInterview(dto);
        return R.ok(id);
    }

    /**
     * 更新面试
     */
    @PutMapping("/{id}")
    @Operation(summary = "更新面试", description = "更新面试信息")
    public R<Void> updateInterview(@PathVariable Long id,
                                   @RequestBody InterviewUpdateDTO dto) {
        log.info("更新面试请求，面试ID: {}, 更新信息: {}", id, dto);
        interviewService.updateInterview(id, dto);
        return R.ok();
    }

    /**
     * 完成面试评价
     */
    @PostMapping("/{id}/complete")
    @Operation(summary = "完成面试评价", description = "完成面试并提交评价")
    public R<Void> completeInterview(@PathVariable Long id,
                                     @Validated @RequestBody InterviewEvaluationDTO dto) {
        log.info("完成面试评价请求，面试ID: {}, 评价信息: {}", id, dto);
        interviewService.completeInterview(id, dto);
        return R.ok();
    }

    /**
     * 取消面试
     */
    @PostMapping("/{id}/cancel")
    @Operation(summary = "取消面试", description = "取消已安排的面试")
    public R<Void> cancelInterview(@PathVariable Long id) {
        log.info("取消面试请求，面试ID: {}", id);
        interviewService.cancelInterview(id);
        return R.ok();
    }

    /**
     * 查询面试详情
     */
    @GetMapping("/{id}")
    @Operation(summary = "查询面试详情", description = "根据ID查询面试详情")
    public R<InterviewVO> getInterview(@PathVariable Long id) {
        log.info("查询面试详情请求，面试ID: {}", id);
        InterviewVO vo = interviewService.getInterview(id);
        return R.ok(vo);
    }

    /**
     * 查询面试列表
     */
    @GetMapping("/list")
    @Operation(summary = "查询面试列表", description = "根据条件查询面试列表")
    public R<List<InterviewVO>> listInterviews(InterviewQueryDTO query) {
        log.info("查询面试列表请求，查询条件: {}", query);
        List<InterviewVO> list = interviewService.listInterviews(query);
        return R.ok(list);
    }
}
