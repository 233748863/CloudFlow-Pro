package com.cloudflow.hr.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import cn.dev33.satoken.annotation.SaMode;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.hr.domain.dto.HrAdvanceRequests;
import com.cloudflow.hr.domain.vo.advance.HrAdvanceViews;
import com.cloudflow.hr.service.HrAdvanceService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/advance")
@RequiredArgsConstructor
public class HrAdvanceController {
    private final HrAdvanceService service;

    @GetMapping("/list")
    @SaCheckPermission("hr:advance:list")
    public R<PageResult<HrAdvanceViews.Summary>> list(@Valid @ModelAttribute HrAdvanceRequests.Query query) {
        return R.ok(service.list(query, false));
    }

    @GetMapping("/mine")
    @SaCheckPermission("hr:advance:own")
    public R<PageResult<HrAdvanceViews.Summary>> mine(@Valid @ModelAttribute HrAdvanceRequests.Query query) {
        return R.ok(service.list(query, true));
    }

    @GetMapping("/{id}")
    @SaCheckPermission("hr:advance:list")
    public R<HrAdvanceViews.Detail> detail(@PathVariable Long id) { return R.ok(service.detail(id, false)); }

    @GetMapping("/mine/{id}")
    @SaCheckPermission("hr:advance:own")
    public R<HrAdvanceViews.Detail> ownDetail(@PathVariable Long id) { return R.ok(service.detail(id, true)); }

    @GetMapping("/{id}/repayments")
    @SaCheckPermission("hr:advance:list")
    public R<PageResult<HrAdvanceViews.Repayment>> repayments(@PathVariable Long id, @Valid @ModelAttribute HrAdvanceRequests.Query query) {
        return R.ok(service.repaymentList(id, query, false));
    }

    @GetMapping("/mine/{id}/repayments")
    @SaCheckPermission("hr:advance:own")
    public R<PageResult<HrAdvanceViews.Repayment>> ownRepayments(@PathVariable Long id, @Valid @ModelAttribute HrAdvanceRequests.Query query) {
        return R.ok(service.repaymentList(id, query, true));
    }

    @PostMapping
    @SaCheckPermission("hr:advance:apply")
    @RepeatSubmit
    @SysLog(value = "创建本人借款草稿", logParams = false)
    public R<Long> create(@Valid @RequestBody HrAdvanceRequests.Draft input, @RequestHeader("Idempotency-Key") String requestKey) {
        return R.ok(service.create(input, requestKey));
    }

    @PutMapping("/{id}")
    @SaCheckPermission("hr:advance:apply")
    @RepeatSubmit
    @SysLog(value = "修改本人借款草稿", logParams = false)
    public R<Void> update(@PathVariable Long id, @Valid @RequestBody HrAdvanceRequests.Draft input) {
        service.update(id, input);
        return R.ok();
    }

    @PostMapping("/{id}/proof")
    @SaCheckPermission("hr:advance:repay")
    @RepeatSubmit
    @SysLog(value = "上传借款还款凭据", logParams = false)
    public R<HrAdvanceViews.Proof> uploadProof(@PathVariable Long id, @RequestParam("file") MultipartFile file) {
        return R.ok(service.uploadProof(id, file));
    }

    @PostMapping("/{id}/repayment")
    @SaCheckPermission("hr:advance:repay")
    @RepeatSubmit
    @SysLog(value = "登记借款实际还款", logParams = false)
    public R<Long> repay(@PathVariable Long id, @Valid @RequestBody HrAdvanceRequests.Repayment input) {
        return R.ok(service.repay(id, input));
    }

    @PostMapping("/{id}/writeoff")
    @SaCheckPermission("hr:advance:writeoff")
    @RepeatSubmit
    @SysLog(value = "核销借款本金", logParams = false)
    public R<Void> writeoff(@PathVariable Long id, @Valid @RequestBody HrAdvanceRequests.Writeoff input) {
        service.writeoff(id, input);
        return R.ok();
    }

    @GetMapping("/{id}/proof/{fileId}")
    @SaCheckPermission(value = {"hr:advance:list", "hr:advance:own"}, mode = SaMode.OR)
    public ResponseEntity<byte[]> downloadProof(@PathVariable Long id, @PathVariable Long fileId) {
        return service.downloadProof(id, fileId);
    }
}
