package com.cloudflow.workflow.service.remote;

import com.cloudflow.common.core.domain.R;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cloud.openfeign.FallbackFactory;
import org.springframework.stereotype.Component;

import java.util.Collections;
import java.util.List;
import java.util.Map;

@Slf4j
@Component
public class RemoteUserFallbackFactory implements FallbackFactory<RemoteUserService> {

    @Override
    public RemoteUserService create(Throwable cause) {
        return new RemoteUserService() {
            @Override
            public R<Map<String, Object>> getUser(Long userId) {
                log.warn("auth user fallback, userId={}", userId, cause);
                return R.fail("auth user service unavailable");
            }

            @Override
            public R<List<Map<String, Object>>> batchGetUsers(List<Long> userIds) {
                log.warn("auth batch user fallback, size={}", userIds == null ? 0 : userIds.size(), cause);
                return R.ok(Collections.emptyList());
            }
        };
    }
}
