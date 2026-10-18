package com.cloudflow.auth.preview;

import org.springframework.cloud.openfeign.FeignClient;

@FeignClient(name = "cloudflow-service-hr", contextId = "filePreviewHr", path = "/inner/hr/file-preview", configuration = FilePreviewFeignConfiguration.class)
public interface HrFilePreviewClient extends FilePreviewRemoteApi { }
