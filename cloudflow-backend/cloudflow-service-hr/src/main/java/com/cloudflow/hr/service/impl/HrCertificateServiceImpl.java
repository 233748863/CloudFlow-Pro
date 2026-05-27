package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.hr.client.WorkflowServiceClient;
import com.cloudflow.hr.client.dto.ProcessStartDTO;
import com.cloudflow.hr.domain.dto.HrCertificateRequestPayload;
import com.cloudflow.hr.domain.entity.HrCertificateRequest;
import com.cloudflow.hr.domain.entity.HrEmployee;
import com.cloudflow.hr.domain.vo.HrEmployeeSummaryVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrCertificateRequestMapper;
import com.cloudflow.hr.mapper.HrEmployeeMapper;
import com.cloudflow.hr.service.IHrCertificateService;
import com.cloudflow.hr.service.HrEssSupport;
import com.cloudflow.hr.service.HrFileStorage;
import com.cloudflow.hr.service.IHrIntegrationQueryService;
import com.cloudflow.hr.service.HrPdfRenderer;
import com.cloudflow.hr.service.dto.HrFileDownload;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
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

/**
 * HR 证明开具业务实现。
 *
 * <p>submit 流：插入 hr_certificate_request(status=PENDING) → 走 workflow startProcess
 * 拿到 processInstanceId 回填 → 等待 {@link HrWorkflowCallbackServiceImpl} 回调写 APPROVED →
 * 由 {@link com.cloudflow.hr.service.impl.HrWorkflowCallbackServiceImpl#applySideEffects}
 * 调用 {@link #issuePdf(Long)} 渲染 PDF 并切到 ISSUED。
 *
 * <p>合同签署、培训报名也走同样链路；本类只承担证明这条业务。
 */
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

    @Value("${cloudflow.hr.certificate.company-name:CloudFlow 科技有限公司}")
    private String companyName;

    @Value("${cloudflow.hr.certificate.process-key:wf_hr_certificate_request}")
    private String processDefinitionKey;

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

        ProcessStartDTO dto = new ProcessStartDTO();
        dto.setTenantId(tenantId);
        dto.setProcessDefinitionKey(processDefinitionKey);
        dto.setBusinessType("HR_CERTIFICATE_REQUEST");
        dto.setBusinessId(request.getId());
        dto.setBusinessNo(request.getRequestNo());
        dto.setProcessTitle("证明开具申请-" + request.getRequestNo());
        dto.setStartUserId(UserContext.getUserId());
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
                .eq("tenant_id", tenantId)
                .set("process_instance_id", response.getData())
                .set("update_time", LocalDateTime.now());
        certificateRequestMapper.update(null, wrapper);
        log.info("证明开具申请已提交，requestNo: {}, employeeId: {}, processInstanceId: {}",
                request.getRequestNo(), employeeId, response.getData());
        return request.getId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void cancel(Long id) {
        HrCertificateRequest request = loadRequest(id);
        essSupport.assertOwner(request.getEmployeeId());
        if (!CANCELABLE_STATUS.contains(String.valueOf(request.getStatus()).toUpperCase())) {
            throw new HrBusinessException("STATUS_NOT_CANCELABLE",
                    "当前状态 " + request.getStatus() + " 不允许撤销");
        }
        if (StringUtils.hasText(request.getProcessInstanceId())) {
            R<Void> cancelResult = workflowServiceClient.cancelProcess(request.getProcessInstanceId());
            if (cancelResult == null || !cancelResult.isSuccess()) {
                String msg = cancelResult == null ? "Workflow 服务无响应" : cancelResult.getMsg();
                log.warn("撤销流程实例失败，requestNo: {}, processInstanceId: {}, msg: {}",
                        request.getRequestNo(), request.getProcessInstanceId(), msg);
            }
        }
        UpdateWrapper<HrCertificateRequest> wrapper = new UpdateWrapper<>();
        wrapper.eq("id", id)
                .eq("tenant_id", currentTenantId())
                .set("status", "CANCELLED")
                .set("update_time", LocalDateTime.now())
                .set("update_by", currentUserName());
        certificateRequestMapper.update(null, wrapper);
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
            throw new HrBusinessException("CERTIFICATE_NOT_ISSUED",
                    "证明尚未生成 PDF，当前状态：" + request.getStatus());
        }
        byte[] bytes = fileStorage.load(request.getPdfFileId());
        HrFileDownload result = new HrFileDownload();
        result.setFileName("certificate-" + request.getRequestNo() + ".pdf");
        result.setContentType("application/pdf");
        result.setBytes(bytes);
        result.setBusinessNo(request.getRequestNo());
        return result;
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
        vars.put("companyName", companyName);
        vars.put("issueDate", LocalDate.now().format(ISSUE_DATE));

        HrEmployee employee = employeeMapper.selectById(request.getEmployeeId());
        HrEmployeeSummaryVO summary = integrationQueryService.findEmployee(request.getEmployeeId())
                .orElse(null);
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
}
