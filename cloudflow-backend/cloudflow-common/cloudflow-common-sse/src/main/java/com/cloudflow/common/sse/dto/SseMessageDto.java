package com.cloudflow.common.sse.dto;

import lombok.Data;

import java.io.Serializable;
import java.util.List;

/**
 * SSE 消息传输对象
 * 用于在微服务实例间通过 Redis 广播 SSE 消息
 *
 * @author CloudFlow
 */
@Data
public class SseMessageDto implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 消息接收者的用户 ID 列表
     * 为空表示广播给所有在线用户
     */
    private List<Long> userIds;

    /**
     * 消息内容
     */
    private String message;
}
