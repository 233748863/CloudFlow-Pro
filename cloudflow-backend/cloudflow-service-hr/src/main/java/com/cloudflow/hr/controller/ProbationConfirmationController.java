package com.cloudflow.hr.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.domain.dto.ProbationConfirmationCreateDTO;
import com.cloudflow.hr.domain.vo.ProbationConfirmationVO;
import com.cloudflow.hr.service.ProbationConfirmationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 转正申请控制器
 *
 * @author CloudFlow
 * @since 2026-03-20
 */
@Slf4j
@RestController
@RequestMapping("/probation-confirmation")
@RequiredArgsConstructor
@Tag(name = "员工转正管理", description = "员工转正申请、审批和提醒相关接口")
public class ProbationConfirmationController {

    private final ProbationConfirmationService probationConfirmationService;

    /**
     * 创建转正申请
     *
     * @param dto 转正申请创建DTO
     * @return 转正申请ID
     */
    @PostMapping
    @Operation(summary = "创建转正申请")
    public R<Long> createProbationConfirmation(@Valid @RequestBody ProbationConfirmationCreateDTO dto) {
        log.info("创建转正申请，员工ID：{}", dto.getEmployeeId());
        Long confirmationId = probationConfirmationService.createProbationConfirmation(dto);
        return R.ok(confirmationId);
    }

    /**
     * 提交转正申请（启动审批流程）
     *
     * @param id 转正申请ID
     * @return 操作结果
     */
    @PostMapping("/{id}/submit")
    @Operation(summary = "提交转正申请")
    public R<Void> submitProbationConfirmation(@PathVariable Long id) {
        log.info("提交转正申请，申请ID：{}", id);
        probationConfirmationService.submitProbationConfirmation(id);
        return R.ok();
    }

    /**
     * 审批通过处理（由工作流回调）
     *
     * @param id 转正申请ID
     * @return 操作结果
     */
    @PostMapping("/{id}/approve")
    @Operation(summary = "审批通过转正申请")
    public R<Void> approveProbationConfirmation(@PathVariable Long id) {
        log.info("转正申请审批通过，申请ID：{}", id);
        probationConfirmationService.approveProbationConfirmation(id);
        return R.ok();
    }

    /**
     * 审批拒绝处理（由工作流回调）
     *
     * @param id 转正申请ID
     * @param reason 拒绝原因
     * @param extensionDays 延长天数（可选，如果为null则标记为离职）
     * @return 操作结果
     */
    @PostMapping("/{id}/reject")
    @Operation(summary = "拒绝转正申请")
    public R<Void> rejectProbationConfirmation(@PathVariable Long id,
                                                @RequestParam String reason,
                                                @RequestParam(required = false) Integer extensionDays) {
        log.info("转正申请审批拒绝，申请ID：{}，拒绝原因：{}，延长天数：{}", id, reason, extensionDays);
        probationConfirmationService.rejectProbationConfirmation(id, reason, extensionDays);
        return R.ok();
    }

    /**
     * 查询转正申请详情
     *
     * @param id 转正申请ID
     * @return 转正申请VO
     */
    @GetMapping("/{id}")
    @Operation(summary = "查询转正申请详情")
    public R<ProbationConfirmationVO> getProbationConfirmation(@PathVariable Long id) {
        log.info("查询转正申请详情，申请ID：{}", id);
        ProbationConfirmationVO vo = probationConfirmationService.getProbationConfirmation(id);
        return R.ok(vo);
    }

    /**
     * 查询员工的转正申请列表
     *
     * @param employeeId 员工ID
     * @return 转正申请列表
     */
    @GetMapping("/employee/{employeeId}")
    @Operation(summary = "查询员工转正申请列表")
    public R<List<ProbationConfirmationVO>> listByEmployeeId(@PathVariable Long employeeId) {
        log.info("查询员工的转正申请列表，员工ID：{}", employeeId);
        List<ProbationConfirmationVO> list = probationConfirmationService.listByEmployeeId(employeeId);
        return R.ok(list);
    }

    /**
     * 手动触发转正提醒（用于测试）
     *
     * @return 操作结果
     */
    @PostMapping("/send-reminders")
    @Operation(summary = "手动触发转正提醒")
    public R<Void> sendProbationReminders() {
        log.info("手动触发转正提醒");
        probationConfirmationService.sendProbationReminders();
        return R.ok();
    }
}
