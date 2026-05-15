package com.cloudflow.common.sse.controller;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.sse.core.SseEmitterManager;
import cn.dev33.satoken.annotation.SaCheckLogin;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * SSE 连接控制器
 * 提供 SSE 连接建立和断开的 REST 接口
 *
 * 前端使用示例：
 * const eventSource = new EventSource('/sse/connect?userId=1');
 * eventSource.addEventListener('message', (event) => { console.log(event.data); });
 * eventSource.addEventListener('connected', (event) => { console.log('已连接'); });
 *
 * @author CloudFlow
 */
@RestController
@RequestMapping("/sse")
@RequiredArgsConstructor
@SaCheckLogin
public class SseController {

    private final SseEmitterManager sseEmitterManager;

    /**
     * 建立 SSE 连接
     *
     * @return SseEmitter 实例
     */
    @GetMapping("/connect")
    public SseEmitter connect() {
        Long userId = UserContext.getUserId();
        if (userId == null) {
            throw new IllegalStateException("SSE 连接失败");
        }
        return sseEmitterManager.connect(userId);
    }

    /**
     * 断开 SSE 连接
     *
     */
    @GetMapping("/disconnect")
    public void disconnect() {
        Long userId = UserContext.getUserId();
        if (userId == null) {
            return;
        }
        sseEmitterManager.disconnect(userId);
    }
}
