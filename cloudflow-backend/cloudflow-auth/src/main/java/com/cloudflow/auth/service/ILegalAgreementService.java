package com.cloudflow.auth.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.auth.domain.SysLegalRelease;
import com.cloudflow.auth.domain.SysTenant;
import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.auth.domain.vo.LegalDocumentDetailVO;
import com.cloudflow.auth.domain.vo.LegalReleaseVO;

import jakarta.servlet.http.HttpServletRequest;

public interface ILegalAgreementService extends IService<SysLegalRelease> {

    LegalReleaseVO getActiveRelease(String tenantCode);

    LegalDocumentDetailVO getDocument(String tenantCode, String releaseCode, String docType);

    void assertCurrentReleaseAccepted(SysTenant tenant, String releaseCode);

    void recordConsent(SysUser user, String releaseCode, HttpServletRequest request, String source);
}
