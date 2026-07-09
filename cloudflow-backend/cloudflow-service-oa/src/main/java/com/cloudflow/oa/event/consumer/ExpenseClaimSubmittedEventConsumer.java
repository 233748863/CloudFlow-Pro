package com.cloudflow.oa.event.consumer;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.event.core.BusinessEventConsumer;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.workflow.callback.config.WorkflowCallbackConstants;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.cloudflow.oa.constant.OaBusinessTypes;
import com.cloudflow.oa.domain.BizExpenseClaim;
import com.cloudflow.oa.domain.dto.InternalWorkflowStartDTO;
import com.cloudflow.oa.event.ExpenseClaimSubmittedEvent;
import com.cloudflow.oa.service.remote.RemoteWorkflowService;
import com.cloudflow.oa.service.impl.OaWorkflowFailureHelper;
import com.cloudflow.oa.service.impl.ExpenseClaimServiceImpl;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

@Slf4j
@Component
@RequiredArgsConstructor
public class ExpenseClaimSubmittedEventConsumer implements BusinessEventConsumer {

    private final ObjectMapper objectMapper;
    private final RemoteWorkflowService remoteWorkflowService;
    private final ExpenseClaimServiceImpl expenseClaimService;
    private final OaWorkflowFailureHelper workflowFailureHelper;

    @Override
    public String eventType() {
        return "EXPENSE_CLAIM_SUBMITTED";
    }

    @Override
    public void consume(BusinessEventEnvelope envelope) throws Exception {
        ExpenseClaimSubmittedEvent event = objectMapper.readValue(envelope.getPayload(), ExpenseClaimSubmittedEvent.class);
        BizExpenseClaim claim = expenseClaimService.getById(event.getClaimId());
        if (claim == null) {
            log.warn("skip expense claim workflow start, claim not found, claimId={}, eventId={}", event.getClaimId(), envelope.getEventId());
            return;
        }
        if (claim.getInstanceId() != null && !claim.getInstanceId().isBlank()) {
            log.info("skip expense claim workflow start, instance already exists, claimId={}, instanceId={}", claim.getId(), claim.getInstanceId());
            return;
        }
        startWorkflow(claim, event, envelope.getTenantId());
    }

    private void startWorkflow(BizExpenseClaim claim, ExpenseClaimSubmittedEvent event, Long tenantId) {
        try {
            InternalWorkflowStartDTO req = new InternalWorkflowStartDTO();
            req.setTenantId(requireTenantId(tenantId));
            req.setProcessDefKey("expense_claim");
            req.setBusinessKey("EXPENSE_CLAIM:" + claim.getId());
            req.setStartUserId(event.getUserId());
            req.setStartUserName(event.getUserName());
            Map<String, Object> variables = new HashMap<>();
            variables.put("claimId", claim.getId());
            variables.put("claimNo", event.getClaimNo());
            variables.put("totalAmount", event.getTotalAmount());
            variables.put("userId", event.getUserId());
            variables.put("userName", event.getUserName());
            variables.put("category", event.getCategory());
            variables.put("description", event.getDescription());
            variables.put("deptName", event.getDeptName());
            variables.put("exceededStandard", Boolean.TRUE.equals(event.getExceededStandard()));
            variables.put("exceededAmount", event.getExceededAmount() != null ? event.getExceededAmount() : BigDecimal.ZERO);
            variables.put("budgetExceeded", Boolean.TRUE.equals(event.getBudgetExceeded()));
            variables.put("budgetExceededAmount", event.getBudgetExceededAmount() != null ? event.getBudgetExceededAmount() : BigDecimal.ZERO);
            WorkflowCallbackConstants.applyCallbackMetadata(
                    variables,
                    OaBusinessTypes.EXPENSE_CLAIM,
                    claim.getId(),
                    event.getClaimNo(),
                    "workflow:stream:approval-callback:oa"
            );
            req.setVariables(variables);

            R<?> result = remoteWorkflowService.startProcessInternal(req);
            if (result != null && result.getCode() == 200 && result.getData() != null) {
                String instanceId = extractInstanceId(result.getData());
                if (instanceId != null) {
                    LambdaUpdateWrapper<BizExpenseClaim> wrapper = new LambdaUpdateWrapper<>();
                    wrapper.eq(BizExpenseClaim::getId, claim.getId())
                            .and(w -> w.isNull(BizExpenseClaim::getInstanceId).or().eq(BizExpenseClaim::getInstanceId, ""))
                            .set(BizExpenseClaim::getInstanceId, instanceId)
                            .set(BizExpenseClaim::getUpdateTime, LocalDateTime.now())
                            .set(BizExpenseClaim::getUpdateBy, UserContext.getUserName() != null ? UserContext.getUserName() : "event-consumer");
                    expenseClaimService.update(null, wrapper);
                }
                log.info("报销申请 {} 工作流启动成功，流程实例ID: {}", event.getClaimNo(), instanceId);
                return;
            }
            log.warn("报销申请 {} 工作流启动返回异常: {}", event.getClaimNo(), result != null ? result.getMsg() : "null");
            throw new IllegalStateException("workflow start returned non-200");
        } catch (Exception e) {
            log.error("报销申请 {} 异步启动工作流失败", event.getClaimNo(), e);
            workflowFailureHelper.handleWorkflowStartFailure(
                    OaBusinessTypes.EXPENSE_CLAIM, event.getClaimId(), event.getClaimNo(),
                    event.getUserName(), event.getUserId(), e);
        }
    }

    private Long requireTenantId(Long tenantId) {
        if (tenantId == null) {
            throw new IllegalArgumentException("tenantId不能为空");
        }
        return tenantId;
    }

    @SuppressWarnings("unchecked")
    private String extractInstanceId(Object data) {
        if (data instanceof Map) {
            Map<String, Object> dataMap = (Map<String, Object>) data;
            Object instanceId = dataMap.get("processInstanceId");
            if (instanceId == null) {
                instanceId = dataMap.get("instanceId");
            }
            return instanceId != null ? String.valueOf(instanceId) : null;
        }
        return data instanceof String ? (String) data : null;
    }
}
