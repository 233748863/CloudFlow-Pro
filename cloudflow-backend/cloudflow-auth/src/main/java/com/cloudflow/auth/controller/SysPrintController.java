package com.cloudflow.auth.controller;

import cn.dev33.satoken.annotation.SaCheckLogin;
import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.auth.domain.SysPrintRecord;
import com.cloudflow.auth.service.SysPrintRecordService;
import com.cloudflow.auth.service.SysPrintService;
import com.cloudflow.auth.service.SysPrintTemplateService;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.utils.IpUtils;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import jakarta.servlet.http.HttpServletRequest;
import java.nio.charset.StandardCharsets;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/system/print")
@RequiredArgsConstructor
public class SysPrintController {
    private final SysPrintService service;
    private final SysPrintRecordService records;

    @GetMapping("/{bizType}/{bizId}/templates")
    @SaCheckLogin
    public R<List<SysPrintTemplateService.PrintTemplateOption>> templates(@PathVariable String bizType, @PathVariable Long bizId) {
        return R.ok(service.options(bizType, bizId));
    }

    @PostMapping("/{bizType}/{bizId}")
    @SaCheckLogin
    @RepeatSubmit.Disabled
    @SysLog(value = "业务文档打印", logParams = false)
    public ResponseEntity<byte[]> print(@PathVariable String bizType, @PathVariable Long bizId,
            @RequestParam(required = false) String templateCode, @RequestParam(required = false) String outputFormat, HttpServletRequest request) {
        return response(service.print(bizType, bizId, templateCode, outputFormat, IpUtils.getIpAddr(request)));
    }

    @GetMapping("/record/list")
    @SaCheckPermission("system:print:record:list")
    public R<PageResult<SysPrintRecord>> records(@RequestParam(required = false) String bizType, @RequestParam(required = false) String bizId,
            @RequestParam(required = false) Long operatorId, @RequestParam(defaultValue = "1") int pageNum, @RequestParam(defaultValue = "10") int pageSize) {
        return R.ok(records.list(bizType, bizId, operatorId, pageNum, pageSize));
    }

    public static ResponseEntity<byte[]> response(SysPrintService.PrintOutput output) {
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(output.contentType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(output.filename(), StandardCharsets.UTF_8).build().toString())
                .header(HttpHeaders.CACHE_CONTROL, "private, no-store").header("X-Content-Type-Options", "nosniff")
                .header("Content-Security-Policy", "sandbox; default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'")
                .body(output.bytes());
    }
}
