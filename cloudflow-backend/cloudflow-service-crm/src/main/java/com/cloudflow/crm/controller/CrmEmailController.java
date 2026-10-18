package com.cloudflow.crm.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.message.api.MessageEmailTemplateChoice;
import com.cloudflow.crm.domain.dto.CrmEmailQuery;
import com.cloudflow.crm.domain.dto.CrmEmailRequest;
import com.cloudflow.crm.domain.vo.CrmEmailRecordVO;
import com.cloudflow.crm.service.email.archive.CrmEmailArchiveFiles;
import com.cloudflow.crm.service.email.archive.CrmEmailArchiveService;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/email")
@RequiredArgsConstructor
public class CrmEmailController {
    private final CrmEmailArchiveService service;

    @GetMapping("/list")
    @SaCheckPermission("crm:email:list")
    public R<PageResult<CrmEmailRecordVO>> list(@Valid CrmEmailQuery query, PageQuery page) { return R.ok(service.list(query, page)); }

    @GetMapping("/{id}")
    @SaCheckPermission("crm:email:list")
    public R<CrmEmailRecordVO> detail(@PathVariable Long id) { return R.ok(service.detail(id)); }

    @GetMapping("/context")
    @SaCheckPermission("crm:email:list")
    public R<CrmEmailArchiveService.Context> context(@RequestParam String bizType, @RequestParam Long bizId) { return R.ok(service.context(bizType, bizId)); }

    @GetMapping("/templates")
    @SaCheckPermission("crm:email:send")
    public R<List<MessageEmailTemplateChoice>> templates() { return R.ok(service.templates()); }

    @GetMapping("/template")
    @SaCheckPermission("crm:email:send")
    @SysLog(value = "读取客户业务邮件模板", logParams = false)
    public R<CrmEmailArchiveService.TemplatePreview> template(@RequestParam String templateCode, @RequestParam String bizType,
            @RequestParam Long bizId, @RequestParam(required = false) Long contactId) { return R.ok(service.template(templateCode, bizType, bizId, contactId)); }

    @PostMapping("/draft")
    @SaCheckPermission("crm:email:send")
    @RepeatSubmit
    @SysLog(value = "保存客户邮件草稿", logParams = false)
    public R<CrmEmailArchiveService.Outcome> draft(@RequestBody @Valid CrmEmailRequest request) { return R.ok(service.draft(request)); }

    @PostMapping("/send")
    @SaCheckPermission("crm:email:send")
    @RepeatSubmit
    @SysLog(value = "提交客户业务邮件", logParams = false)
    public R<CrmEmailArchiveService.Outcome> send(@RequestBody @Valid CrmEmailRequest request) { return R.ok(service.send(request)); }

    @PostMapping("/archive-inbound")
    @SaCheckPermission("crm:email:archive")
    @RepeatSubmit
    @SysLog(value = "手工归档客户来信", logParams = false)
    public R<CrmEmailArchiveService.Outcome> archiveInbound(@RequestBody @Valid CrmEmailRequest request) { return R.ok(service.archiveInbound(request)); }

    @PostMapping("/attachments/upload")
    @SaCheckPermission("crm:email:send")
    @RepeatSubmit(key = "#bizType + ':' + #bizId + ':' + #file.originalFilename + ':' + #file.size")
    @SysLog(value = "上传客户发信私有附件", logParams = false)
    public R<CrmEmailArchiveFiles.FileInfo> upload(@RequestParam String bizType, @RequestParam Long bizId, @RequestParam MultipartFile file) {
        return R.ok(service.upload(bizType, bizId, file, false));
    }

    @PostMapping("/attachments/inbound-upload")
    @SaCheckPermission("crm:email:archive")
    @RepeatSubmit(key = "#bizType + ':' + #bizId + ':' + #file.originalFilename + ':' + #file.size")
    @SysLog(value = "上传客户来信私有附件", logParams = false)
    public R<CrmEmailArchiveFiles.FileInfo> uploadInbound(@RequestParam String bizType, @RequestParam Long bizId, @RequestParam MultipartFile file) {
        return R.ok(service.upload(bizType, bizId, file, true));
    }

    @GetMapping("/{id}/attachments/{fileId}")
    @SaCheckPermission("crm:email:list")
    @SysLog(value = "下载客户邮件私有附件", logParams = false)
    public ResponseEntity<byte[]> attachment(@PathVariable Long id, @PathVariable Long fileId) { return service.download(id, fileId); }
}
