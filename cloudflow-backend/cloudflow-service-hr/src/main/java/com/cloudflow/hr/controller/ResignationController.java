package com.cloudflow.hr.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.domain.dto.HandoverCompleteDTO;
import com.cloudflow.hr.domain.dto.ResignationApplicationCreateDTO;
import com.cloudflow.hr.domain.dto.ResignationConfirmDTO;
import com.cloudflow.hr.domain.vo.ResignationApplicationVO;
import com.cloudflow.hr.domain.vo.ResignationHandoverVO;
import com.cloudflow.hr.service.ResignationService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 离职申请控制器
 *
 * @author CloudFlow
 * @since 2026-03-20
 */
@Slf4j
@RestController
@RequestMapping("/resignation")
@RequiredArgsConstructor
public class ResignationController {

    private final ResignationService resignationService;

    /**
     * 创建离职申请
     *
     * @param dto 离职申请创建DTO
     * @return 离职申请ID
     */
    @PostMapping
    public R<Long> createResignationApplication(@Validated @RequestBody ResignationApplicationCreateDTO dto) {
        log.info("创建离职申请，员工ID：{}", dto.getEmployeeId());
        Long applicationId = resignationService.createResignationApplication(dto);
        return R.ok(applicationId);
    }

    /**
     * 提交离职申请（启动审批流程）
     *
     * @param id 离职申请ID
     * @return 操作结果
     */
    @PostMapping("/{id}/submit")
    public R<Void> submitResignationApplication(@PathVariable Long id) {
        log.info("提交离职申请，申请ID：{}", id);
        resignationService.submitResignationApplication(id);
        return R.ok();
    }

    /**
     * 审批通过处理（由工作流回调）
     *
     * @param id 离职申请ID
     * @return 操作结果
     */
    @PostMapping("/{id}/approve")
    public R<Void> approveResignation(@PathVariable Long id) {
        log.info("离职申请审批通过，申请ID：{}", id);
        resignationService.approveResignation(id);
        return R.ok();
    }

    /**
     * 完成离职面谈
     *
     * @param id 离职申请ID
     * @param interviewContent 面谈内容
     * @return 操作结果
     */
    @PostMapping("/{id}/interview")
    public R<Void> conductExitInterview(@PathVariable Long id, @RequestBody String interviewContent) {
        log.info("完成离职面谈，申请ID：{}", id);
        resignationService.conductExitInterview(id, interviewContent);
        return R.ok();
    }

    /**
     * 完成交接
     *
     * @param dto 完成交接DTO
     * @return 操作结果
     */
    @PostMapping("/handover/complete")
    public R<Void> completeHandover(@Validated @RequestBody HandoverCompleteDTO dto) {
        log.info("完成交接，交接ID：{}", dto.getHandoverId());
        resignationService.completeHandover(dto);
        return R.ok();
    }

    /**
     * 确认离职（更新员工状态、注销账号）
     *
     * @param dto 确认离职DTO
     * @return 操作结果
     */
    @PostMapping("/confirm")
    public R<Void> confirmResignation(@Validated @RequestBody ResignationConfirmDTO dto) {
        log.info("确认离职，申请ID：{}", dto.getApplicationId());
        resignationService.confirmResignation(dto);
        return R.ok();
    }

    /**
     * 查询离职申请详情
     *
     * @param id 离职申请ID
     * @return 离职申请VO
     */
    @GetMapping("/{id}")
    public R<ResignationApplicationVO> getResignationApplication(@PathVariable Long id) {
        log.info("查询离职申请详情，申请ID：{}", id);
        ResignationApplicationVO vo = resignationService.getResignationApplication(id);
        return R.ok(vo);
    }

    /**
     * 查询员工的离职申请列表
     *
     * @param employeeId 员工ID
     * @return 离职申请列表
     */
    @GetMapping("/employee/{employeeId}")
    public R<List<ResignationApplicationVO>> listByEmployeeId(@PathVariable Long employeeId) {
        log.info("查询员工的离职申请列表，员工ID：{}", employeeId);
        List<ResignationApplicationVO> list = resignationService.listByEmployeeId(employeeId);
        return R.ok(list);
    }

    /**
     * 查询离职交接清单
     *
     * @param applicationId 离职申请ID
     * @return 交接清单列表
     */
    @GetMapping("/{applicationId}/handovers")
    public R<List<ResignationHandoverVO>> listHandovers(@PathVariable Long applicationId) {
        log.info("查询离职交接清单，申请ID：{}", applicationId);
        List<ResignationHandoverVO> list = resignationService.listHandovers(applicationId);
        return R.ok(list);
    }
}
