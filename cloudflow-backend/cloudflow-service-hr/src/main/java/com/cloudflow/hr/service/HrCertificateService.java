package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.dto.HrCertificateRequestPayload;
import com.cloudflow.hr.service.dto.HrFileDownload;

/**
 * 证明开具服务。员工提交申请后由审批流走 wf_hr_certificate_request；批准后即时生成 PDF
 * 落到 sys_file 并把 hr_certificate_request 切换到 ISSUED。
 */
public interface HrCertificateService {

    Long submit(HrCertificateRequestPayload payload);

    void cancel(Long id);

    /**
     * 渲染 PDF 并把 hr_certificate_request 切到 ISSUED。供工作流回调链路在 APPROVED 之后调用。
     */
    void issuePdf(Long id);

    /**
     * 读取证明 PDF 字节流，包含权限校验：仅可下载本人的 ISSUED 证明（HR 管理员视角通过其它端点）。
     */
    HrFileDownload downloadPdf(Long id);
}
