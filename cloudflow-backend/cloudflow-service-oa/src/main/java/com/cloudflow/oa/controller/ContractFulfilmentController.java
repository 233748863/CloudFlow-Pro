package com.cloudflow.oa.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.oa.domain.*;
import com.cloudflow.oa.domain.dto.ContractSignDTO;
import com.cloudflow.oa.domain.dto.ContractTermConfirmDTO;
import com.cloudflow.oa.service.impl.*;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/contract")
@RequiredArgsConstructor
public class ContractFulfilmentController {
    private final OaContractFulfilmentService fulfilment;
    private final OaContractTermTemplateService templates;

    @PostMapping(value = "/terms/{id}/evidence", consumes = "multipart/form-data")
    @SaCheckPermission("oa:contract-term:confirm")
    @RepeatSubmit
    @SysLog("上传合同履约证据")
    public R<OaPrivateFileStorageService.UploadedFile> uploadEvidence(@PathVariable Long id, @RequestParam("file") org.springframework.web.multipart.MultipartFile file) { return R.ok(fulfilment.uploadEvidence(id, file)); }

    @GetMapping("/terms/{id}/evidence")
    @SaCheckPermission("oa:contract:list")
    public org.springframework.http.ResponseEntity<byte[]> downloadEvidence(@PathVariable Long id) { return fulfilment.downloadEvidence(id); }

    @PostMapping(value = "/{id}/signed-file", consumes = "multipart/form-data")
    @SaCheckPermission("oa:contract:sign")
    @RepeatSubmit
    @SysLog("上传合同签署文件")
    public R<OaPrivateFileStorageService.UploadedFile> uploadSignedFile(@PathVariable Long id, @RequestParam("file") org.springframework.web.multipart.MultipartFile file) { return R.ok(fulfilment.uploadSignedFile(id, file)); }

    @GetMapping("/{id}/signed-file")
    @SaCheckPermission("oa:contract:list")
    public org.springframework.http.ResponseEntity<byte[]> downloadSignedFile(@PathVariable Long id) { return fulfilment.downloadSignedFile(id); }

    @GetMapping("/{id}/terms")
    @SaCheckPermission("oa:contract:list")
    public R<List<OaContractFulfilmentTerm>> terms(@PathVariable Long id) { return R.ok(fulfilment.terms(id)); }

    @PostMapping("/terms")
    @SaCheckPermission("oa:contract-term:edit")
    @RepeatSubmit
    @SysLog("保存合同履约条款")
    public R<Long> saveTerm(@RequestBody OaContractFulfilmentTerm term) { return R.ok(fulfilment.saveTerm(term)); }

    @DeleteMapping("/terms/{id}")
    @SaCheckPermission("oa:contract-term:edit")
    @SysLog("删除合同履约条款")
    public R<Void> removeTerm(@PathVariable Long id) { fulfilment.removeTerm(id); return R.ok(); }

    @PostMapping("/terms/{id}/confirm")
    @SaCheckPermission("oa:contract-term:confirm")
    @RepeatSubmit
    @SysLog("确认合同条款履约")
    public R<Void> confirmTerm(@PathVariable Long id, @RequestBody ContractTermConfirmDTO request) { fulfilment.confirmTerm(id, request); return R.ok(); }

    @PostMapping("/terms/{id}/waive")
    @SaCheckPermission("oa:contract-term:waive")
    @RepeatSubmit
    @SysLog("豁免合同履约条款")
    public R<Void> waiveTerm(@PathVariable Long id, @RequestBody ContractTermConfirmDTO request) { fulfilment.waiveTerm(id, request); return R.ok(); }

    @PostMapping("/{id}/sign")
    @SaCheckPermission("oa:contract:sign")
    @RepeatSubmit
    @SysLog("合同签署留痕")
    public R<OaClientIpResolver.Resolution> sign(@PathVariable Long id, @RequestBody ContractSignDTO request, HttpServletRequest http) { return R.ok(fulfilment.sign(id, request, http)); }

    @GetMapping("/templates/{id}/terms")
    @SaCheckPermission("oa:contract-template:list")
    public R<List<OaContractTemplateTerm>> templateTerms(@PathVariable Long id) { return R.ok(templates.terms(id)); }

    @PostMapping("/templates/{id}/terms")
    @SaCheckPermission("oa:contract-template:edit")
    @RepeatSubmit
    @SysLog("保存合同模板条款")
    public R<Void> saveTemplateTerms(@PathVariable Long id, @RequestBody List<OaContractTemplateTerm> terms) { templates.saveTerms(id, terms); return R.ok(); }

    @PostMapping("/{id}/template/{templateId}")
    @SaCheckPermission("oa:contract-term:edit")
    @RepeatSubmit
    @SysLog("合同应用履约模板")
    public R<Void> applyTemplate(@PathVariable Long id, @PathVariable Long templateId) { templates.applyTemplate(id, templateId); return R.ok(); }

    @PostMapping("/{id}/save-template/{templateId}")
    @SaCheckPermission("oa:contract-template:edit")
    @RepeatSubmit
    @SysLog("合同条款另存模板")
    public R<Void> saveFromContract(@PathVariable Long id, @PathVariable Long templateId) { templates.saveFromContract(id, templateId); return R.ok(); }
}
