package com.cloudflow.auth.controller.system;

import com.cloudflow.auth.domain.SysFile;
import com.cloudflow.auth.domain.dto.TenantStorageSummaryDTO;
import com.cloudflow.auth.service.ISysFileService;
import com.cloudflow.auth.service.SysTenantService;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
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
    private final SysTenantService tenantService;

    @PostMapping("/upload")
    public R<SysFile> upload(@RequestParam("file") MultipartFile file) {
        try {
            return R.ok(sysFileService.uploadFile(file));
        } catch (Exception e) {
            return R.fail(e.getMessage());
        }
    }

    @GetMapping("/list")
    public R<PageResult<SysFile>> list(SysFile sysFile, PageQuery pageQuery) {
        return R.ok(sysFileService.selectFileList(sysFile, pageQuery));
    }

    @GetMapping("/storage/summary")
    public R<TenantStorageSummaryDTO> getStorageSummary() {
        Long tenantId = UserContext.getTenantId();
        if (tenantId == null) {
            return R.fail("当前用户未绑定租户");
        }
        return R.ok(tenantService.getTenantStorageSummary(tenantId));
    }

    @PostMapping("/storage/refresh")
    public R<TenantStorageSummaryDTO> refreshStorageSummary() {
        Long tenantId = UserContext.getTenantId();
        if (tenantId == null) {
            return R.fail("当前用户未绑定租户");
        }
        return R.ok(tenantService.refreshTenantStorageSummary(tenantId));
    }

    @DeleteMapping("/{fileIds}")
    public R<?> remove(@PathVariable("fileIds") Long[] fileIds) {
        sysFileService.deleteFileByIds(fileIds);
        return R.ok();
    }
}