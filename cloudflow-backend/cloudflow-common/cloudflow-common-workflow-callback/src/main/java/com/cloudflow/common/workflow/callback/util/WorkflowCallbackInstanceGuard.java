package com.cloudflow.common.workflow.callback.util;

import lombok.extern.slf4j.Slf4j;
import org.springframework.util.StringUtils;

import java.util.Objects;

/**
 * 审批回调实例保护：业务单据只允许当前绑定的流程实例回写。
 */
@Slf4j
public final class WorkflowCallbackInstanceGuard {

    private WorkflowCallbackInstanceGuard() {
    }

    public static boolean shouldSkipStaleCallback(String businessName,
                                                  Long businessId,
                                                  String currentInstanceId,
                                                  String callbackInstanceId) {
        if (!StringUtils.hasText(currentInstanceId)) {
            throw new IllegalStateException(businessName + "流程实例未回填，等待回调重试，businessId=" + businessId);
        }
        if (!Objects.equals(currentInstanceId, callbackInstanceId)) {
            log.warn("审批回调实例不匹配，跳过业务回写: businessName={}, businessId={}, currentInstanceId={}, callbackInstanceId={}",
                    businessName, businessId, currentInstanceId, callbackInstanceId);
            return true;
        }
        return false;
    }
}
