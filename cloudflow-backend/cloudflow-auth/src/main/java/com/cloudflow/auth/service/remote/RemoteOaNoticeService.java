package com.cloudflow.auth.service.remote;

import com.cloudflow.common.core.domain.R;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@FeignClient(
        name = "cloudflow-service-oa",
        contextId = "authRemoteOaNoticeService",
        fallbackFactory = RemoteOaNoticeFallbackFactory.class
)
public interface RemoteOaNoticeService {

    @PostMapping("/oa/inner/notice/send")
    R<Void> sendNotice(@RequestBody NoticeSendRequest request);
}
