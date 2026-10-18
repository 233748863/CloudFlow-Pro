package com.cloudflow.hr.service;

import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.common.event.workflow.WorkflowFallbackRetryContext;
import com.cloudflow.common.redis.config.RuntimeSysConfigService;
import com.cloudflow.hr.client.WorkflowServiceClient;
import com.cloudflow.hr.client.dto.ProcessStartDTO;
import com.cloudflow.hr.client.dto.WorkflowInvalidateRequest;
import com.cloudflow.hr.domain.entity.HrPayrollCorrection;
import com.cloudflow.hr.domain.entity.HrTimeRequest;
import com.cloudflow.hr.domain.entity.HrOvertimeRequest;
import com.cloudflow.hr.domain.entity.HrShiftRequest;
import com.cloudflow.hr.mapper.HrHMapper;
import com.cloudflow.hr.mapper.HrOvertimeRequestMapper;
import com.cloudflow.hr.mapper.HrShiftRequestMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.cloudflow.hr.exception.HrBusinessException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.LinkedHashMap;
import java.util.concurrent.atomic.AtomicReference;

import static com.cloudflow.hr.service.HrRuleSupport.*;

@Service
@RequiredArgsConstructor
public class HrRuleWorkflowService {
    public static final String EVENT_TYPE = "HR_RULE_WORKFLOW_START";
    public static final String CANCEL_EVENT_TYPE = "HR_RULE_WORKFLOW_CANCEL";
    private final OutboxPublisher publisher;
    private final ObjectMapper objectMapper;
    private final RuntimeSysConfigService settings;
    private final WorkflowServiceClient client;
    private final HrTypedCrudService crudService;
    private final HrRuleSupport support;
    private final HrHSupport helper;
    private final HrHMapper hMapper;
    private final HrOvertimeRequestMapper overtimeMapper;
    private final HrShiftRequestMapper shiftRequestMapper;
    private final com.cloudflow.hr.mapper.HrPayrollCorrectionMapper correctionMapper;
    private final com.cloudflow.hr.mapper.HrSalarySlipMapper slipMapper;
    private final com.cloudflow.hr.mapper.HrEmployeeReferralMapper referralMapper;
    private final com.cloudflow.hr.mapper.HrOfferMapper offerMapper;
    private final com.cloudflow.hr.mapper.HrEmployeeAdvanceMapper advanceMapper;
    private final HrAdvanceApprovalSupport advanceApprovals;

    public void enqueue(String businessType, Long id, String businessNo, String title, Map<String, Object> variables) {
        if (UserContext.getUserId() == null) throw new HrBusinessException("UNAUTHORIZED", "发起审批须绑定登录用户");
        target(businessType);
        if (hType(businessType)) throw HrHException.conflict("APPLICANT_SNAPSHOT_REQUIRED", "H申请须通过冻结申请人的内部入口启动");
        String configKey = switch (businessType) {
            case "HR_TIME_REQUEST" -> "sys.hr.leave.processKey";
            case "HR_PAYROLL_CORRECTION" -> "sys.hr.payroll.correctionProcessKey";
            case "OFFER" -> "sys.hr.offer.processKey";
            default -> throw HrHException.invalid("审批类型无效");
        };
        String defaultKey = "OFFER".equals(businessType) ? "offer_approval" : "HR_TIME_REQUEST".equals(businessType) ? "wf_hr_leave" : "wf_hr_payroll_correction";
        ProcessStartDTO request = new ProcessStartDTO();
        request.setTenantId(tenantId()); request.setBusinessType(businessType); request.setBusinessId(id); request.setBusinessNo(businessNo);
        request.setProcessTitle(title); request.setStartUserId(UserContext.getUserId()); request.setVariables(variables);
        request.setProcessDefinitionKey(settings.getString(configKey, defaultKey));
        if ("OFFER".equals(businessType)) verifyOfferStart(request, false);
        if (!StringUtils.hasText(request.getProcessDefinitionKey())) throw new HrBusinessException("WORKFLOW_NOT_CONFIGURED", "请先配置审批流程");
        publish(request);
    }

    public void enqueueForApplicant(String businessType, Long id, String businessNo, String title, Long applicantUserId, Map<String, Object> variables) {
        if (!hType(businessType)) throw HrHException.invalid("该业务不支持冻结申请人入口");
        HBinding binding = hBinding(businessType, id, false);
        ProcessStartDTO request = new ProcessStartDTO(); request.setTenantId(tenantId()); request.setBusinessType(businessType);
        request.setBusinessId(id); request.setBusinessNo(businessNo); request.setProcessTitle(title); request.setStartUserId(applicantUserId);
        request.setVariables(frozenDefinitionVariables(variables, binding.snapshot())); request.setProcessDefinitionKey(binding.snapshot().path("processKey").asText());
        verifyStart(request, binding, true); publish(request);
    }

    private void publish(ProcessStartDTO request) {
        try {
            publisher.publish(BusinessEventEnvelope.builder().eventType(EVENT_TYPE).sourceModule("cloudflow-hr").sourceId(request.getBusinessId())
                    .eventId(UUID.nameUUIDFromBytes((tenantId() + ":" + request.getBusinessType() + ":" + request.getBusinessId()).getBytes(StandardCharsets.UTF_8)).toString())
                    .tenantId(tenantId()).occurredAt(LocalDateTime.now()).payload(objectMapper.writeValueAsString(request)).build());
        } catch (JsonProcessingException failure) {
            throw new HrBusinessException("WORKFLOW_START_FAILED", "审批启动消息生成失败", failure);
        }
    }

    public void enqueueOvertimeCorrection(HrPayrollCorrection correction, HrOvertimeRequest source, Map<String, Object> snapshot) {
        ProcessStartDTO request = new ProcessStartDTO(); request.setTenantId(tenantId()); request.setBusinessType("HR_PAYROLL_CORRECTION");
        request.setBusinessId(correction.getCorrectionId()); request.setBusinessNo("COR" + correction.getCorrectionId()); request.setProcessTitle("加班工资补正审批");
        request.setStartUserId(HrHSupport.number(snapshot.get("applicantUserId"))); request.setProcessDefinitionKey(String.valueOf(snapshot.get("processKey")));
        Map<String, Object> variables = new LinkedHashMap<>(); variables.put("employeeId", source.getEmployeeId().toString()); variables.put("overtimeRequestId", source.getRequestId().toString());
        variables.put("correctionId", correction.getCorrectionId().toString()); variables.put("originalSlipId", correction.getOriginalSlipId().toString());
        variables.put("detailPath", "/hr/overtime?requestId=" + source.getRequestId());
        for (String field : List.of("applicantUserId", HrHSupport.EXCLUDED_USERS, "hCorrectionApproverIds")) variables.put(field, snapshot.get(field));
        request.setVariables(frozenDefinitionVariables(variables, helper.tree(helper.json(snapshot)))); publish(request);
    }

    public void enqueueAdvanceCorrection(HrPayrollCorrection correction, Long employeeId, Map<String, Object> snapshot) {
        ProcessStartDTO request = new ProcessStartDTO(); request.setTenantId(tenantId()); request.setBusinessType("HR_PAYROLL_CORRECTION");
        request.setBusinessId(correction.getCorrectionId()); request.setBusinessNo("COR" + correction.getCorrectionId()); request.setProcessTitle("借款工资扣还补正审批");
        request.setStartUserId(HrHSupport.number(snapshot.get("applicantUserId"))); request.setProcessDefinitionKey(String.valueOf(snapshot.get("processKey")));
        Map<String, Object> variables = new LinkedHashMap<>(); variables.put("employeeId", employeeId.toString());
        variables.put("correctionId", correction.getCorrectionId().toString()); variables.put("originalSlipId", correction.getOriginalSlipId().toString());
        for (String field : List.of("applicantUserId", HrHSupport.EXCLUDED_USERS, "hCorrectionApproverIds")) variables.put(field, snapshot.get(field));
        request.setVariables(frozenDefinitionVariables(variables, helper.tree(helper.json(snapshot)))); publish(request);
    }

    static Map<String, Object> frozenDefinitionVariables(Map<String, Object> variables, ObjectNode snapshot) {
        if (variables == null || snapshot == null || !snapshot.path("definitionId").isTextual() || snapshot.path("definitionId").asText().isBlank()
                || !snapshot.path("definitionVersion").isIntegralNumber() || !snapshot.path("definitionVersion").canConvertToInt()
                || snapshot.path("definitionVersion").intValue() <= 0 || !snapshot.path("modelDigest").isTextual()
                || !snapshot.path("modelDigest").asText().matches("[a-f0-9]{64}")) {
            throw HrHException.conflict("WORKFLOW_DEFINITION_SNAPSHOT_INVALID", "冻结审批依据缺少有效的流程编号、版本或模型摘要");
        }
        Map<String, Object> result = new LinkedHashMap<>(variables);
        result.put("definitionId", snapshot.path("definitionId").asText());
        result.put("definitionVersion", snapshot.path("definitionVersion").intValue());
        result.put("modelDigest", snapshot.path("modelDigest").asText());
        return result;
    }

    public void start(ProcessStartDTO request) {
        if (request == null || !Objects.equals(request.getTenantId(), tenantId())) throw new HrBusinessException("WORKFLOW_TENANT_MISMATCH", "审批消息租户不匹配");
        Target target = target(request.getBusinessType());
        support.lockedWithoutTransaction(lock(request.getBusinessType(), request.getBusinessId()), () -> {
            Map<String, Object> row = row(request.getBusinessType(), request.getBusinessId());
            if (row == null || row.isEmpty() || !List.of("PENDING", "APPROVING", "CANCELLED").contains(String.valueOf(row.get("status")))) return null;
            boolean attempted = !support.auditDetail(request.getBusinessType(), request.getBusinessId(), "WORKFLOW_START_ATTEMPT").isEmpty();
            if ("CANCELLED".equals(row.get("status")) && !attempted) return null;
            if (StringUtils.hasText((String) row.get(target.instanceField()))) {
                if ("CANCELLED".equals(row.get("status"))) cancelRemote(request.getBusinessType(), request.getBusinessId(), (String) row.get(target.instanceField()));
                return null;
            }
            if (hType(request.getBusinessType())) verifyStart(request, hBinding(request.getBusinessType(), request.getBusinessId(), false), !attempted);
            if ("OFFER".equals(request.getBusinessType())) verifyOfferStart(request, !attempted);
            if (hCorrection(request.getBusinessType(), request.getBusinessId())) verifyCorrectionStart(request, !attempted);
            if (!attempted) support.transaction(() -> {
                support.audit(request.getBusinessType(), request.getBusinessId(), "WORKFLOW_START_ATTEMPT", Map.of("requested", true));
                return null;
            });
            AtomicReference<R<String>> result = new AtomicReference<>();
            WorkflowFallbackRetryContext.runRetrying(() -> result.set(client.startProcess(request)));
            if (result.get() == null || !result.get().isSuccess() || !StringUtils.hasText(result.get().getData())) {
                throw new HrBusinessException("WORKFLOW_START_FAILED", "审批启动失败，已保存的启动消息将重试");
            }
            String instanceId = result.get().getData();
            boolean cancelled = support.transaction(() -> {
                Map<String, Object> latest = row(request.getBusinessType(), request.getBusinessId());
                String existing = (String) latest.get(target.instanceField());
                if (StringUtils.hasText(existing) && !existing.equals(instanceId)) throw new HrBusinessException("WORKFLOW_BINDING_CONFLICT", "审批实例绑定发生冲突");
                if (hType(request.getBusinessType())) bindH(request.getBusinessType(), request.getBusinessId(), instanceId);
                else if ("OFFER".equals(request.getBusinessType())) {
                    com.cloudflow.hr.domain.entity.HrOffer offer = offerMapper.lockOffer(tenantId(), request.getBusinessId());
                    if (offer == null || !"APPROVING".equals(offer.getStatus()) || offer.getProcessInstanceId() != null && !instanceId.equals(offer.getProcessInstanceId())) throw HrHException.conflict("WORKFLOW_BINDING_CONFLICT", "录用审批绑定冲突");
                    offer.setProcessInstanceId(instanceId);
                    if (offerMapper.updateById(offer) != 1) throw HrHException.conflict("VERSION_CONFLICT", "录用审批绑定时记录变化");
                }
                else if (hCorrection(request.getBusinessType(), request.getBusinessId())) bindCorrection(request.getBusinessId(), instanceId);
                else crudService.updateProperties(target.entity(), request.getBusinessId(), Map.of(target.instanceField(), instanceId));
                support.audit(request.getBusinessType(), request.getBusinessId(), "WORKFLOW_STARTED", Map.of("instanceId", instanceId));
                return "CANCELLED".equals(latest.get("status"));
            });
            if (cancelled) cancelRemote(request.getBusinessType(), request.getBusinessId(), instanceId);
            return null;
        });
    }

    @Audit(name = "申请撤回人力审批", spel = "#id", highRisk = true)
    public void cancel(String businessType, Long id) {
        target(businessType);
        WorkflowInvalidateRequest request = new WorkflowInvalidateRequest();
        request.setTenantId(tenantId()); request.setBusinessType(businessType); request.setBusinessId(id);
        try {
            publisher.publish(BusinessEventEnvelope.builder().eventType(CANCEL_EVENT_TYPE).sourceModule("cloudflow-hr").sourceId(id)
                    .eventId(UUID.nameUUIDFromBytes((tenantId() + ":cancel:" + businessType + ":" + id).getBytes(StandardCharsets.UTF_8)).toString())
                    .tenantId(tenantId()).occurredAt(LocalDateTime.now()).payload(objectMapper.writeValueAsString(request)).build());
        } catch (JsonProcessingException failure) {
            throw new HrBusinessException("WORKFLOW_CANCEL_FAILED", "审批撤回消息生成失败", failure);
        }
    }

    @Audit(name = "处理人力审批撤回", spel = "#request?.businessId", highRisk = true)
    public void processCancellation(WorkflowInvalidateRequest request) {
        if (request == null || !Objects.equals(request.getTenantId(), tenantId())) throw new HrBusinessException("WORKFLOW_TENANT_MISMATCH", "审批撤回消息租户不匹配");
        String businessType = request.getBusinessType();
        Long id = request.getBusinessId();
        Target target = target(businessType);
        support.lockedWithoutTransaction(lock(businessType, id), () -> {
            Map<String, Object> row = row(businessType, id);
            if (!"CANCELLED".equals(row.get("status"))) throw new HrBusinessException("WORKFLOW_CANCEL_STATE_INVALID", "业务单据尚未撤回");
            String instanceId = (String) row.get(target.instanceField());
            if (!StringUtils.hasText(instanceId)) {
                if (!support.auditDetail(businessType, id, "WORKFLOW_START_ATTEMPT").isEmpty()) throw new HrBusinessException("WORKFLOW_BINDING_PENDING", "等待审批启动重试恢复实例编号后撤回");
                return null;
            }
            cancelRemote(businessType, id, instanceId);
            return null;
        });
    }

    private void cancelRemote(String businessType, Long id, String instanceId) {
        if (!support.auditDetail(businessType, id, "WORKFLOW_CANCELLED").isEmpty()) return;
        R<Void> response = client.cancelProcess(tenantId(), instanceId, businessType, id);
        if (response == null || !response.isSuccess()) throw new HrBusinessException("WORKFLOW_CANCEL_FAILED", "审批流程撤回未完成，已保存的撤回消息将重试");
        support.transaction(() -> {
            support.audit(businessType, id, "WORKFLOW_CANCELLED", Map.of("instanceId", instanceId));
            return null;
        });
    }

    private void verifyOfferStart(ProcessStartDTO request, boolean current) {
        Map<String, Object> submission = support.auditDetail("OFFER", request.getBusinessId(), "SUBMITTED");
        com.cloudflow.hr.domain.entity.HrOffer offer = offerMapper.selectById(request.getBusinessId());
        if (offer == null || !Objects.equals(offer.getTenantId(), tenantId()) || !Objects.equals(offer.getOfferNo(), request.getBusinessNo())
                || !Objects.equals(request.getStartUserId(), HrHSupport.number(submission.get("applicantUserId")))
                || !Objects.equals(request.getProcessDefinitionKey(), submission.get("processKey")) || request.getVariables() == null) throw HrHException.conflict("OFFER_START_CONFLICT", "录用流程启动与冻结提交依据不一致");
        for (String field : List.of("applicantUserId", "offerApproverIds", HrHSupport.EXCLUDED_USERS, "candidateId", "definitionId", "definitionVersion", "modelDigest", "offerTermsDigest")) {
            if (!helper.convert(request.getVariables().get(field), com.fasterxml.jackson.databind.JsonNode.class)
                    .equals(helper.convert(submission.get(field), com.fasterxml.jackson.databind.JsonNode.class))) throw HrHException.conflict("OFFER_START_CONFLICT", "录用审批人或模型依据不一致");
        }
        Map<String, Object> terms = new LinkedHashMap<>();
        for (String field : List.of("candidateId", "candidateName", "positionId", "positionName", "salary", "expectedOnboardDate")) terms.put(field, request.getVariables().get(field));
        if (!Objects.equals(submission.get("offerTermsDigest"), helper.digest(terms))) throw HrHException.conflict("OFFER_START_CONFLICT", "录用审批资料与提交时不一致");
        if (current) {
            Map<String, Object> definition = hMapper.definition(tenantId(), request.getProcessDefinitionKey());
            if (definition == null || !Objects.equals(submission.get("definitionId"), definition.get("definitionId"))
                    || !Objects.equals(String.valueOf(submission.get("definitionVersion")), String.valueOf(definition.get("version")))
                    || !Objects.equals(submission.get("modelDigest"), helper.digest(helper.tree(String.valueOf(definition.get("modelJson")))))) throw HrHException.conflict("OFFER_MODEL_CHANGED", "录用审批模型已变化，请核对冻结的提交依据");
            helper.validateOfferModel(helper.tree(String.valueOf(definition.get("modelJson"))));
        }
    }

    private String lock(String type, Long id) { return "rule-workflow:" + type + ":" + id; }
    private boolean hType(String type) { return List.of("HR_OVERTIME", "HR_SHIFT_REQUEST", "HR_REFERRAL", "HR_ADVANCE").contains(type); }

    private Map<String, Object> row(String type, Long id) {
        if (hCorrection(type, id)) {
            HrPayrollCorrection correction = correctionMapper.selectById(id);
            if (correction == null || !Objects.equals(correction.getTenantId(), tenantId()) || flag(correction.getDeleted())) throw HrHException.conflict("CORRECTION_NOT_FOUND", "关联补正不存在");
            Map<String, Object> result = new LinkedHashMap<>(); result.put("status", correction.getStatus()); result.put("instanceId", correction.getInstanceId()); return result;
        }
        if (!hType(type)) return crudService.get(target(type).entity(), id);
        HBinding binding = hBinding(type, id, false);
        Map<String, Object> result = new LinkedHashMap<>(); result.put("status", binding.status()); result.put("instanceId", binding.instanceId()); return result;
    }

    private HBinding hBinding(String type, Long id, boolean locked) {
        if ("HR_ADVANCE".equals(type)) {
            com.cloudflow.hr.domain.entity.HrEmployeeAdvance row = advanceMapper.selectById(id);
            if (row == null || !Objects.equals(row.getTenantId(), tenantId())) throw HrHException.forbidden();
            if (locked) {
                if (advanceMapper.lockEmployee(tenantId(), row.getEmployeeId()) == null) throw HrHException.forbidden();
                row = advanceMapper.lockAdvance(tenantId(), id);
            }
            if (row == null || row.getRuleSnapshot() == null) throw HrHException.forbidden();
            String status = "SUBMITTED".equals(row.getApprovalStatus()) ? "APPROVING" : row.getApprovalStatus();
            return new HBinding(row.getAdvanceNo(), row.getEmployeeId(), null, row.getInstanceId(), status,
                    helper.tree(helper.json(row.getRuleSnapshot().path("workflow"))));
        }
        if ("HR_REFERRAL".equals(type)) {
            com.cloudflow.hr.domain.entity.HrEmployeeReferral row = locked ? referralMapper.lockReferral(tenantId(), id) : referralMapper.selectById(id);
            if (row == null || !Objects.equals(row.getTenantId(), tenantId()) || row.getBonusConditionSnapshot() == null) throw HrHException.forbidden();
            return new HBinding(row.getReferralNo(), row.getReferrerEmployeeId(), null, row.getInstanceId(), row.getBonusStatus(),
                    helper.tree(helper.json(row.getBonusConditionSnapshot().path("workflow"))));
        }
        if ("HR_OVERTIME".equals(type)) {
            HrOvertimeRequest row = locked ? hMapper.overtimeLocked(tenantId(), id) : overtimeMapper.selectById(id);
            if (row == null || !Objects.equals(row.getTenantId(), tenantId()) || flag(row.getDeleted())) throw HrHException.conflict("OVERTIME_NOT_FOUND", "加班申请不存在");
            return new HBinding(row.getRequestNo(), row.getEmployeeId(), null, row.getInstanceId(), row.getStatus(), helper.tree(row.getPolicySnapshot()));
        }
        HrShiftRequest row = locked ? hMapper.shiftLocked(tenantId(), id) : shiftRequestMapper.selectById(id);
        if (row == null || !Objects.equals(row.getTenantId(), tenantId()) || flag(row.getDeleted())) throw HrHException.conflict("SHIFT_REQUEST_NOT_FOUND", "调班申请不存在");
        if ("SWAP".equals(row.getRequestMode()) && List.of("PENDING", "APPROVING", "APPROVED").contains(row.getStatus()) && !"ACCEPTED".equals(row.getPeerAcceptanceStatus())) throw HrHException.conflict("PEER_CONSENT_REQUIRED", "互换申请未经对方真实同意");
        return new HBinding(row.getRequestNo(), row.getEmployeeId(), row.getSwapEmployeeId(), row.getInstanceId(), row.getStatus(), helper.tree(row.getScheduleSnapshot()));
    }

    private void verifyStart(ProcessStartDTO request, HBinding binding, boolean current) {
        if (!Objects.equals(binding.requestNo(), request.getBusinessNo()) || !Objects.equals(request.getStartUserId(), HrHSupport.number(binding.snapshot().path("applicantUserId").asText()))
                || !Objects.equals(request.getProcessDefinitionKey(), binding.snapshot().path("processKey").asText()) || request.getVariables() == null) throw HrHException.conflict("WORKFLOW_START_IDENTITY_CONFLICT", "启动身份不符合冻结依据");
        String finalApprovers = "HR_ADVANCE".equals(request.getBusinessType()) ? "financeApproverIds" : "hrApproverIds";
        for (String field : List.of("applicantUserId", HrHSupport.EXCLUDED_USERS, "responsibleApproverIds", finalApprovers, "definitionId", "definitionVersion", "modelDigest")) {
            if (!Objects.equals(helper.convert(request.getVariables().get(field), com.fasterxml.jackson.databind.JsonNode.class), binding.snapshot().path(field))) throw HrHException.conflict("WORKFLOW_START_IDENTITY_CONFLICT", "启动审批人或参与人不符合冻结依据");
        }
        if ("HR_ADVANCE".equals(request.getBusinessType())) {
            if (!Objects.equals(request.getVariables().get("advanceId"), request.getBusinessId().toString())
                    || !Objects.equals(request.getVariables().get("employeeId"), binding.employeeId().toString())
                    || !request.getVariables().keySet().equals(java.util.Set.of("advanceId", "employeeId", "detailPath", "applicantUserId",
                        HrHSupport.EXCLUDED_USERS, "responsibleApproverIds", "financeApproverIds", "definitionId", "definitionVersion", "modelDigest"))) {
                throw HrHException.conflict("WORKFLOW_START_IDENTITY_CONFLICT", "借款启动来源或冻结变量不一致");
            }
            if (current) advanceApprovals.verifyCurrent(helper.employee(binding.employeeId()), binding.snapshot());
        } else if ("HR_REFERRAL".equals(request.getBusinessType())) {
            if (!Objects.equals(request.getVariables().get("beneficiaryUserId"), binding.snapshot().path("beneficiaryUserId").asText())
                    || !Objects.equals(request.getVariables().get("referralId"), request.getBusinessId().toString())
                    || request.getVariables().containsKey("bonusAmount")) throw HrHException.conflict("WORKFLOW_START_IDENTITY_CONFLICT", "内推审批来源或变量不符合冻结依据");
            if (current && !helper.convert(helper.referralApprovals(helper.employee(binding.employeeId()), request.getStartUserId()), com.fasterxml.jackson.databind.JsonNode.class)
                    .equals(binding.snapshot())) throw HrHException.conflict("APPROVAL_SNAPSHOT_CONFLICT", "内推审批依据已变化");
        } else if (current) helper.verifyActors(request.getBusinessType(), binding.snapshot(), helper.employee(binding.employeeId()), binding.peerId() == null ? null : helper.employee(binding.peerId()));
    }

    private void bindH(String type, Long id, String instanceId) {
        HBinding binding = hBinding(type, id, true);
        if (binding.instanceId() != null && !instanceId.equals(binding.instanceId())) throw HrHException.conflict("WORKFLOW_BINDING_CONFLICT", "审批实例绑定冲突");
        if (!List.of("PENDING", "APPROVING", "CANCELLED").contains(binding.status())) throw HrHException.conflict("WORKFLOW_BINDING_CONFLICT", "业务状态不允许绑定审批");
        if ("HR_ADVANCE".equals(type)) {
            com.cloudflow.hr.domain.entity.HrEmployeeAdvance row = advanceMapper.lockAdvance(tenantId(), id); row.setInstanceId(instanceId);
            if (advanceMapper.updateById(row) != 1) throw HrHException.conflict("VERSION_CONFLICT", "借款审批绑定时记录变化");
        } else if ("HR_REFERRAL".equals(type)) {
            com.cloudflow.hr.domain.entity.HrEmployeeReferral row = referralMapper.lockReferral(tenantId(), id); row.setInstanceId(instanceId);
            if (referralMapper.updateById(row) != 1) throw HrHException.conflict("VERSION_CONFLICT", "内推审批绑定时记录变化");
        } else if ("HR_OVERTIME".equals(type)) {
            HrOvertimeRequest row = hMapper.overtimeLocked(tenantId(), id); row.setInstanceId(instanceId);
            if ("PENDING".equals(row.getStatus())) row.setStatus("APPROVING"); row.setUpdateTime(HrHSupport.now());
            if (overtimeMapper.updateById(row) != 1) throw HrHException.conflict("VERSION_CONFLICT", "绑定审批时加班状态变化");
        } else {
            HrShiftRequest row = hMapper.shiftLocked(tenantId(), id); row.setInstanceId(instanceId);
            if ("PENDING".equals(row.getStatus())) row.setStatus("APPROVING"); row.setUpdateTime(HrHSupport.now());
            if (shiftRequestMapper.updateById(row) != 1) throw HrHException.conflict("VERSION_CONFLICT", "绑定审批时调班状态变化");
        }
    }
    private record HBinding(String requestNo, Long employeeId, Long peerId, String instanceId, String status, ObjectNode snapshot) {}

    private boolean hCorrection(String type, Long id) {
        if (!"HR_PAYROLL_CORRECTION".equals(type)) return false;
        if (hMapper.correctionSource(tenantId(), id) != null) return true;
        HrPayrollCorrection correction = correctionMapper.selectById(id);
        return correction != null && Objects.equals(correction.getTenantId(), tenantId())
                && HrAdvancePayrollService.hasReversals(slipMapper.selectById(correction.getCorrectionSlipId()));
    }

    private void verifyCorrectionStart(ProcessStartDTO request, boolean current) {
        HrOvertimeRequest source = hMapper.correctionSource(tenantId(), request.getBusinessId());
        HrPayrollCorrection correction = correctionMapper.selectById(request.getBusinessId());
        com.cloudflow.hr.domain.entity.HrSalarySlip slip = correction == null ? null : slipMapper.selectById(correction.getCorrectionSlipId());
        boolean advanceCorrection = source == null && HrAdvancePayrollService.hasReversals(slip);
        if (slip == null || !Objects.equals(slip.getTenantId(), tenantId())
                || (source == null ? !advanceCorrection : !"CORRECTION_PENDING".equals(source.getSettlementStatus()))
                || !Objects.equals(request.getBusinessNo(), "COR" + correction.getCorrectionId())) throw HrHException.conflict("CORRECTION_SOURCE_CONFLICT", "工资补正启动来源不一致");
        ObjectNode snapshot = helper.tree(helper.json(HrPayrollCalculationService.snapshot(slip).get(advanceCorrection ? "hAdvanceWorkflow" : "hOvertimeWorkflow")));
        if (!Objects.equals(request.getStartUserId(), HrHSupport.number(snapshot.path("applicantUserId").asText())) || !snapshot.path("processKey").asText().equals(request.getProcessDefinitionKey()) || request.getVariables() == null) throw HrHException.conflict("WORKFLOW_START_IDENTITY_CONFLICT", "补正启动身份不符合冻结依据");
        for (String field : List.of("applicantUserId", HrHSupport.EXCLUDED_USERS, "hCorrectionApproverIds", "definitionId", "definitionVersion", "modelDigest")) if (!snapshot.path(field).equals(helper.convert(request.getVariables().get(field), com.fasterxml.jackson.databind.JsonNode.class))) throw HrHException.conflict("WORKFLOW_START_IDENTITY_CONFLICT", "补正审批人、参与人或流程依据被改变");
        if (request.getVariables().containsKey("diffAmount") || request.getVariables().containsKey("hourlyRate") || request.getVariables().containsKey("settlementAmount")) throw HrHException.conflict("WORKFLOW_SENSITIVE_VARIABLE", "工资补正变量不能包含薪资金额");
        if (advanceCorrection && (!Objects.equals(HrHSupport.number(request.getVariables().get("employeeId")), slip.getEmployeeId())
                || !Objects.equals(HrHSupport.number(request.getVariables().get("correctionId")), correction.getCorrectionId())
                || !Objects.equals(HrHSupport.number(request.getVariables().get("originalSlipId")), correction.getOriginalSlipId()))) {
            throw HrHException.conflict("CORRECTION_SOURCE_CONFLICT", "借款补正审批业务来源被改变");
        }
        Map<String, Object> actual = current ? (advanceCorrection
                ? helper.advanceCorrectionApprovals(helper.employee(slip.getEmployeeId()), correction.getCorrectedBy()) : helper.correctionApprovals(source)) : null;
        if (current && !snapshot.equals(helper.convert(actual, com.fasterxml.jackson.databind.JsonNode.class))) throw HrHException.conflict("APPROVAL_SNAPSHOT_CONFLICT", "工资补正审批依据已变化");
    }

    private void bindCorrection(Long id, String instanceId) {
        HrPayrollCorrection correction = hMapper.correctionLocked(tenantId(), id);
        if (correction == null || !List.of("PENDING", "APPROVING").contains(correction.getStatus())
                || correction.getInstanceId() != null && !correction.getInstanceId().equals(instanceId)) throw HrHException.conflict("WORKFLOW_BINDING_CONFLICT", "关联补正实例绑定冲突");
        correction.setInstanceId(instanceId); correction.setUpdateTime(HrHSupport.now());
        if (correctionMapper.updateById(correction) != 1) throw HrHException.conflict("VERSION_CONFLICT", "补正实例绑定时版本变化");
    }
    private Target target(String type) {
        return switch (type) {
            case "HR_TIME_REQUEST" -> new Target(HrTimeRequest.class, "processInstanceId");
            case "HR_PAYROLL_CORRECTION" -> new Target(HrPayrollCorrection.class, "instanceId");
            case "HR_OVERTIME" -> new Target(HrOvertimeRequest.class, "instanceId");
            case "HR_SHIFT_REQUEST" -> new Target(HrShiftRequest.class, "instanceId");
            case "HR_REFERRAL" -> new Target(com.cloudflow.hr.domain.entity.HrEmployeeReferral.class, "instanceId");
            case "HR_ADVANCE" -> new Target(com.cloudflow.hr.domain.entity.HrEmployeeAdvance.class, "instanceId");
            case "OFFER" -> new Target(com.cloudflow.hr.domain.entity.HrOffer.class, "processInstanceId");
            default -> throw new HrBusinessException("INVALID_WORKFLOW_TYPE", "不支持的HR规则审批类型");
        };
    }
    private record Target(Class<?> entity, String instanceField) {}
}
