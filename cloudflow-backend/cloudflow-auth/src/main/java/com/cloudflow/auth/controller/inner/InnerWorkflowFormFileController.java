package com.cloudflow.auth.controller.inner;

import com.cloudflow.auth.domain.SysFile;
import com.cloudflow.auth.service.ISysFileService;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.security.annotation.Inner;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.Map;

@RestController
@RequestMapping("/inner/auth/workflow-form-files")
@RequiredArgsConstructor
public class InnerWorkflowFormFileController {
    private final ISysFileService files;

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Inner(allowedServices = "cloudflow-service-workflow")
    @RepeatSubmit.Disabled
    public R<Map<String, Object>> upload(@RequestPart("file") MultipartFile file,
                                        @RequestParam String definitionId, @RequestParam(required = false) String instanceId,
                                        @RequestParam String fieldPath) {
        SysFile stored = files.uploadWorkflowFormFile(file, definitionId, instanceId, fieldPath);
        return R.ok(Map.of("fileId", String.valueOf(stored.getFileId()), "fileName", stored.getFileName(),
                "size", stored.getFileSize(), "extension", stored.getFileType()));
    }

    @GetMapping("/{fileId}/content")
    @Inner(allowedServices = "cloudflow-service-workflow")
    public void content(@PathVariable Long fileId, HttpServletResponse response) { files.copyWorkflowFormFile(fileId, response); }
}
