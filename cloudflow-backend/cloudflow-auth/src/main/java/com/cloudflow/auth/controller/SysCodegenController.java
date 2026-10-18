package com.cloudflow.auth.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.auth.domain.SysCodegenTable;
import com.cloudflow.auth.domain.dto.CodegenImportDTO;
import com.cloudflow.auth.domain.dto.CodegenSaveDTO;
import com.cloudflow.auth.domain.dto.CodegenWriteDTO;
import com.cloudflow.auth.domain.vo.CodegenDetailVO;
import com.cloudflow.auth.domain.vo.CodegenOptionsVO;
import com.cloudflow.auth.domain.vo.CodegenWriteResultVO;
import com.cloudflow.auth.domain.vo.DbTableVO;
import com.cloudflow.auth.service.ISysCodegenService;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * 代码生成器管理接口。
 */
@RestController
@RequestMapping("/system/codegen")
@RequiredArgsConstructor
public class SysCodegenController {

    private final ISysCodegenService codegenService;

    @Value("${cloudflow.codegen.enabled:false}")
    private boolean enabled;

    /**
     * 查询当前数据源中尚未导入的表。
     */
    @GetMapping("/db/list")
    @SaCheckPermission("system:codegen:list")
    public R<PageResult<DbTableVO>> dbTableList(
            @RequestParam(required = false) String tableName,
            @RequestParam(required = false) String tableComment,
            @RequestParam(defaultValue = "1") Integer pageNum,
            @RequestParam(defaultValue = "10") Integer pageSize) {
        ensureEnabled();
        return R.ok(codegenService.selectDatabaseTablePage(tableName, tableComment, pageNum, pageSize));
    }

    @GetMapping("/list")
    @SaCheckPermission("system:codegen:list")
    public R<PageResult<SysCodegenTable>> list(
            SysCodegenTable query,
            @RequestParam(defaultValue = "1") Integer pageNum,
            @RequestParam(defaultValue = "10") Integer pageSize) {
        ensureEnabled();
        return R.ok(codegenService.selectImportedTablePage(query, pageNum, pageSize));
    }

    @GetMapping("/options")
    @SaCheckPermission("system:codegen:list")
    public R<CodegenOptionsVO> options() {
        ensureEnabled();
        return R.ok(codegenService.getOptions());
    }

    @GetMapping("/{tableId}")
    @SaCheckPermission("system:codegen:list")
    public R<CodegenDetailVO> getInfo(@PathVariable Long tableId) {
        ensureEnabled();
        return R.ok(codegenService.getDetail(tableId));
    }

    @SysLog("导入代码生成表结构")
    @RepeatSubmit
    @PostMapping("/import")
    @SaCheckPermission("system:codegen:import")
    public R<Void> importTables(@RequestBody @Valid CodegenImportDTO dto) {
        ensureEnabled();
        codegenService.importTables(dto);
        return R.ok();
    }

    @SysLog("保存代码生成配置")
    @PutMapping
    @SaCheckPermission("system:codegen:edit")
    public R<Void> edit(@RequestBody @Valid CodegenSaveDTO dto) {
        ensureEnabled();
        codegenService.saveConfiguration(dto);
        return R.ok();
    }

    @SysLog("同步代码生成表结构")
    @RepeatSubmit
    @PostMapping("/{tableId}/sync")
    @SaCheckPermission("system:codegen:edit")
    public R<Void> syncTable(@PathVariable Long tableId) {
        ensureEnabled();
        codegenService.syncTable(tableId);
        return R.ok();
    }

    @SysLog("预览生成代码")
    @GetMapping("/{tableId}/preview")
    @SaCheckPermission("system:codegen:preview")
    public R<Map<String, String>> preview(@PathVariable Long tableId) {
        ensureEnabled();
        return R.ok(codegenService.preview(tableId));
    }

    @SysLog("下载生成代码")
    @GetMapping("/{tableId}/download")
    @SaCheckPermission("system:codegen:generate")
    public void download(@PathVariable Long tableId, HttpServletResponse response) {
        ensureEnabled();
        codegenService.download(tableId, response);
    }

    @SysLog("写入生成代码到磁盘")
    @RepeatSubmit
    @PostMapping("/{tableId}/write")
    @SaCheckPermission("system:codegen:generate")
    public R<CodegenWriteResultVO> writeToDisk(@PathVariable Long tableId,
                                               @RequestBody @Valid CodegenWriteDTO dto) {
        ensureEnabled();
        return R.ok(codegenService.writeToDisk(tableId, dto));
    }

    @SysLog("删除代码生成配置")
    @DeleteMapping("/{tableIds}")
    @SaCheckPermission("system:codegen:remove")
    public R<Void> remove(@PathVariable List<Long> tableIds) {
        ensureEnabled();
        codegenService.remove(tableIds);
        return R.ok();
    }

    private void ensureEnabled() {
        if (!enabled) {
            throw new ServiceException("代码生成器已关闭", 403);
        }
    }
}
