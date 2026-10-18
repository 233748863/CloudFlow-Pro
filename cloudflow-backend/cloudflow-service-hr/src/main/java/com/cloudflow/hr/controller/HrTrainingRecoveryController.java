package com.cloudflow.hr.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.hr.domain.dto.HrTrainingRecoveryRequests;
import com.cloudflow.hr.domain.vo.settlement.HrTrainingRecoveryView;
import com.cloudflow.hr.service.HrTrainingRecoveryService;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
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
@RequestMapping("/training-recovery")
@SaCheckPermission("hr:training-recovery:manage")
@RequiredArgsConstructor
public class HrTrainingRecoveryController {
    private final HrTrainingRecoveryService service;
    @ModelAttribute
    public void privateResponse(HttpServletResponse response) { response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store"); }
    @GetMapping({"", "/list"})
    public R<PageResult<HrTrainingRecoveryView>> list(@Valid @ModelAttribute HrTrainingRecoveryRequests.Query query) { return R.ok(service.list(query)); }
    @GetMapping("/{id}")
    public R<HrTrainingRecoveryView> detail(@PathVariable Long id) { return R.ok(service.detail(id)); }
    @GetMapping("/enrollments")
    public R<PageResult<HrTrainingRecoveryView.Enrollment>> enrollments(@Valid @ModelAttribute HrTrainingRecoveryRequests.Query query) { return R.ok(service.enrollments(query)); }
    @PostMapping("/agreements")
    @RepeatSubmit
    @SysLog(value = "上传培训追偿协议", logParams = false)
    public R<HrTrainingRecoveryView.Agreement> upload(@RequestParam Long enrollmentId, @RequestParam("file") MultipartFile file) { return R.ok(service.uploadAgreement(enrollmentId, file)); }
    @PostMapping
    @RepeatSubmit
    @SysLog(value = "保存培训追偿核定草稿", logParams = false)
    public R<Long> create(@Valid @RequestBody HrTrainingRecoveryRequests.Draft input) { return R.ok(service.create(input)); }
    @PutMapping("/{id}")
    @RepeatSubmit
    @SysLog(value = "更新培训追偿核定草稿", logParams = false)
    public R<Void> update(@PathVariable Long id, @Valid @RequestBody HrTrainingRecoveryRequests.Update input) { service.update(id, input); return R.ok(); }
    @PostMapping("/{id}/confirm")
    @RepeatSubmit
    @SysLog(value = "核定培训追偿", logParams = false)
    public R<Void> confirm(@PathVariable Long id, @Valid @RequestBody HrTrainingRecoveryRequests.Confirm input) { service.confirm(id, input); return R.ok(); }
    @GetMapping("/{id}/agreement")
    public ResponseEntity<byte[]> download(@PathVariable Long id) { return service.download(id); }
}
