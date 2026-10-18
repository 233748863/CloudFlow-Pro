package com.cloudflow.crm.service.remote;

import com.cloudflow.common.core.domain.PortalFinanceAttachment;
import com.cloudflow.common.core.domain.R;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@FeignClient(name = "cloudflow-auth", path = "/inner/auth/finance-files", contextId = "crmFinanceFiles")
public interface RemoteFinanceFileService {
    @PostMapping(value = "/{kind}/{id}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    R<PortalFinanceAttachment> upload(@PathVariable("kind") String kind, @PathVariable("id") Long id, @RequestPart("file") MultipartFile file);
}
