package com.cloudflow.oa.config;

import com.cloudflow.common.security.core.TokenService;
import com.cloudflow.common.security.websocket.AbstractTokenHandshakeInterceptor;
import org.springframework.stereotype.Component;

/**
 * OA 通知 WebSocket 握手鉴权器（P2-3：继承 cloudflow-common-security 抽象模板）
 *
 * 业务定制：仅模块名，鉴权与伪造 userId 拦截已在父类统一处理。
 */
@Component
public class NotificationAuthHandshakeInterceptor extends AbstractTokenHandshakeInterceptor {

    public NotificationAuthHandshakeInterceptor(TokenService tokenService) {
        super(tokenService);
    }

    @Override
    protected String moduleName() {
        return "OA WebSocket";
    }
}
