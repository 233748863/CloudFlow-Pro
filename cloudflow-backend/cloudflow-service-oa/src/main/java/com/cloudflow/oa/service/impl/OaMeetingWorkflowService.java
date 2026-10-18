package com.cloudflow.oa.service.impl;

import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.oa.domain.SysScheduleEvent;
import com.cloudflow.oa.domain.dto.BusinessProcessInvalidateDTO;
import com.cloudflow.oa.domain.dto.OaApprovalRequest;
import com.cloudflow.oa.domain.dto.OaMeetingWorkflowClosed;
import com.cloudflow.oa.mapper.OaMeetingMapper;
import com.cloudflow.oa.service.IOaTraceEventService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Consumer;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Service
@RequiredArgsConstructor
public class OaMeetingWorkflowService {
    private final OaMeetingAccess access;
    private final OaMeetingMapper meetings;
    private final OaApprovalOutboxService approvals;
    private final OaMeetingReminderService reminders;
    private final OutboxPublisher publisher;
    private final IOaTraceEventService trace;
    private final ObjectMapper json;
    private final PlatformTransactionManager transactions;

    public String currentInstance(Long id) {
        SysScheduleEvent event = access.get(id);
        return pending(event) ? event.getInstanceId() : null;
    }

    public void bind(OaApprovalRequest request, String instanceId) {
        OaRecordSupport.same(OaRecordSupport.tenantId(), request.getTenantId(), "审批租户不一致");
        OaRecordSupport.same(OaMeetingBookingService.BUSINESS_TYPE, request.getBusinessType(), "审批业务类型不一致");
        String actualInstance = OaRecordSupport.text(instanceId, 64, "审批实例");
        locked(request.getBusinessId(), event -> {
            if (pending(event) && Objects.equals(event.getInstanceId(), actualInstance)) return;
            if (!pending(event) || !Objects.equals(event.getInstanceId(), request.getReservation())) {
                queueInvalidation(event, actualInstance, "会议已变更，作废旧预约审批");
                return;
            }
            verifySubmission(event, request);
            event.setInstanceId(actualInstance);
            access.save(event);
            approvals.recordBinding(request, actualInstance);
            if (!event.getEndTime().isAfter(LocalDateTime.now())) expire(event);
        });
    }

    @Audit(name = "核验会议预约终审回调", highRisk = true)
    public void decision(ApprovalResultDTO result, boolean approved) {
        OaRecordSupport.same(OaRecordSupport.tenantId(), result.getTenantId(), "审批回调租户不一致");
        OaRecordSupport.same(OaMeetingBookingService.BUSINESS_TYPE, result.getBusinessType(), "审批业务类型不一致");
        OaRecordSupport.same(approved ? "APPROVED" : "REJECTED", result.getApprovalResult(), "审批结果类型不一致");
        locked(result.getBusinessId(), event -> {
            if (!pending(event) || !OaApprovalOutboxService.matches(event.getInstanceId(), result)) return;
            OaApprovalRequest submission = approvals.snapshot(result);
            verifySubmission(event, submission);
            verifyToken(submission, result.getVariables() == null ? null : result.getVariables().get("oaRequestToken"));
            Long approver = OaRecordSupport.require(result.getApproverId(), "终审须提供真实审批人");
            if (Objects.equals(approver, event.getCreatorId())
                    || !Objects.equals(submission.getVariables().get("approverIds"), List.of(approver.toString()))
                    || meetings.approverAllowed(event.getTenantId(), approver) < 1) {
                throw new IllegalStateException("MEETING_APPROVER_INVALID: 终审人与提交时冻结的合法审批人不一致");
            }
            if (!event.getEndTime().isAfter(LocalDateTime.now())) {
                expire(event);
                return;
            }
            event.setApprovalStatus(approved ? "APPROVED" : "REJECTED");
            if (!approved) {
                event.setStatus("CANCELLED");
                event.setScheduleVersion(Math.addExact(event.getScheduleVersion(), 1));
            }
            access.save(event);
            if (approved) reminders.approved(event); else reminders.close(event);
            record(event, "MEETING_APPROVAL_DECIDED", approved ? "审批通过" : "审批拒绝并释放会议室");
        });
    }

    @Audit(name = "同步会议预约审批撤回及作废", highRisk = true)
    public void closed(OaMeetingWorkflowClosed result) {
        OaRecordSupport.same(OaRecordSupport.tenantId(), result.tenantId(), "审批关闭租户不一致");
        OaRecordSupport.same(OaMeetingBookingService.BUSINESS_TYPE, result.businessType(), "审批关闭业务不一致");
        OaMeetingRules.require(Set.of("CANCELLED", "INVALIDATED", "TERMINATED").contains(result.status()),
                "MEETING_APPROVAL_EVENT_INVALID", "无效的审批关闭状态");
        locked(result.businessId(), event -> {
            if (!pending(event)) return;
            ApprovalResultDTO snapshotKey = new ApprovalResultDTO();
            snapshotKey.setTenantId(result.tenantId()); snapshotKey.setBusinessType(result.businessType());
            snapshotKey.setBusinessId(result.businessId()); snapshotKey.setProcessInstanceId(result.processInstanceId());
            snapshotKey.setVariables(java.util.Map.of("oaRequestToken", OaRecordSupport.require(result.oaRequestToken(), "审批令牌缺失")));
            if (!OaApprovalOutboxService.matches(event.getInstanceId(), snapshotKey)) return;
            OaApprovalRequest submission = approvals.snapshot(snapshotKey);
            verifySubmission(event, submission); verifyToken(submission, result.oaRequestToken());
            event.setStatus("CANCELLED"); event.setApprovalStatus("CANCELLED");
            event.setScheduleVersion(Math.addExact(event.getScheduleVersion(), 1));
            access.save(event);
            reminders.close(event);
            record(event, "MEETING_APPROVAL_CLOSED", "审批流程" + result.status() + "，释放会议室");
        });
    }

    @Audit(name = "登记旧会议审批作废请求", highRisk = true)
    public void withdraw(SysScheduleEvent event, String reason) {
        OaMeetingAccess.transaction();
        if ("PENDING".equals(event.getApprovalStatus()) && event.getInstanceId() != null && !event.getInstanceId().startsWith("F:")) {
            queueInvalidation(event, event.getInstanceId(), reason);
        }
    }

    @Audit(name = "处理逾期未批会议", highRisk = true)
    public void expirePending() {
        LocalDateTime now = LocalDateTime.now();
        Long afterId = 0L;
        List<RuntimeException> failures = new java.util.ArrayList<>();
        while (true) {
            List<Long> ids = meetings.expiredPending(OaRecordSupport.tenantId(), now, afterId);
            if (ids.isEmpty()) break;
            for (Long id : ids) {
                try { locked(id, event -> { if (pending(event) && !event.getEndTime().isAfter(now)) expire(event); }); }
                catch (RuntimeException failure) { failures.add(new IllegalStateException("逾期会议" + id + "处理失败", failure)); }
                afterId = id;
            }
        }
        if (!failures.isEmpty()) {
            IllegalStateException failure = new IllegalStateException("逾期会议处理失败数：" + failures.size());
            failures.forEach(failure::addSuppressed); throw failure;
        }
    }

    private void expire(SysScheduleEvent event) {
        withdraw(event, "预约结束仍未批准");
        event.setStatus("NOT_HELD"); event.setApprovalStatus("CANCELLED");
        event.setScheduleVersion(Math.addExact(event.getScheduleVersion(), 1));
        access.save(event); reminders.close(event); record(event, "MEETING_APPROVAL_EXPIRED", "预约结束仍未批准，标记未举行");
    }

    private void queueInvalidation(SysScheduleEvent event, String instanceId, String reason) {
        OaMeetingAccess.transaction();
        BusinessProcessInvalidateDTO request = new BusinessProcessInvalidateDTO();
        request.setTenantId(event.getTenantId()); request.setBusinessType(OaMeetingBookingService.BUSINESS_TYPE);
        request.setBusinessId(event.getEventId()); request.setProcessInstanceId(instanceId); request.setReason(reason);
        publisher.publish(BusinessEventEnvelope.builder().eventType("OA_MEETING_APPROVAL_WITHDRAWN").sourceModule("cloudflow-oa")
                .sourceId(event.getEventId()).tenantId(event.getTenantId()).payload(write(request)).build());
        record(event, "MEETING_APPROVAL_WITHDRAW_QUEUED", reason);
    }

    private void verifySubmission(SysScheduleEvent event, OaApprovalRequest submission) {
        Map<String, Object> variables = OaRecordSupport.require(submission.getVariables(), "审批快照变量缺失");
        if (!Objects.equals(event.getTenantId(), submission.getTenantId()) || !Objects.equals(event.getEventId(), submission.getBusinessId())
                || !Objects.equals(event.getCreatorId(), submission.getStartUserId()) || !"oa_meeting_booking".equals(submission.getProcessKey())
                || !OaMeetingBookingService.BUSINESS_TYPE.equals(submission.getBusinessType())
                || !Objects.equals(event.getCreatorId().toString(), variables.get("applicantId"))
                || !Objects.equals(String.valueOf(event.getRoomId()), variables.get("roomId"))
                || !Objects.equals(event.getStartTime().toString(), variables.get("startTime"))
                || !Objects.equals(event.getEndTime().toString(), variables.get("endTime"))
                || !Objects.equals(String.valueOf(event.getScheduleVersion()), String.valueOf(variables.get("scheduleVersion")))
                || !Objects.equals(variables.get("_hExcludedUserIds"), List.of(event.getCreatorId().toString()))) {
            throw new IllegalStateException("MEETING_APPROVAL_SNAPSHOT_CONFLICT: 审批快照与当前预约不一致");
        }
        verifyToken(submission, variables.get("oaRequestToken"));
    }

    private void verifyToken(OaApprovalRequest submission, Object token) {
        if (submission.getReservation() == null || !submission.getReservation().startsWith("F:") || !Objects.equals(submission.getReservation(), token)) {
            throw new IllegalStateException("MEETING_APPROVAL_TOKEN_INVALID: 审批提交令牌不一致");
        }
    }

    private boolean pending(SysScheduleEvent event) {
        return "PENDING".equals(event.getApprovalStatus()) && "PLANNED".equals(event.getStatus()) && !"SERIES".equals(event.getRecurrenceRole());
    }

    private void locked(Long id, Consumer<SysScheduleEvent> work) {
        SysScheduleEvent observed = access.get(id);
        new TransactionTemplate(transactions).executeWithoutResult(status -> {
            access.lockRooms(Arrays.asList(observed.getRoomId()));
            work.accept(access.lock(observed));
        });
    }

    private void record(SysScheduleEvent event, String action, String message) {
        trace.record(event.getTenantId(), OaMeetingBookingService.BUSINESS_TYPE, event.getEventId(), "MEETING", event.getEventId(),
                action, message, String.valueOf(event.getScheduleVersion()), UserContext.getUserId(), OaRecordSupport.userName(), write(event));
    }

    private String write(Object value) {
        try { return json.writeValueAsString(value); }
        catch (Exception failure) { throw new IllegalStateException("会议审批事件序列化失败", failure); }
    }
}
