package com.cloudflow.hr.service;

/**
 * 培训证书业务服务：颁发 + 撤销 + 重新生成 PDF。
 *
 * <p>颁发链路：HR 在 HrTrainingExamPage 或自动触发器入口提交 (employeeId, courseId, sessionId, templateId?) →
 * 生成证书编号 → 渲染 PDF（{@link HrPdfRenderer#defaultTrainingCertificateTemplate()}） → 落 sys_file
 * → 写 hr_training_certificate(status=VALID, pdf_file_id=..., issue_date=NOW)。
 *
 * <p>撤销链路：HR 输入撤销原因 → status 切 REVOKED + revoked_reason 写回。
 */
public interface HrTrainingCertificateService {

    /**
     * 颁发培训证书。templateId 可选；缺省时走 {@code defaultTrainingCertificateTemplate}。
     */
    Long issue(Long employeeId, Long courseId, Long sessionId, Long templateId);

    /**
     * 撤销已颁发证书。
     */
    void revoke(Long id, String reason);

    /**
     * 重新渲染 PDF（模板换字体或字段修订时手动触发）。
     */
    void regeneratePdf(Long id);
}
