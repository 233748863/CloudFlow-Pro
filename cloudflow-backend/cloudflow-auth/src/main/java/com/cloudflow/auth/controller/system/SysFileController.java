package com.cloudflow.auth.controller.system;

import com.cloudflow.auth.domain.SysFile;
import com.cloudflow.auth.service.ISysFileService;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.Arrays;

@RestController
@RequestMapping("/system/file")
public class SysFileController {

    @Autowired
    private ISysFileService sysFileService;

    /**
     * 上传文件
     */
    @PostMapping("/upload")
    public R<SysFile> upload(@RequestParam("file") MultipartFile file) {
        try {
            return R.ok(sysFileService.uploadFile(file));
        } catch (Exception e) {
            return R.fail(e.getMessage());
        }
    }

    /**
     * 查询文件列表
     */
    @GetMapping("/list")
    public R<PageResult<SysFile>> list(SysFile sysFile, PageQuery pageQuery) {
        return R.ok(sysFileService.selectFileList(sysFile, pageQuery));
    }

    /**
     * 删除文件
     */
    @DeleteMapping("/{fileIds}")
    public R<?> remove(@PathVariable Long[] fileIds) {
        sysFileService.deleteFileByIds(fileIds);
        return R.ok();
    }
}
