package cn.joywon.poco.knowledge.service;

import dev.langchain4j.service.MemoryId;
import dev.langchain4j.service.SystemMessage;
import dev.langchain4j.service.UserMessage;
import dev.langchain4j.service.V;
import reactor.core.publisher.Flux;

/**
 * AI 流助手服务
 *
 * @author poco
 * @date 2024/09/27
 */
public interface AiStreamAssistantService {

    /**
     * 流式聊天
     *
     * @param memoryId    内存 ID
     * @param userMessage 用户消息
     * @return {@link Flux }<{@link String }>
     */
    @SystemMessage("{{systemMessage}}")
    Flux<String> chat(@MemoryId String memoryId, @V("systemMessage") String systemMessage, @UserMessage String userMessage);


    /**
     * 聊天
     *
     * @param memoryId    记忆id
     * @param userMessage 用户消息
     * @return {@link Flux }<{@link String }>
     */
    Flux<String> chat(@MemoryId String memoryId, @UserMessage String userMessage);

}
