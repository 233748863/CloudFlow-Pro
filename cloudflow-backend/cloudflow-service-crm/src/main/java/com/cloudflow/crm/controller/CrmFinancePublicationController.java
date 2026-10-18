package com.cloudflow.crm.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.PortalFinancePublicationVO;
import com.cloudflow.common.core.domain.PortalFinanceAttachment;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.crm.service.impl.CrmFinancePublicationService;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/receivable/{id}/portal-publication")
@RequiredArgsConstructor
public class CrmFinancePublicationController {
    private final CrmFinancePublicationService publication;

    @GetMapping
    @SaCheckPermission("crm:portal-finance:manage")
    public R<PortalFinancePublicationVO> preview(@PathVariable Long id) {
        return R.ok(publication.preview(id));
    }

    @PutMapping
    @SysLog("核对财务公开状态")
    @SaCheckPermission("crm:portal-finance:manage")
    public R<PortalFinancePublicationVO> confirm(@PathVariable Long id, @RequestBody JsonNode body) {
        return R.ok(publication.confirm(id, body));
    }

    @PostMapping(value = "/files", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @RepeatSubmit
    @SysLog("上传财务公开票据")
    @SaCheckPermission("crm:portal-finance:manage")
    public R<PortalFinanceAttachment> upload(@PathVariable Long id, @RequestPart("file") MultipartFile file) {
        return R.ok(publication.upload(id, file));
    }
}
