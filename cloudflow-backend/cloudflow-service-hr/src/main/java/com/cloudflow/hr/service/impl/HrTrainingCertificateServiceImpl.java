package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.hr.domain.entity.HrEmployee;
import com.cloudflow.hr.domain.entity.HrTrainingCertificate;
import com.cloudflow.hr.domain.entity.HrTrainingCertificateTemplate;
import com.cloudflow.hr.domain.entity.HrTrainingCourse;
import com.cloudflow.hr.domain.entity.HrTrainingSession;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrEmployeeMapper;
import com.cloudflow.hr.mapper.HrTrainingCertificateMapper;
import com.cloudflow.hr.mapper.HrTrainingCertificateTemplateMapper;
import com.cloudflow.hr.mapper.HrTrainingCourseMapper;
import com.cloudflow.hr.mapper.HrTrainingSessionMapper;
import com.cloudflow.hr.service.HrFileStorage;
import com.cloudflow.hr.service.HrPdfRenderer;
import com.cloudflow.hr.service.IHrTrainingArchiveService;
import com.cloudflow.hr.service.IHrTrainingCertificateService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;

/**
 * 培训证书业务实现：colleagues 与 {@link HrCertificateServiceImpl} 共用 {@link HrPdfRenderer}/{@link HrFileStorage}。
 *
 * <p>不挂工作流（培训证书是培训结业后 HR 主动颁发，没有审批节点）；自动触发可由
 * {@link HrWorkflowCallbackServiceImpl} 在培训报名 APPROVED + completion_status=PASSED 时调用
 * {@link #issue(Long, Long, Long, Long)}，本批次先开放手动入口。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class HrTrainingCertificateServiceImpl implements IHrTrainingCertificateService {

    private static final DateTimeFormatter ISSUE_DATE_DISPLAY = DateTimeFormatter.ofPattern("yyyy 年 MM 月 dd 日");
    private static final DateTimeFormatter PERIOD_DATE_DISPLAY = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final DateTimeFormatter CERT_NO_DAY = DateTimeFormatter.ofPattern("yyyyMMdd");

    private final HrTrainingCertificateMapper certificateMapper;
    private final HrTrainingCertificateTemplateMapper templateMapper;
    private final HrTrainingCourseMapper courseMapper;
    private final HrTrainingSessionMapper sessionMapper;
    private final HrEmployeeMapper employeeMapper;
    private final HrPdfRenderer pdfRenderer;
    private final HrFileStorage fileStorage;
    private final IHrTrainingArchiveService archiveService;

    @Value("${cloudflow.hr.certificate.company-name:CloudFlow 科技有限公司}")
    private String companyName;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long issue(Long employeeId, Long courseId, Long sessionId, Long templateId) {
        if (employeeId == null || courseId == null) {
            throw new HrBusinessException("INVALID_PARAMETER", "employeeId 与 courseId 不能为空");
        }
        Long tenantId = currentTenantId();
        if (sessionId != null) {
            QueryWrapper<HrTrainingCertificate> dup = new QueryWrapper<>();
            dup.eq("tenant_id", tenantId)
                    .eq("employee_id", employeeId)
                    .eq("course_id", courseId)
                    .eq("session_id", sessionId)
                    .eq("status", "VALID")
                    .eq("deleted", 0);
            if (certificateMapper.selectCount(dup) > 0) {
                throw new HrBusinessException("CERTIFICATE_DUPLICATE",
                        "该员工已持有本班次有效证书，请勿重复颁发");
            }
        }
        HrTrainingCertificate cert = new HrTrainingCertificate();
        cert.setTenantId(tenantId);
        cert.setEmployeeId(employeeId);
        cert.setCourseId(courseId);
        cert.setSessionId(sessionId);
        cert.setTemplateId(templateId);
        cert.setCertNo(generateCertNo());
        cert.setIssueDate(LocalDate.now());
        cert.setStatus("VALID");
        cert.setDeleted(0);
        cert.setCreateBy(currentUserName());
        cert.setUpdateBy(currentUserName());
        certificateMapper.insert(cert);

        Long fileId = renderAndStorePdf(cert);
        UpdateWrapper<HrTrainingCertificate> wrapper = new UpdateWrapper<>();
        wrapper.eq("id", cert.getId())
                .eq("tenant_id", tenantId)
                .set("pdf_file_id", fileId)
                .set("update_time", LocalDateTime.now())
                .set("update_by", currentUserName());
        certificateMapper.update(null, wrapper);
        log.info("培训证书已颁发，certNo: {}, employeeId: {}, courseId: {}, pdfFileId: {}",
                cert.getCertNo(), employeeId, courseId, fileId);
        // HR-P0-1 触发培训档案异步增量刷新(证书数量变更)
        archiveService.incrementOnCertificateChange(employeeId);
        return cert.getId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void revoke(Long id, String reason) {
        HrTrainingCertificate cert = loadCertificate(id);
        if ("REVOKED".equalsIgnoreCase(cert.getStatus())) {
            return;
        }
        UpdateWrapper<HrTrainingCertificate> wrapper = new UpdateWrapper<>();
        wrapper.eq("id", id)
                .eq("tenant_id", currentTenantId())
                .set("status", "REVOKED")
                .set("revoked_reason", StringUtils.hasText(reason) ? reason : null)
                .set("update_time", LocalDateTime.now())
                .set("update_by", currentUserName());
        certificateMapper.update(null, wrapper);
        log.info("培训证书已撤销，certNo: {}, reason: {}", cert.getCertNo(), reason);
        // HR-P0-1 触发培训档案异步增量刷新(撤销影响有效证书数)
        archiveService.incrementOnCertificateChange(cert.getEmployeeId());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void regeneratePdf(Long id) {
        HrTrainingCertificate cert = loadCertificate(id);
        if (!"VALID".equalsIgnoreCase(cert.getStatus())) {
            throw new HrBusinessException("CERTIFICATE_NOT_VALID",
                    "仅 VALID 证书可重新渲染 PDF，当前状态：" + cert.getStatus());
        }
        Long fileId = renderAndStorePdf(cert);
        UpdateWrapper<HrTrainingCertificate> wrapper = new UpdateWrapper<>();
        wrapper.eq("id", id)
                .eq("tenant_id", currentTenantId())
                .set("pdf_file_id", fileId)
                .set("update_time", LocalDateTime.now())
                .set("update_by", currentUserName());
        certificateMapper.update(null, wrapper);
    }

    private Long renderAndStorePdf(HrTrainingCertificate cert) {
        String template = resolveTemplate(cert.getTemplateId());
        Map<String, Object> vars = buildVariables(cert);
        String html = pdfRenderer.fillTemplate(template, vars);
        byte[] pdfBytes = pdfRenderer.render(html);
        String fileName = "training-certificate-" + cert.getCertNo() + ".pdf";
        return fileStorage.save(pdfBytes, fileName, "application/pdf");
    }

    private String resolveTemplate(Long templateId) {
        if (templateId == null) {
            return pdfRenderer.defaultTrainingCertificateTemplate();
        }
        HrTrainingCertificateTemplate template = templateMapper.selectById(templateId);
        if (template == null) {
            return pdfRenderer.defaultTrainingCertificateTemplate();
        }
        // 当前模板表存 fields 元数据，暂未存 HTML 主体；保留扩展位（后续可加 html_content 列）。
        return pdfRenderer.defaultTrainingCertificateTemplate();
    }

    private Map<String, Object> buildVariables(HrTrainingCertificate cert) {
        Map<String, Object> vars = new LinkedHashMap<>();
        vars.put("certNo", cert.getCertNo());
        vars.put("companyName", companyName);
        vars.put("issueDate", cert.getIssueDate() == null
                ? LocalDate.now().format(ISSUE_DATE_DISPLAY)
                : cert.getIssueDate().format(ISSUE_DATE_DISPLAY));

        HrEmployee employee = cert.getEmployeeId() == null ? null : employeeMapper.selectById(cert.getEmployeeId());
        vars.put("employeeName", employee == null ? "" : nullSafe(employee.getName()));
        vars.put("employeeNo", employee == null ? "" : nullSafe(employee.getEmployeeNo()));

        HrTrainingCourse course = cert.getCourseId() == null ? null : courseMapper.selectById(cert.getCourseId());
        vars.put("courseName", course == null ? "" : nullSafe(course.getCourseName()));
        vars.put("courseCode", course == null ? "" : nullSafe(course.getCourseCode()));
        BigDecimal credit = course == null ? null : course.getCreditHours();
        vars.put("creditHours", credit == null ? "" : credit.stripTrailingZeros().toPlainString());

        HrTrainingSession session = cert.getSessionId() == null ? null : sessionMapper.selectById(cert.getSessionId());
        vars.put("startDate", session == null || session.getStartTime() == null
                ? "" : session.getStartTime().toLocalDate().format(PERIOD_DATE_DISPLAY));
        vars.put("endDate", session == null || session.getEndTime() == null
                ? "" : session.getEndTime().toLocalDate().format(PERIOD_DATE_DISPLAY));
        return vars;
    }

    private HrTrainingCertificate loadCertificate(Long id) {
        if (id == null) {
            throw new HrBusinessException("INVALID_PARAMETER", "证书 ID 不能为空");
        }
        HrTrainingCertificate cert = certificateMapper.selectById(id);
        if (cert == null || Integer.valueOf(1).equals(cert.getDeleted())) {
            throw new HrBusinessException("CERTIFICATE_NOT_FOUND", "培训证书不存在：" + id);
        }
        return cert;
    }

    private String generateCertNo() {
        return "TC-" + LocalDate.now().format(CERT_NO_DAY) + "-"
                + String.format("%05d", ThreadLocalRandom.current().nextInt(100_000));
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
