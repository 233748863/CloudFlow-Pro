package com.cloudflow.auth.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.auth.domain.SysPrintTemplate;
import com.cloudflow.auth.domain.dto.PrintTemplateDTO;
import com.cloudflow.auth.service.SysPrintTemplateService;
import com.cloudflow.auth.service.SysPrintService;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/system/print/template")
@RequiredArgsConstructor
public class SysPrintTemplateController {
    private final SysPrintTemplateService service;
    private final SysPrintService printing;

    @PostMapping("/{id}/preview")
    @SaCheckPermission("system:print:template:list")
    @RepeatSubmit.Disabled
    @SysLog(value = "打印模板示例预览", logParams = false)
    public ResponseEntity<byte[]> preview(@PathVariable Long id, @RequestBody Map<String, Object> sample,
            @RequestParam(required = false) String outputFormat) {
        return SysPrintController.response(printing.preview(id, sample, outputFormat));
    }

    @GetMapping("/list")
    @SaCheckPermission("system:print:template:list")
    public R<PageResult<SysPrintTemplate>> list(@RequestParam(required = false) String templateCode,
            @RequestParam(required = false) String bizType, @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "1") int pageNum, @RequestParam(defaultValue = "10") int pageSize) {
        return R.ok(service.list(templateCode, bizType, status, pageNum, pageSize));
    }

    @GetMapping("/{id}")
    @SaCheckPermission("system:print:template:list")
    public R<SysPrintTemplate> detail(@PathVariable Long id) { return R.ok(service.detail(id)); }

    @GetMapping("/{id}/file")
    @SaCheckPermission("system:print:template:list")
    public void download(@PathVariable Long id, HttpServletResponse response) { service.download(id, response); }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @SaCheckPermission("system:print:template:edit")
    @RepeatSubmit
    @SysLog("新增打印模板")
    public R<SysPrintTemplate> add(@RequestPart("template") @Valid PrintTemplateDTO template,
            @RequestPart(value = "file", required = false) MultipartFile file) { return R.ok(service.save(template, file, true)); }

    @PutMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @SaCheckPermission("system:print:template:edit")
    @SysLog("修改打印模板")
    public R<SysPrintTemplate> edit(@RequestPart("template") @Valid PrintTemplateDTO template,
            @RequestPart(value = "file", required = false) MultipartFile file) { return R.ok(service.save(template, file, false)); }

    @DeleteMapping("/{id}")
    @SaCheckPermission("system:print:template:edit")
    @SysLog("删除打印模板")
    public R<Void> remove(@PathVariable Long id, @RequestParam Integer version) { service.remove(id, version); return R.ok(); }
}
