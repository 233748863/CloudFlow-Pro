package com.cloudflow.hr.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.hr.domain.dto.HrHRequests;
import com.cloudflow.hr.domain.dto.HrSeveranceRuleRequests;
import com.cloudflow.hr.domain.vo.settlement.HrSeveranceRuleView;
import com.cloudflow.hr.service.HrSeveranceRuleService;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/severance-rule")
@SaCheckPermission("hr:severance:manage")
@RequiredArgsConstructor
public class HrSeveranceRuleController {
    private final HrSeveranceRuleService service;
    @ModelAttribute
    public void privateResponse(HttpServletResponse response) { response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store"); }
    @GetMapping({"", "/list"})
    public R<PageResult<HrSeveranceRuleView>> list(@Valid @ModelAttribute HrSeveranceRuleRequests.Query query) { return R.ok(service.list(query)); }
    @GetMapping("/{id}")
    public R<HrSeveranceRuleView> detail(@PathVariable Long id) { return R.ok(service.detail(id)); }
    @GetMapping("/components")
    public R<List<HrSeveranceRuleView.Component>> components() { return R.ok(service.components()); }
    @PostMapping
    @RepeatSubmit
    @SysLog(value = "建立离职补偿政策草稿", logParams = false)
    public R<Long> create(@Valid @RequestBody HrSeveranceRuleRequests.Create input) { return R.ok(service.create(input)); }
    @PutMapping("/{id}")
    @RepeatSubmit
    @SysLog(value = "更新离职补偿政策草稿", logParams = false)
    public R<Void> update(@PathVariable Long id, @Valid @RequestBody HrSeveranceRuleRequests.Update input) { service.update(id, input); return R.ok(); }
    @PostMapping("/{id}/policy")
    @RepeatSubmit
    @SysLog(value = "上传离职补偿政策文件", logParams = false)
    public R<HrSeveranceRuleView> upload(@PathVariable Long id, @RequestParam Integer version, @RequestParam("file") MultipartFile file) {
        return R.ok(service.uploadPolicy(id, version, file));
    }
    @GetMapping("/{id}/policy")
    public ResponseEntity<byte[]> download(@PathVariable Long id) { return service.download(id); }
    @PostMapping("/{id}/confirm")
    @RepeatSubmit
    @SysLog(value = "核定离职补偿政策", logParams = false)
    public R<Void> confirm(@PathVariable Long id, @Valid @RequestBody HrHRequests.VersionDTO input) { service.confirm(id, input); return R.ok(); }
}
