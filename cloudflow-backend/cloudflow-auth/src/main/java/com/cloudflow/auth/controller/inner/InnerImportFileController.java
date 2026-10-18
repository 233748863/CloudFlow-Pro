package com.cloudflow.auth.controller.inner;

import com.cloudflow.auth.service.LocalImportFileStore;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.security.annotation.Inner;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/inner/auth/import-file")
@RequiredArgsConstructor
@ConditionalOnProperty(name = "cloudflow.import.enabled", havingValue = "true")
public class InnerImportFileController {
    private final LocalImportFileStore files;

    @PostMapping("/{taskId}")
    @Inner(allowedServices = {"cloudflow-service-hr", "cloudflow-service-oa", "cloudflow-service-crm"})
    @RepeatSubmit.Disabled
    public R<String> save(@PathVariable long taskId, @RequestParam("file") MultipartFile file,
                          @RequestParam(defaultValue = "false") boolean errorFile,
                          @RequestParam(required = false) Long jobLogId) {
        return R.ok(files.saveUploaded(taskId, file, errorFile, jobLogId));
    }

    @GetMapping("/{taskId}/content")
    @Inner(allowedServices = {"cloudflow-service-hr", "cloudflow-service-oa", "cloudflow-service-crm"})
    public void content(@PathVariable long taskId, @RequestParam(defaultValue = "false") boolean errorFile,
                        HttpServletResponse response) throws IOException {
        response.setContentType("application/octet-stream");
        response.setHeader("Cache-Control", "private, no-store");
        response.setHeader("X-Content-Type-Options", "nosniff");
        files.copy(taskId, errorFile, response.getOutputStream());
    }

    @DeleteMapping("/{taskId}/errors")
    @Inner(allowedServices = {"cloudflow-service-hr", "cloudflow-service-oa", "cloudflow-service-crm"})
    public R<Void> clearErrors(@PathVariable long taskId, @RequestParam(required = false) Long jobLogId) {
        files.clearError(taskId, jobLogId);
        return R.ok();
    }

    @DeleteMapping("/{taskId}/original")
    @Inner(allowedServices = {"cloudflow-service-hr", "cloudflow-service-oa", "cloudflow-service-crm"})
    public R<Void> clearOriginal(@PathVariable long taskId, @RequestParam Long jobLogId) {
        files.clearCompletedOriginal(taskId, jobLogId);
        return R.ok();
    }
}
