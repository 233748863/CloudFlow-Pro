package com.cloudflow.hr.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.domain.dto.TransferApplicationCreateDTO;
import com.cloudflow.hr.domain.vo.TransferApplicationVO;
import com.cloudflow.hr.service.TransferService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 调岗申请控制器
 *
 * @author CloudFlow
 * @since 2026-03-20
 */
@Slf4j
@RestController
@RequestMapping("/transfer")
@RequiredArgsConstructor
public class TransferController {

    private final TransferService transferService;

    /**
     * 创建调岗申请
     *
     * @param dto 调岗申请创建DTO
     * @return 调岗申请ID
     */
    @PostMapping
    public R<Long> createTransferApplication(@Validated @RequestBody TransferApplicationCreateDTO dto) {
        log.info("创建调岗申请，员工ID：{}", dto.getEmployeeId());
        Long applicationId = transferService.createTransferApplication(dto);
        return R.ok(applicationId);
    }

    /**
     * 提交调岗申请（启动审批流程）
     *
     * @param id 调岗申请ID
     * @return 操作结果
     */
    @PostMapping("/{id}/submit")
    public R<Void> submitTransferApplication(@PathVariable Long id) {
        log.info("提交调岗申请，申请ID：{}", id);
        transferService.submitTransferApplication(id);
        return R.ok();
    }

    /**
     * 审批通过处理（由工作流回调）
     *
     * @param id 调岗申请ID
     * @return 操作结果
     */
    @PostMapping("/{id}/approve")
    public R<Void> approveTransfer(@PathVariable Long id) {
        log.info("调岗申请审批通过，申请ID：{}", id);
        transferService.approveTransfer(id);
        return R.ok();
    }

    /**
     * 调岗生效（记录调岗历史）
     *
     * @param id 调岗申请ID
     * @return 操作结果
     */
    @PostMapping("/{id}/effective")
    public R<Void> effectiveTransfer(@PathVariable Long id) {
        log.info("调岗生效，申请ID：{}", id);
        transferService.effectiveTransfer(id);
        return R.ok();
    }

    /**
     * 查询调岗申请详情
     *
     * @param id 调岗申请ID
     * @return 调岗申请VO
     */
    @GetMapping("/{id}")
    public R<TransferApplicationVO> getTransferApplication(@PathVariable Long id) {
        log.info("查询调岗申请详情，申请ID：{}", id);
        TransferApplicationVO vo = transferService.getTransferApplication(id);
        return R.ok(vo);
    }

    /**
     * 查询员工的调岗申请列表
     *
     * @param employeeId 员工ID
     * @return 调岗申请列表
     */
    @GetMapping("/employee/{employeeId}")
    public R<List<TransferApplicationVO>> listByEmployeeId(@PathVariable Long employeeId) {
        log.info("查询员工的调岗申请列表，员工ID：{}", employeeId);
        List<TransferApplicationVO> list = transferService.listByEmployeeId(employeeId);
        return R.ok(list);
    }
}
