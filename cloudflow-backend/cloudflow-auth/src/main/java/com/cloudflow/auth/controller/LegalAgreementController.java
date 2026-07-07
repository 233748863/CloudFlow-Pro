package com.cloudflow.auth.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import cn.dev33.satoken.annotation.SaIgnore;
import com.cloudflow.auth.domain.SysLegalRelease;
import com.cloudflow.auth.domain.vo.LegalDocumentDetailVO;
import com.cloudflow.auth.domain.vo.LegalReleaseVO;
import com.cloudflow.auth.service.ILegalAgreementService;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;

@RestController
@RequiredArgsConstructor
public class LegalAgreementController {

    private final ILegalAgreementService legalAgreementService;

    @GetMapping("/legal/public/active")
    @SaIgnore
    public R<LegalReleaseVO> active(@RequestParam(required = false) String tenantCode) {
        return R.ok(legalAgreementService.getActiveRelease(tenantCode));
    }

    @GetMapping("/legal/public/document")
    @SaIgnore
    public R<LegalDocumentDetailVO> document(
            @RequestParam(required = false) String tenantCode,
            @RequestParam String releaseCode,
            @RequestParam String docType) {
        return R.ok(legalAgreementService.getDocument(tenantCode, releaseCode, docType));
    }

    @GetMapping("/system/legal/releases")
    @SaCheckPermission("system:legal:list")
    public R<List<SysLegalRelease>> releases() {
        return R.ok(legalAgreementService.list());
    }

    @PostMapping("/system/legal/releases")
    @RepeatSubmit
    @SaCheckPermission("system:legal:add")
    public R<Void> addRelease(@RequestBody SysLegalRelease release) {
        release.setCreateTime(LocalDateTime.now());
        legalAgreementService.save(release);
        return R.ok();
    }

    @PutMapping("/system/legal/releases")
    @RepeatSubmit
    @SaCheckPermission("system:legal:edit")
    public R<Void> updateRelease(@RequestBody SysLegalRelease release) {
        release.setUpdateTime(LocalDateTime.now());
        legalAgreementService.updateById(release);
        return R.ok();
    }
}
