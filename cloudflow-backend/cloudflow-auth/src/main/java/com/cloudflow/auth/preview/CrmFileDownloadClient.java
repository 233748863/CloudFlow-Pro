package com.cloudflow.auth.preview;

import com.cloudflow.common.core.file.FilePreviewRequest;
import feign.Response;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@FeignClient(name = "cloudflow-service-crm", contextId = "fileDownloadCrm", path = "/inner/crm/file-download", configuration = FilePreviewFeignConfiguration.class)
public interface CrmFileDownloadClient extends FilePreviewRemoteApi {
    @PostMapping("/content")
    Response content(@RequestBody FilePreviewRequest request);
}
