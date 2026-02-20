package com.cloudflow.common.sse.controller;

import com.cloudflow.common.sse.core.SseEmitterManager;
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
public class SseController {

    private final SseEmitterManager sseEmitterManager;

    /**
     * 建立 SSE 连接
     *
     * @param userId 用户 ID
     * @return SseEmitter 实例
     */
    @GetMapping("/connect")
    public SseEmitter connect(@RequestParam Long userId) {
        return sseEmitterManager.connect(userId);
    }

    /**
     * 断开 SSE 连接
     *
     * @param userId 用户 ID
     */
    @GetMapping("/disconnect")
    public void disconnect(@RequestParam Long userId) {
        sseEmitterManager.disconnect(userId);
    }
}
