package com.cloudflow.workflow.service.remote;

import com.cloudflow.common.core.domain.R;
import feign.Response;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.multipart.MultipartFile;

import java.util.Map;

@FeignClient(name = "cloudflow-auth", path = "/inner/auth/workflow-form-files", contextId = "workflowFormFiles")
public interface RemoteWorkflowFormFileService {
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    R<Map<String, Object>> upload(@RequestPart("file") MultipartFile file,
                                 @RequestParam("definitionId") String definitionId,
                                 @RequestParam(value = "instanceId", required = false) String instanceId,
                                 @RequestParam("fieldPath") String fieldPath);

    @GetMapping("/{fileId}/content")
    Response content(@PathVariable("fileId") Long fileId);
}
