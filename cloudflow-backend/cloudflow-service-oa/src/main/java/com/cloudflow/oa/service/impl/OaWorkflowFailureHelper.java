package com.cloudflow.oa.service.impl;

import com.cloudflow.oa.service.ISysNoticeService;
import com.cloudflow.oa.service.IOaTraceEventService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * 工作流启动失败处理帮助类。
 * <p>
 * 当远程工作流服务调用失败时，记录审计事件并通知提交人，
 * 避免业务单据静默停留在 PENDING 状态而无人知晓。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class OaWorkflowFailureHelper {

    private final IOaTraceEventService oaTraceEventService;
    private final ISysNoticeService sysNoticeService;

    /**
     * 记录工作流启动失败事件并通知提交人。
     *
     * @param businessType  业务类型（OaBusinessTypes 常量）
     * @param businessId    业务 ID
     * @param businessNo    业务编号（用于展示）
     * @param submitterName 提交人姓名
     * @param submitterId   提交人 ID
     * @param e             异常对象（可为 null）
     */
    public void handleWorkflowStartFailure(String businessType, Long businessId, String businessNo,
                                           String submitterName, Long submitterId, Exception e) {
        String errorMsg = e != null ? e.getMessage() : "未知错误";

        // 1. 记录审计事件
        try {
            oaTraceEventService.record(null, businessType, businessId, businessType, businessId,
                    "WORKFLOW_START_FAIL", "工作流启动失败",
                    businessNo + " 工作流启动失败: " + errorMsg,
                    submitterId, submitterName, null);
        } catch (Exception ex) {
            log.warn("记录工作流失败事件异常: businessType={}, businessId={}", businessType, businessId, ex);
        }

        // 2. 通知提交人
        try {
            if (submitterId != null) {
                sysNoticeService.sendNotice(submitterId,
                        "工作流启动失败",
                        "您的申请 " + businessNo + " 已提交，但审批流程启动失败，请联系管理员或稍后重试。",
                        "3",
                        submitterId, submitterName);
            }
        } catch (Exception ex) {
            log.warn("发送工作流失败通知异常: businessType={}, businessId={}", businessType, businessId, ex);
        }
    }
}
