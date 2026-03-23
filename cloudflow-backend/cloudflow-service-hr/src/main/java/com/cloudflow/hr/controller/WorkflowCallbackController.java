package com.cloudflow.hr.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.domain.dto.ApprovalResultDTO;
import com.cloudflow.hr.service.WorkflowCallbackService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

/**
 * 工作流回调控制器
 * 接收工作流服务的审批结果回调
 *
 * @author CloudFlow
 * @since 2026-03-20
 */
@Slf4j
@RestController
@RequestMapping("/callback")
@RequiredArgsConstructor
public class WorkflowCallbackController {

    private final WorkflowCallbackService workflowCallbackService;

    /**
     * 处理审批结果回调
     * 工作流服务完成审批后调用此接口通知HR服务
     *
     * @param dto 审批结果DTO
     * @return 处理结果
     */
    @PostMapping("/approval")
    public R<Void> handleApprovalResult(@RequestBody ApprovalResultDTO dto) {
        log.info("接收审批结果回调，businessType: {}, businessId: {}, result: {}", 
                dto.getBusinessType(), dto.getBusinessId(), dto.getApprovalResult());

        try {
            // 调用服务层处理审批结果
            workflowCallbackService.handleApprovalResult(dto);
            
            log.info("审批结果回调处理成功，businessType: {}, businessId: {}", 
                    dto.getBusinessType(), dto.getBusinessId());
            
            return R.ok();
        } catch (Exception e) {
            log.error("审批结果回调处理失败，businessType: {}, businessId: {}", 
                    dto.getBusinessType(), dto.getBusinessId(), e);
            return R.fail("审批结果回调处理失败：" + e.getMessage());
        }
    }

    /**
     * 健康检查接口
     * 用于验证回调接口是否可用
     *
     * @return 健康状态
     */
    @GetMapping("/health")
    public R<String> health() {
        return R.ok("工作流回调服务运行正常");
    }
}
