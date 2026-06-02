package com.cloudflow.auth.controller.system;

import com.cloudflow.auth.domain.SysFile;
import com.cloudflow.auth.domain.dto.TenantStorageSummaryDTO;
import com.cloudflow.auth.service.ISysFileService;
import com.cloudflow.auth.service.ISysTenantService;
import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

/**
 * 文件管理 Controller。
 */
@RestController
@RequestMapping("/system/file")
@RequiredArgsConstructor
public class SysFileController {

    private final ISysFileService sysFileService;
    private final ISysTenantService sysTenantService;

    @PostMapping("/upload")
    @RepeatSubmit
    @SaCheckPermission("system:file:upload")
    public R<SysFile> upload(@RequestParam("file") MultipartFile file) {
        try {
            return R.ok(sysFileService.uploadFile(file));
        } catch (Exception e) {
            return R.fail(e.getMessage());
        }
    }

    @GetMapping("/list")
    @SaCheckPermission("system:file:list")
    public R<PageResult<SysFile>> list(SysFile sysFile, PageQuery pageQuery) {
        return R.ok(sysFileService.selectFileList(sysFile, pageQuery));
    }

    @GetMapping("/access")
    @SaCheckPermission("system:file:list")
    public void access(@RequestParam("path") String path, HttpServletResponse response) {
        sysFileService.accessFile(path, response);
    }

    @GetMapping("/storage/summary")
    @SaCheckPermission("system:file:list")
    public R<TenantStorageSummaryDTO> getStorageSummary() {
        Long tenantId = UserContext.getTenantId();
        if (tenantId == null) {
            return R.fail("当前用户未绑定租户");
        }
        return R.ok(sysTenantService.getTenantStorageSummary(tenantId));
    }

    @PostMapping("/storage/refresh")
    @RepeatSubmit
    @SaCheckPermission("system:file:edit")
    public R<TenantStorageSummaryDTO> refreshStorageSummary() {
        Long tenantId = UserContext.getTenantId();
        if (tenantId == null) {
            return R.fail("当前用户未绑定租户");
        }
        return R.ok(sysTenantService.refreshTenantStorageSummary(tenantId));
    }

    @DeleteMapping("/{fileIds}")
    @SaCheckPermission("system:file:remove")
    public R<?> remove(@PathVariable("fileIds") Long[] fileIds) {
        sysFileService.deleteFileByIds(fileIds);
        return R.ok();
    }
}
