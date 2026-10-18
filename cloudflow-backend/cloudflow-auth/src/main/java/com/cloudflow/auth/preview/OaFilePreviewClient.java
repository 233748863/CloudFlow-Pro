package com.cloudflow.auth.preview;

import com.cloudflow.common.core.file.FilePreviewRequest;
import feign.Response;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@FeignClient(name = "cloudflow-service-oa", contextId = "filePreviewOa", path = "/inner/oa/file-preview", configuration = FilePreviewFeignConfiguration.class)
public interface OaFilePreviewClient extends FilePreviewRemoteApi {
    @PostMapping("/content")
    Response content(@RequestBody FilePreviewRequest request);

    @PostMapping("/download-content")
    Response downloadContent(@RequestBody FilePreviewRequest request);
}
