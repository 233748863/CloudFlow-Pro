package com.cloudflow.hr.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.hr.domain.dto.HrExitInterviewRequests;
import com.cloudflow.hr.domain.vo.settlement.HrExitInterviewView;
import com.cloudflow.hr.service.HrExitInterviewService;
import jakarta.validation.Valid;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/exit-interview")
@SaCheckPermission("hr:exit-interview:manage")
@RequiredArgsConstructor
public class HrExitInterviewController {
    private final HrExitInterviewService service;

    @ModelAttribute
    public void privateResponse(HttpServletResponse response) { response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store"); }

    @GetMapping({"", "/list"})
    public R<PageResult<HrExitInterviewView>> list(@Valid @ModelAttribute HrExitInterviewRequests.Query query) { return R.ok(service.list(query)); }

    @GetMapping("/{id}")
    public R<HrExitInterviewView> detail(@PathVariable Long id) { return R.ok(service.detail(id)); }

    @GetMapping("/applications")
    public R<PageResult<HrExitInterviewView.Option>> applications(@Valid @ModelAttribute HrExitInterviewRequests.Query query) { return R.ok(service.applications(query)); }

    @GetMapping("/interviewers")
    public R<PageResult<HrExitInterviewView.Option>> interviewers(@Valid @ModelAttribute HrExitInterviewRequests.Query query) { return R.ok(service.interviewers(query)); }

    @PostMapping
    @RepeatSubmit
    @SysLog(value = "保存离职面谈", logParams = false)
    public R<Long> create(@Valid @RequestBody HrExitInterviewRequests.Draft input) { return R.ok(service.create(input)); }

    @PutMapping("/{id}")
    @RepeatSubmit
    @SysLog(value = "更新离职面谈", logParams = false)
    public R<Void> update(@PathVariable Long id, @Valid @RequestBody HrExitInterviewRequests.Draft input) { service.update(id, input); return R.ok(); }

    @PostMapping("/{id}/attachments")
    @RepeatSubmit
    @SysLog(value = "上传离职面谈附件", logParams = false)
    public R<HrExitInterviewView.Attachment> upload(@PathVariable Long id, @RequestParam Integer version, @RequestParam("file") MultipartFile file) {
        return R.ok(service.upload(id, version, file));
    }

    @GetMapping("/{id}/attachments/{fileId}")
    public ResponseEntity<byte[]> download(@PathVariable Long id, @PathVariable Long fileId) { return service.download(id, fileId); }
}
