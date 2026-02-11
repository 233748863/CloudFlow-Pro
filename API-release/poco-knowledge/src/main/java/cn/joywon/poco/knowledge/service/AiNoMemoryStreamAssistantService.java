package cn.joywon.poco.knowledge.service;

import dev.langchain4j.service.UserMessage;
import reactor.core.publisher.Flux;

/**
 * AI 流助手服务
 *
 * @author poco
 * @date 2024/09/27
 */
public interface AiNoMemoryStreamAssistantService {

    /**
     * 聊天总结
     *
     * @param userMessage 用户消息
     * @return {@link Flux }<{@link String }>
     */
    Flux<String> chat(@UserMessage String userMessage);

}
