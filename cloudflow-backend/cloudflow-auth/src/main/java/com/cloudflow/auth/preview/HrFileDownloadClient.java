package com.cloudflow.auth.preview;

import com.cloudflow.common.core.file.FilePreviewRequest;
import feign.Response;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@FeignClient(name = "cloudflow-service-hr", contextId = "fileDownloadHr", path = "/inner/hr/file-download", configuration = FilePreviewFeignConfiguration.class)
public interface HrFileDownloadClient extends FilePreviewRemoteApi {
    @PostMapping("/content")
    Response content(@RequestBody FilePreviewRequest request);
}
