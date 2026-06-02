package com.cloudflow.auth.service.remote;

import com.cloudflow.common.core.domain.R;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cloud.openfeign.FallbackFactory;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class RemoteOaNoticeFallbackFactory implements FallbackFactory<RemoteOaNoticeService> {

    @Override
    public RemoteOaNoticeService create(Throwable cause) {
        return request -> {
            log.warn("发送 OA 站内信失败, recipientId={}, title={}",
                    request != null ? request.getRecipientId() : null,
                    request != null ? request.getTitle() : null,
                    cause);
            return R.fail("OA 通知服务暂不可用");
        };
    }
}
