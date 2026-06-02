package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.hr.client.WorkflowServiceClient;
import com.cloudflow.hr.client.dto.ProcessStartDTO;
import com.cloudflow.hr.domain.entity.HrTrainingEnrollment;
import com.cloudflow.hr.domain.entity.HrTrainingSession;
import com.cloudflow.hr.event.HrTrainingEnrollmentSubmittedEvent;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrTrainingEnrollmentMapper;
import com.cloudflow.hr.mapper.HrTrainingSessionMapper;
import com.cloudflow.hr.service.HrEssSupport;
import com.cloudflow.hr.service.IHrTrainingArchiveService;
import com.cloudflow.hr.service.IHrTrainingEnrollmentService;
import com.cloudflow.common.audit.annotation.Audit;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

@Slf4j
@Service
@RequiredArgsConstructor
public class HrTrainingEnrollmentServiceImpl implements IHrTrainingEnrollmentService {

    private static final Set<String> ENROLLABLE_SESSION_STATUS = Set.of("PLANNED", "REGISTERING", "ONGOING");
    private static final Set<String> CHECK_IN_ALLOWED_STATUS = Set.of("APPROVED");
    private static final Set<String> CANCELABLE_STATUS = Set.of("PENDING", "APPROVED");

    private final HrTrainingEnrollmentMapper enrollmentMapper;
    private final HrTrainingSessionMapper sessionMapper;
    private final HrEssSupport essSupport;
    private final WorkflowServiceClient workflowServiceClient;
    private final IHrTrainingArchiveService archiveService;
    private final OutboxPublisher outboxPublisher;
    private final ObjectMapper objectMapper;

    @Value("${cloudflow.hr.training.enrollment-process-key:wf_hr_training_enrollment}")
    private String processDefinitionKey;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long enroll(Long sessionId, String enrollType, String comment) {
        if (sessionId == null) {
            throw new HrBusinessException("INVALID_PARAMETER", "sessionId 不能为空");
        }
        Long employeeId = essSupport.currentEmployeeId();
        Long tenantId = currentTenantId();
        HrTrainingSession session = sessionMapper.selectById(sessionId);
        if (session == null || Integer.valueOf(1).equals(session.getDeleted())) {
            throw new HrBusinessException("SESSION_NOT_FOUND", "培训班次不存在：" + sessionId);
        }
        if (!ENROLLABLE_SESSION_STATUS.contains(String.valueOf(session.getStatus()).toUpperCase(Locale.ROOT))) {
            throw new HrBusinessException("SESSION_NOT_OPEN",
                    "当前班次状态 " + session.getStatus() + " 不开放报名");
        }
        Integer capacity = session.getCapacity();
        Integer enrolled = session.getEnrolledCount() == null ? 0 : session.getEnrolledCount();
        if (capacity != null && enrolled >= capacity) {
            throw new HrBusinessException("SESSION_FULL",
                    "培训班次已报满，capacity=" + capacity);
        }
        QueryWrapper<HrTrainingEnrollment> dup = new QueryWrapper<>();
        dup.eq("tenant_id", tenantId)
                .eq("session_id", sessionId)
                .eq("employee_id", employeeId)
                .eq("deleted", 0);
        if (enrollmentMapper.selectCount(dup) > 0) {
            throw new HrBusinessException("DUPLICATE_ENROLLMENT", "已报名该班次，请勿重复提交");
        }

        HrTrainingEnrollment enrollment = new HrTrainingEnrollment();
        enrollment.setTenantId(tenantId);
        enrollment.setSessionId(sessionId);
        enrollment.setEmployeeId(employeeId);
        enrollment.setEnrollType(StringUtils.hasText(enrollType) ? enrollType : "SELF");
        enrollment.setStatus("PENDING");
        enrollment.setAttended(false);
        enrollment.setCompletionStatus("PENDING");
        enrollment.setComment(comment);
        enrollment.setDeleted(0);
        enrollment.setCreateBy(currentUserName());
        enrollment.setUpdateBy(currentUserName());
        enrollmentMapper.insert(enrollment);
        HrTrainingEnrollmentSubmittedEvent event = new HrTrainingEnrollmentSubmittedEvent();
        event.setEnrollmentId(enrollment.getId());
        event.setSessionId(sessionId);
        event.setSubmittedAt(LocalDateTime.now());
        publishTrainingEnrollmentSubmittedEvent(enrollment, event);
        log.info("培训报名已提交，enrollmentId: {}, sessionId: {}, employeeId: {}",
                enrollment.getId(), sessionId, employeeId);
        archiveService.incrementOnEnrollmentChange(employeeId);
        return enrollment.getId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void checkIn(Long enrollmentId) {
        HrTrainingEnrollment enrollment = loadEnrollment(enrollmentId);
        essSupport.assertOwner(enrollment.getEmployeeId());
        if (!CHECK_IN_ALLOWED_STATUS.contains(String.valueOf(enrollment.getStatus()).toUpperCase(Locale.ROOT))) {
            throw new HrBusinessException("STATUS_NOT_CHECKABLE",
                    "当前报名状态 " + enrollment.getStatus() + " 不允许签到");
        }
        if (Boolean.TRUE.equals(enrollment.getAttended())) {
            return;
        }
        LocalDateTime now = LocalDateTime.now();
        UpdateWrapper<HrTrainingEnrollment> wrapper = new UpdateWrapper<>();
        wrapper.eq("id", enrollmentId)
                .eq("tenant_id", currentTenantId())
                .set("attended", true)
                .set("check_in_time", now)
                .set("update_time", now)
                .set("update_by", currentUserName());
        enrollmentMapper.update(null, wrapper);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void complete(Long enrollmentId, String completionStatus, BigDecimal score, String comment) {
        HrTrainingEnrollment enrollment = loadEnrollment(enrollmentId);
        String status = String.valueOf(enrollment.getStatus()).toUpperCase(Locale.ROOT);
        if (!"APPROVED".equals(status)) {
            throw new HrBusinessException("STATUS_NOT_COMPLETABLE",
                    "当前报名状态 " + enrollment.getStatus() + " 不允许结业登记");
        }
        String target = StringUtils.hasText(completionStatus) ? completionStatus.toUpperCase(Locale.ROOT) : "PASSED";
        if (!Set.of("PASSED", "FAILED", "PENDING").contains(target)) {
            throw new HrBusinessException("INVALID_PARAMETER",
                    "completionStatus 仅支持 PASSED/FAILED/PENDING，当前：" + completionStatus);
        }
        UpdateWrapper<HrTrainingEnrollment> wrapper = new UpdateWrapper<>();
        wrapper.eq("id", enrollmentId)
                .eq("tenant_id", currentTenantId())
                .set("completion_status", target)
                .set("score", score)
                .set("comment", comment)
                .set("update_time", LocalDateTime.now())
                .set("update_by", currentUserName());
        enrollmentMapper.update(null, wrapper);
        archiveService.incrementOnEnrollmentChange(enrollment.getEmployeeId());
    }

    @Override
    @Audit(name = "取消培训报名", highRisk = true)
    public void cancel(Long enrollmentId) {
        HrTrainingEnrollment enrollment = loadEnrollment(enrollmentId);
        essSupport.assertOwner(enrollment.getEmployeeId());
        if (!CANCELABLE_STATUS.contains(String.valueOf(enrollment.getStatus()).toUpperCase(Locale.ROOT))) {
            throw new HrBusinessException("STATUS_NOT_CANCELABLE",
                    "当前报名状态 " + enrollment.getStatus() + " 不允许撤销");
        }
        cancelWorkflowIfNeeded(enrollmentId, enrollment.getProcessInstanceId());
        markWithdrawn(enrollment);
    }

    private void cancelWorkflowIfNeeded(Long enrollmentId, String processInstanceId) {
        if (!StringUtils.hasText(processInstanceId)) {
            return;
        }
        R<Void> cancelResult = workflowServiceClient.cancelProcess(processInstanceId);
        if (cancelResult == null || !cancelResult.isSuccess()) {
            log.warn("撤销培训报名流程失败，enrollmentId: {}, msg: {}",
                    enrollmentId, cancelResult == null ? null : cancelResult.getMsg());
        }
    }

    @Transactional(rollbackFor = Exception.class)
    protected void markWithdrawn(HrTrainingEnrollment enrollment) {
        UpdateWrapper<HrTrainingEnrollment> wrapper = new UpdateWrapper<>();
        wrapper.eq("id", enrollment.getId())
                .eq("tenant_id", currentTenantId())
                .set("status", "WITHDRAWN")
                .set("update_time", LocalDateTime.now())
                .set("update_by", currentUserName());
        enrollmentMapper.update(null, wrapper);
        archiveService.incrementOnEnrollmentChange(enrollment.getEmployeeId());
    }

    public void startTrainingEnrollmentWorkflow(HrTrainingEnrollment enrollment) {
        ProcessStartDTO dto = new ProcessStartDTO();
        dto.setTenantId(enrollment.getTenantId());
        dto.setProcessDefinitionKey(processDefinitionKey);
        dto.setBusinessType("HR_TRAINING_ENROLLMENT");
        dto.setBusinessId(enrollment.getId());
        dto.setBusinessNo(String.valueOf(enrollment.getSessionId()));
        dto.setProcessTitle("培训报名审批-班次 " + enrollment.getSessionId());
        dto.setStartUserId(enrollment.getEmployeeId());
        Map<String, Object> vars = new LinkedHashMap<>();
        vars.put("sessionId", enrollment.getSessionId());
        vars.put("employeeId", enrollment.getEmployeeId());
        vars.put("enrollType", enrollment.getEnrollType());
        dto.setVariables(vars);

        R<String> response = workflowServiceClient.startProcess(dto);
        if (response == null || !response.isSuccess() || !StringUtils.hasText(response.getData())) {
            String msg = response == null ? "Workflow 服务无响应" : response.getMsg();
            throw new HrBusinessException("WORKFLOW_START_FAILED", "培训报名流程启动失败：" + msg);
        }
        UpdateWrapper<HrTrainingEnrollment> wrapper = new UpdateWrapper<>();
        wrapper.eq("id", enrollment.getId())
                .eq("tenant_id", enrollment.getTenantId())
                .set("process_instance_id", response.getData())
                .set("update_time", LocalDateTime.now());
        enrollmentMapper.update(null, wrapper);
        log.info("培训报名已提交，enrollmentId: {}, sessionId: {}, employeeId: {}, processInstanceId: {}",
                enrollment.getId(), enrollment.getSessionId(), enrollment.getEmployeeId(), response.getData());
    }

    private HrTrainingEnrollment loadEnrollment(Long id) {
        if (id == null) {
            throw new HrBusinessException("INVALID_PARAMETER", "enrollmentId 不能为空");
        }
        HrTrainingEnrollment enrollment = enrollmentMapper.selectById(id);
        if (enrollment == null || Integer.valueOf(1).equals(enrollment.getDeleted())) {
            throw new HrBusinessException("ENROLLMENT_NOT_FOUND", "培训报名记录不存在：" + id);
        }
        return enrollment;
    }

    private Long currentTenantId() {
        Long tid = TenantContext.getTenantId();
        if (tid != null) {
            return tid;
        }
        tid = UserContext.getTenantId();
        return tid == null ? 100000L : tid;
    }

    private String currentUserName() {
        return StringUtils.hasText(UserContext.getUserName()) ? UserContext.getUserName() : "system";
    }

    private void publishTrainingEnrollmentSubmittedEvent(HrTrainingEnrollment enrollment, HrTrainingEnrollmentSubmittedEvent event) {
        try {
            BusinessEventEnvelope envelope = BusinessEventEnvelope.builder()
                    .eventType("HR_TRAINING_ENROLLMENT_SUBMITTED")
                    .sourceModule("cloudflow-hr")
                    .sourceId(enrollment.getId())
                    .tenantId(enrollment.getTenantId())
                    .payload(objectMapper.writeValueAsString(event))
                    .build();
            outboxPublisher.publish(envelope);
        } catch (Exception e) {
            throw new HrBusinessException("WORKFLOW_EVENT_PUBLISH_FAILED", "培训报名流程事件发布失败");
        }
    }
}
