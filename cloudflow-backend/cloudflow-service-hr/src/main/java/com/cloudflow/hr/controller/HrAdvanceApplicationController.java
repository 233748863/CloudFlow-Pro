package com.cloudflow.hr.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.hr.domain.dto.HrHRequests;
import com.cloudflow.hr.domain.vo.advance.HrAdvanceViews;
import com.cloudflow.hr.service.HrAdvanceApplicationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/advance")
@RequiredArgsConstructor
public class HrAdvanceApplicationController {
    private final HrAdvanceApplicationService service;

    @GetMapping("/approval-task/{taskId}")
    @SaCheckPermission("workflow:task:complete")
    public ResponseEntity<R<HrAdvanceViews.Approval>> approvalDetail(@PathVariable String taskId) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(R.ok(service.approvalDetail(taskId)));
    }

    @PostMapping("/{id}/submit")
    @SaCheckPermission("hr:advance:submit")
    @RepeatSubmit
    @SysLog(value = "提交本人借款审批", logParams = false)
    public R<Void> submit(@PathVariable Long id, @Valid @RequestBody HrHRequests.VersionDTO input) {
        service.submit(id, input); return R.ok();
    }

    @PostMapping("/{id}/withdraw")
    @SaCheckPermission("hr:advance:submit")
    @RepeatSubmit
    @SysLog(value = "撤回本人借款审批", logParams = false)
    public R<Void> withdraw(@PathVariable Long id, @Valid @RequestBody HrHRequests.ReasonVersionDTO input) {
        service.withdraw(id, input); return R.ok();
    }
}
