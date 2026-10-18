package com.cloudflow.common.excel.importing;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.excel.importing.model.ImportPreview;
import com.cloudflow.common.excel.importing.model.ImportTask;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ContentDisposition;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/system/import")
@ConditionalOnProperty(name = "cloudflow.import.enabled", havingValue = "true")
@RequiredArgsConstructor
public class ImportController {
    private final ImportEngine engine;

    public record ExecutionRequest(@NotNull Boolean skipInvalidRows) { }

    @GetMapping("/types")
    @SaCheckPermission("system:import:list")
    public R<List<ImportEngine.Business>> types() { return R.ok(engine.businesses()); }

    @GetMapping("/list")
    @SaCheckPermission("system:import:list")
    public R<PageResult<ImportTask>> list(@RequestParam(required = false) String bizType,
            @RequestParam(required = false) String status, @RequestParam(defaultValue = "1") int pageNum,
            @RequestParam(defaultValue = "20") int pageSize) {
        return R.ok(engine.page(bizType, status, pageNum, pageSize));
    }

    @GetMapping("/{bizType}/template")
    @SaCheckPermission("system:import:execute")
    public void template(@PathVariable String bizType, @RequestParam(defaultValue = "false") boolean updates,
            @RequestParam(required = false) String keyword, HttpServletResponse response) throws IOException {
        attachment(response, ImportSpreadsheets.safeName(bizType + (updates ? "_更新模板" : "_导入模板"), ".xlsx"));
        engine.template(bizType, updates, keyword, response.getOutputStream());
    }

    @PostMapping("/{bizType}/upload")
    @SaCheckPermission("system:import:execute")
    @RepeatSubmit
    @SysLog("上传导入文件")
    public R<ImportTask> upload(@PathVariable String bizType, @RequestParam("file") MultipartFile file) throws IOException {
        return R.ok(engine.upload(bizType, file));
    }

    @GetMapping("/{taskId}")
    @SaCheckPermission("system:import:list")
    public R<ImportTask> status(@PathVariable long taskId) { return R.ok(engine.status(taskId)); }

    @PostMapping("/{taskId}/validate")
    @SaCheckPermission("system:import:execute")
    @RepeatSubmit
    @SysLog("校验导入文件")
    public R<ImportTask> validate(@PathVariable long taskId) { return R.ok(engine.validate(taskId)); }

    @GetMapping("/{taskId}/preview")
    @SaCheckPermission("system:import:list")
    public R<ImportPreview> preview(@PathVariable long taskId, @RequestParam(defaultValue = "1") int pageNum,
                                  @RequestParam(defaultValue = "20") int pageSize) throws IOException {
        return R.ok(engine.preview(taskId, pageNum, pageSize));
    }

    @PostMapping("/{taskId}/execute")
    @SaCheckPermission("system:import:execute")
    @RepeatSubmit
    @SysLog("执行批量导入")
    public R<ImportTask> execute(@PathVariable long taskId, @Valid @RequestBody ExecutionRequest request) {
        return R.ok(engine.execute(taskId, request.skipInvalidRows()));
    }

    @PostMapping("/{taskId}/cancel")
    @SaCheckPermission("system:import:execute")
    @RepeatSubmit
    @SysLog("取消批量导入")
    public R<ImportTask> cancel(@PathVariable long taskId) { return R.ok(engine.cancel(taskId)); }

    @GetMapping("/{taskId}/file")
    @SaCheckPermission("system:import:list")
    public void original(@PathVariable long taskId, HttpServletResponse response) throws IOException {
        attachment(response, engine.status(taskId).getFileName());
        engine.download(taskId, false, response.getOutputStream());
    }

    @GetMapping("/{taskId}/errors/file")
    @SaCheckPermission("system:import:list")
    public void errors(@PathVariable long taskId, HttpServletResponse response) throws IOException {
        String original = engine.status(taskId).getFileName();
        attachment(response, ImportSpreadsheets.safeName("错误_" + original, original.endsWith(".xlsx") ? ".xlsx" : ".txt"));
        engine.download(taskId, true, response.getOutputStream());
    }

    private void attachment(HttpServletResponse response, String name) {
        response.setHeader("Cache-Control", "private, no-store");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("Content-Disposition", ContentDisposition.attachment().filename(name, StandardCharsets.UTF_8).build().toString());
        response.setContentType(name.endsWith(".xlsx") ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/octet-stream");
    }
}
