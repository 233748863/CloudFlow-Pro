package com.cloudflow.workflow.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import cn.dev33.satoken.annotation.SaMode;
import cn.dev33.satoken.stp.StpUtil;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.ratelimiter.annotation.RateLimiter;
import com.cloudflow.common.ratelimiter.enums.LimitType;
import com.cloudflow.workflow.service.WorkflowFormFileService;
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
@RequestMapping("/wf/form-files")
@RequiredArgsConstructor
public class WorkflowFormFileController {
    private final WorkflowFormFileService files;

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @SaCheckPermission(value = {"workflow:process:start", "workflow:task:complete"}, mode = SaMode.OR)
    @RepeatSubmit.Disabled
    @RateLimiter(time = 60, count = 30, limitType = LimitType.USER)
    @SysLog(value = "上传流程字段附件", logParams = false)
    public R<Map<String, Object>> upload(@RequestPart("file") MultipartFile file, @RequestParam(required = false) String definitionId,
                                         @RequestParam(required = false) String instanceId, @RequestParam(required = false) String taskId,
                                         @RequestParam String fieldPath) {
        StpUtil.checkPermission(instanceId == null ? "workflow:process:start" : "workflow:task:complete");
        return R.ok(files.upload(file, definitionId, instanceId, taskId, fieldPath));
    }

    @GetMapping("/{fileId}")
    @SaCheckPermission(value = {"workflow:form:view", "workflow:process:start", "workflow:process:view"}, mode = SaMode.OR)
    public R<Map<String, Object>> metadata(@PathVariable Long fileId, @RequestParam(required = false) String definitionId,
                                           @RequestParam(required = false) String instanceId, @RequestParam(required = false) String taskId,
                                           @RequestParam String fieldPath) {
        return R.ok(files.metadata(fileId, definitionId, instanceId, taskId, fieldPath));
    }

    @GetMapping("/{fileId}/content")
    @SaCheckPermission(value = {"workflow:form:view", "workflow:process:start", "workflow:process:view"}, mode = SaMode.OR)
    @SysLog(value = "下载流程字段附件", logParams = false)
    public void content(@PathVariable Long fileId, @RequestParam(required = false) String definitionId,
                        @RequestParam(required = false) String instanceId, @RequestParam(required = false) String taskId,
                        @RequestParam String fieldPath, HttpServletResponse response) {
        files.download(fileId, definitionId, instanceId, taskId, fieldPath, response);
    }
}
