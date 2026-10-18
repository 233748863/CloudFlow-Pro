package com.cloudflow.auth.preview;

import org.springframework.cloud.openfeign.FeignClient;

@FeignClient(name = "cloudflow-service-workflow", contextId = "filePreviewWorkflow", path = "/inner/workflow/file-preview", configuration = FilePreviewFeignConfiguration.class)
public interface WorkflowFilePreviewClient extends FilePreviewRemoteApi { }
