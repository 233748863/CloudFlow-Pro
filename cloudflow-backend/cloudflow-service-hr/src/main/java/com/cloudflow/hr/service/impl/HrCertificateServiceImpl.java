package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.common.redis.config.RuntimeSysConfigService;
import com.cloudflow.common.redis.config.SysConfigKeys;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.hr.client.WorkflowServiceClient;
import com.cloudflow.hr.client.dto.ProcessStartDTO;
import com.cloudflow.hr.domain.dto.HrCertificateRequestPayload;
import com.cloudflow.hr.domain.entity.HrCertificateRequest;
import com.cloudflow.hr.domain.entity.HrEmployee;
import com.cloudflow.hr.event.HrCertificateRequestSubmittedEvent;
import com.cloudflow.hr.domain.vo.HrEmployeeSummaryVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrCertificateRequestMapper;
import com.cloudflow.hr.mapper.HrEmployeeMapper;
import com.cloudflow.hr.service.HrEssSupport;
import com.cloudflow.hr.service.HrFileStorage;
import com.cloudflow.hr.service.HrPdfRenderer;
import com.cloudflow.hr.service.IHrCertificateService;
import com.cloudflow.hr.service.IHrIntegrationQueryService;
import com.cloudflow.hr.service.dto.HrFileDownload;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ThreadLocalRandom;

@Slf4j
@Service
@RequiredArgsConstructor
public class HrCertificateServiceImpl implements IHrCertificateService {

    private static final DateTimeFormatter REQUEST_NO_DAY = DateTimeFormatter.ofPattern("yyyyMMdd");
    private static final DateTimeFormatter ISSUE_DATE = DateTimeFormatter.ofPattern("yyyy 年 MM 月 dd 日");
    private static final Set<String> CANCELABLE_STATUS = new LinkedHashSet<>(Set.of("PENDING", "APPROVING", "DRAFT"));

    private final HrCertificateRequestMapper certificateRequestMapper;
    private final HrEmployeeMapper employeeMapper;
    private final HrEssSupport essSupport;
    private final IHrIntegrationQueryService integrationQueryService;
    private final HrPdfRenderer pdfRenderer;
    private final HrFileStorage fileStorage;
    private final WorkflowServiceClient workflowServiceClient;
    private final OutboxPublisher outboxPublisher;
    private final ObjectMapper objectMapper;
    private final RuntimeSysConfigService runtimeSysConfigService;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long submit(HrCertificateRequestPayload payload) {
        if (payload == null) {
            throw new HrBusinessException("INVALID_PARAMETER", "证明申请数据不能为空");
        }
        if (!StringUtils.hasText(payload.getCertificateType())) {
            throw new HrBusinessException("INVALID_PARAMETER", "certificateType 不能为空");
        }
        Long employeeId = essSupport.currentEmployeeId();
        Long tenantId = currentTenantId();

        HrCertificateRequest request = new HrCertificateRequest();
        request.setTenantId(tenantId);
        request.setEmployeeId(employeeId);
        request.setRequestNo(generateRequestNo());
        request.setCertificateType(payload.getCertificateType());
        request.setPurpose(payload.getPurpose());
        request.setLanguage(StringUtils.hasText(payload.getLanguage()) ? payload.getLanguage() : "zh-CN");
        request.setRecipientOrg(payload.getRecipientOrg());
        request.setCopies(payload.getCopies() == null || payload.getCopies() <= 0 ? 1 : payload.getCopies());
        request.setRemark(payload.getRemark());
        request.setStatus("PENDING");
        request.setDeleted(0);
        request.setCreateBy(currentUserName());
        request.setUpdateBy(currentUserName());
        certificateRequestMapper.insert(request);
        HrCertificateRequestSubmittedEvent event = new HrCertificateRequestSubmittedEvent();
        event.setRequestId(request.getId());
        event.setRequestNo(request.getRequestNo());
        event.setSubmittedAt(LocalDateTime.now());
        publishCertificateSubmittedEvent(request, event);
        log.info("证明开具申请已提交，requestNo: {}, employeeId: {}", request.getRequestNo(), employeeId);
        return request.getId();
    }

    @Override
    @Audit(name = "取消证书申请", highRisk = true)
    public void cancel(Long id) {
        HrCertificateRequest request = loadRequest(id);
        essSupport.assertOwner(request.getEmployeeId());
        if (!CANCELABLE_STATUS.contains(String.valueOf(request.getStatus()).toUpperCase())) {
            throw new HrBusinessException("STATUS_NOT_CANCELABLE", "当前状态 " + request.getStatus() + " 不允许撤销");
        }
        cancelWorkflowIfNeeded(request);
        markCancelled(id);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void issuePdf(Long id) {
        HrCertificateRequest request = loadRequest(id);
        if (!"APPROVED".equalsIgnoreCase(request.getStatus())
                && !"PENDING".equalsIgnoreCase(request.getStatus())) {
            log.warn("证明开具 PDF 渲染跳过，状态 {} 不在 APPROVED/PENDING，requestNo: {}",
                    request.getStatus(), request.getRequestNo());
            return;
        }

        Map<String, Object> vars = buildCertificateVariables(request);
        String html = pdfRenderer.fillTemplate(pdfRenderer.defaultCertificateTemplate(), vars);
        byte[] pdfBytes = pdfRenderer.render(html);
        String fileName = "certificate-" + request.getRequestNo() + ".pdf";
        Long fileId = fileStorage.save(pdfBytes, fileName, "application/pdf");

        UpdateWrapper<HrCertificateRequest> wrapper = new UpdateWrapper<>();
        wrapper.eq("id", id)
                .eq("tenant_id", currentTenantId())
                .set("pdf_file_id", fileId)
                .set("status", "ISSUED")
                .set("issued_at", LocalDateTime.now())
                .set("update_time", LocalDateTime.now())
                .set("update_by", currentUserName());
        certificateRequestMapper.update(null, wrapper);
        log.info("证明 PDF 已生成，requestNo: {}, fileId: {}", request.getRequestNo(), fileId);
    }

    @Override
    public HrFileDownload downloadPdf(Long id) {
        HrCertificateRequest request = loadRequest(id);
        essSupport.assertOwner(request.getEmployeeId());
        if (!"ISSUED".equalsIgnoreCase(request.getStatus()) || request.getPdfFileId() == null) {
            throw new HrBusinessException("CERTIFICATE_NOT_ISSUED", "证明尚未生成 PDF，当前状态：" + request.getStatus());
        }
        byte[] bytes = fileStorage.load(request.getPdfFileId());
        HrFileDownload result = new HrFileDownload();
        result.setFileName("certificate-" + request.getRequestNo() + ".pdf");
        result.setContentType("application/pdf");
        result.setBytes(bytes);
        result.setBusinessNo(request.getRequestNo());
        return result;
    }

    public void startCertificateWorkflow(HrCertificateRequest request) {
        ProcessStartDTO dto = new ProcessStartDTO();
        dto.setTenantId(request.getTenantId());
        dto.setProcessDefinitionKey(runtimeSysConfigService.getString(
                SysConfigKeys.HR_CERTIFICATE_PROCESS_KEY,
                "wf_hr_certificate_request"));
        dto.setBusinessType("HR_CERTIFICATE_REQUEST");
        dto.setBusinessId(request.getId());
        dto.setBusinessNo(request.getRequestNo());
        dto.setProcessTitle("证明开具申请-" + request.getRequestNo());
        dto.setStartUserId(request.getEmployeeId());
        Map<String, Object> vars = new LinkedHashMap<>();
        vars.put("certificateType", request.getCertificateType());
        vars.put("recipientOrg", request.getRecipientOrg());
        vars.put("copies", request.getCopies());
        dto.setVariables(vars);

        R<String> response = workflowServiceClient.startProcess(dto);
        if (response == null || !response.isSuccess() || !StringUtils.hasText(response.getData())) {
            String msg = response == null ? "Workflow 服务无响应" : response.getMsg();
            throw new HrBusinessException("WORKFLOW_START_FAILED", "证明开具流程启动失败：" + msg);
        }
        UpdateWrapper<HrCertificateRequest> wrapper = new UpdateWrapper<>();
        wrapper.eq("id", request.getId())
                .eq("tenant_id", request.getTenantId())
                .and(item -> item.isNull("process_instance_id").or().eq("process_instance_id", ""))
                .set("process_instance_id", response.getData())
                .set("update_time", LocalDateTime.now());
        certificateRequestMapper.update(null, wrapper);
        log.info("证明开具申请已提交，requestNo: {}, employeeId: {}, processInstanceId: {}",
                request.getRequestNo(), request.getEmployeeId(), response.getData());
    }

    private void cancelWorkflowIfNeeded(HrCertificateRequest request) {
        if (!StringUtils.hasText(request.getProcessInstanceId())) {
            return;
        }
        R<Void> cancelResult = workflowServiceClient.cancelProcess(
                request.getTenantId(), request.getProcessInstanceId(), "HR_CERTIFICATE_REQUEST", request.getId());
        if (cancelResult == null || !cancelResult.isSuccess()) {
            String msg = cancelResult == null ? "Workflow 服务无响应" : cancelResult.getMsg();
            throw new HrBusinessException("WORKFLOW_CANCEL_FAILED", "撤销证明开具流程失败：" + msg);
        }
    }

    @Transactional(rollbackFor = Exception.class)
    protected void markCancelled(Long id) {
        UpdateWrapper<HrCertificateRequest> wrapper = new UpdateWrapper<>();
        wrapper.eq("id", id)
                .eq("tenant_id", currentTenantId())
                .set("status", "CANCELLED")
                .set("update_time", LocalDateTime.now())
                .set("update_by", currentUserName());
        certificateRequestMapper.update(null, wrapper);
    }

    private HrCertificateRequest loadRequest(Long id) {
        if (id == null) {
            throw new HrBusinessException("INVALID_PARAMETER", "证明申请 ID 不能为空");
        }
        HrCertificateRequest request = certificateRequestMapper.selectById(id);
        if (request == null || Integer.valueOf(1).equals(request.getDeleted())) {
            throw new HrBusinessException("CERTIFICATE_NOT_FOUND", "证明申请不存在：" + id);
        }
        return request;
    }

    private Map<String, Object> buildCertificateVariables(HrCertificateRequest request) {
        Map<String, Object> vars = new LinkedHashMap<>();
        vars.put("requestNo", request.getRequestNo());
        vars.put("title", titleOf(request.getCertificateType()));
        vars.put("body", bodyOf(request));
        vars.put("companyName", runtimeSysConfigService.getString(
                SysConfigKeys.HR_CERTIFICATE_COMPANY_NAME,
                "CloudFlow 科技有限公司"));
        vars.put("issueDate", LocalDate.now().format(ISSUE_DATE));

        HrEmployee employee = employeeMapper.selectById(request.getEmployeeId());
        HrEmployeeSummaryVO summary = integrationQueryService.findEmployee(request.getEmployeeId()).orElse(null);
        vars.put("employeeName", employee == null ? "" : nullSafe(employee.getName()));
        vars.put("employeeNo", employee == null ? "" : nullSafe(employee.getEmployeeNo()));
        vars.put("deptName", summary == null ? "" : nullSafe(summary.getDeptName()));
        vars.put("positionName", summary == null ? "" : nullSafe(summary.getPositionName()));
        return vars;
    }

    private String titleOf(String certificateType) {
        return switch (String.valueOf(certificateType).toUpperCase()) {
            case "EMPLOYMENT" -> "在职证明";
            case "INCOME" -> "收入证明";
            case "SOCIAL_INSURANCE" -> "社保证明";
            default -> "员工证明";
        };
    }

    private String bodyOf(HrCertificateRequest request) {
        String purpose = StringUtils.hasText(request.getPurpose()) ? request.getPurpose() : "员工日常事务";
        String recipient = StringUtils.hasText(request.getRecipientOrg()) ? request.getRecipientOrg() : "贵单位";
        return switch (String.valueOf(request.getCertificateType()).toUpperCase()) {
            case "INCOME" -> "本证明用于 " + purpose + "，呈递 " + recipient + "。本公司将依法承担相应责任。";
            case "SOCIAL_INSURANCE" -> "本公司已依法为该员工足额缴纳社会保险及住房公积金，本证明用于 "
                    + purpose + "，呈递 " + recipient + "。";
            case "EMPLOYMENT" -> "该员工在职期间表现良好，本证明用于 " + purpose + "，呈递 " + recipient + "。";
            default -> "本证明用于 " + purpose + "，呈递 " + recipient + "。";
        };
    }

    private String generateRequestNo() {
        return "CERT-" + LocalDate.now().format(REQUEST_NO_DAY) + "-"
                + String.format("%04d", ThreadLocalRandom.current().nextInt(10_000));
    }

    private String nullSafe(String value) {
        return value == null ? "" : value;
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

    private void publishCertificateSubmittedEvent(HrCertificateRequest request, HrCertificateRequestSubmittedEvent event) {
        try {
            BusinessEventEnvelope envelope = BusinessEventEnvelope.builder()
                    .eventType("HR_CERTIFICATE_REQUEST_SUBMITTED")
                    .sourceModule("cloudflow-hr")
                    .sourceId(request.getId())
                    .tenantId(request.getTenantId())
                    .payload(objectMapper.writeValueAsString(event))
                    .build();
            outboxPublisher.publish(envelope);
        } catch (Exception e) {
            throw new HrBusinessException("WORKFLOW_EVENT_PUBLISH_FAILED", "证明开具流程事件发布失败");
        }
    }
}
